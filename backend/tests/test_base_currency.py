"""Base-currency change + recompute tests (Story 3.9, FR-CU-005).

Mirrors `test_currency.py`'s self-contained temp-DB harness (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `POST
/api/household/base-currency` is a mutating, non-exempt, owner-only route, so requests carry the
session cookie **and** the `X-CSRF-Token` header. Covers: rate re-basing + `is_base` flip + the
`BASE_CURRENCY_CHANGED` alert, the synchronous event recompute (historical-rate derivation + the
current-rate fallback + the new-base-currency event), and the owner/unknown/already-base/zero-event
guards.
"""

import tempfile
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.currency import Currency, FxRateHistory
from backend.models.event import FinancialEvent
from backend.models.identity import Household, Person
from backend.models.system import Alert
from backend.rate_limit import limiter
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "base_currency_test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return engine, factory


def _client_with_db(factory, monkeypatch) -> TestClient:
    app = create_app()

    async def _override_get_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db
    monkeypatch.setattr("backend.middleware.async_session_factory", factory)
    return TestClient(app)


async def _seed(
    factory, *, role: str = "owner", rates: dict[str, str] | None = None
) -> tuple[str, str]:
    """Household + a Person (default owner) + base SGD and the given non-base currencies (code →
    rate_to_base). Returns (person_id, household_id)."""
    rates = rates or {"NZD": "0.88", "USD": "1.35"}
    hh_id = str(uuid4())
    person_id = str(uuid4())
    async with factory() as db:
        db.add(Household(id=hh_id, name="Acme", base_currency="SGD", created_by=person_id))
        await db.flush()
        db.add(
            Person(
                id=person_id,
                household_id=hh_id,
                email=f"{uuid4()}@example.com",
                display_name="Owner",
                role=role,
                google_sub=f"sub-{uuid4()}",
            )
        )
        db.add(
            Currency(
                household_id=hh_id, code="SGD", name="SGD", symbol="S$", is_base=True,
                is_display_active=True, rate_to_base=Decimal("1.0"), fee_pct=Decimal("0"),
            )
        )
        for code, rate in rates.items():
            db.add(
                Currency(
                    household_id=hh_id, code=code, name=code, symbol=code, is_base=False,
                    is_display_active=True, rate_to_base=Decimal(rate), fee_pct=Decimal("0"),
                    # A real (fetched) rate — the base-change guard rejects last_rate_at=None.
                    last_rate_at=datetime.now(UTC),
                )
            )
        await db.commit()
    return person_id, hh_id


async def _seed_session(factory, person_id: str) -> tuple[str, str]:
    async with factory() as db:
        session = await auth.create_session(
            db, await db.get(Person, person_id), ip="127.0.0.1", user_agent="pytest"
        )
        await db.commit()
        return session.id, session.csrf_token


def _auth(client: TestClient, sid: str, csrf: str) -> None:
    client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
    client.headers["X-CSRF-Token"] = csrf


async def _currencies(factory, hh_id: str) -> dict[str, Currency]:
    async with factory() as db:
        rows = (
            await db.execute(select(Currency).where(Currency.household_id == hh_id))
        ).scalars().all()
        return {c.code: c for c in rows}


# ── Rate re-basing + flag flip + alert ──


async def test_change_base_currency_rebases_and_flips(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/base-currency", json={"baseCurrency": "nzd"})
        assert resp.status_code == 200
        assert resp.json()["baseCurrency"] == "NZD"

        by_code = await _currencies(factory, hh_id)
        assert by_code["NZD"].is_base is True
        assert by_code["NZD"].rate_to_base == Decimal("1.000000")
        assert by_code["SGD"].is_base is False
        # Rates re-base to the new currency, quantized to Numeric(10,6). SGD → NZD = 1 / 0.88.
        assert by_code["SGD"].rate_to_base == (Decimal("1.0") / Decimal("0.88")).quantize(
            Decimal("0.000001")
        )
        # USD → NZD = 1.35 / 0.88
        assert by_code["USD"].rate_to_base == (Decimal("1.35") / Decimal("0.88")).quantize(
            Decimal("0.000001")
        )

        async with factory() as db:
            alert = await db.scalar(
                select(Alert).where(
                    Alert.household_id == hh_id, Alert.alert_type == "BASE_CURRENCY_CHANGED"
                )
            )
            assert alert is not None
    finally:
        await engine.dispose()


# ── Synchronous recompute ──


async def test_change_base_currency_recomputes_events(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed(factory)
        sid, csrf = await _seed_session(factory, person_id)

        d1, d2 = date(2026, 6, 1), date(2026, 6, 2)
        by_code = await _currencies(factory, hh_id)
        async with factory() as db:
            # Historical rows (relative to the OLD base SGD) for D1 only.
            db.add(FxRateHistory(currency_id=by_code["USD"].id, rate_date=d1,
                                 rate_to_base=Decimal("1.40"), source="test"))
            db.add(FxRateHistory(currency_id=by_code["NZD"].id, rate_date=d1,
                                 rate_to_base=Decimal("0.90"), source="test"))

            def _ev(code, amount, ev_date):
                amt = Decimal(amount)
                # STI subtypes ("transaction" etc.) arrive in Epic 5; use the registered base
                # polymorphic_identity so `select(FinancialEvent)` can load the rows here.
                return FinancialEvent(
                    household_id=hh_id, created_by=person_id, event_type="financial_event",
                    name=f"{code} txn", event_date=ev_date, currency=code, amount=amt,
                    fx_rate=Decimal("1"), amount_base_calculated=amt, amount_base=amt,
                )

            db.add(_ev("NZD", "100", d1))  # becomes the new base
            db.add(_ev("USD", "100", d1))  # historical USD/NZD on d1
            db.add(_ev("USD", "100", d2))  # no history → current-rate fallback
            db.add(_ev("SGD", "100", d2))  # old base, no history → current-rate fallback
            await db.commit()

        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        resp = client.post("/api/household/base-currency", json={"baseCurrency": "NZD"})
        assert resp.status_code == 200

        async with factory() as db:
            events = {
                (e.currency, e.event_date): e
                for e in (
                    await db.execute(
                        select(FinancialEvent).where(FinancialEvent.household_id == hh_id)
                    )
                ).scalars().all()
            }
        # The new-base event: rate 1, base == amount, no FX date.
        nzd = events[("NZD", d1)]
        assert nzd.fx_rate == Decimal("1.000000")
        assert nzd.amount_base == Decimal("100")
        assert nzd.fx_delta == Decimal("0")
        assert nzd.fx_rate_date is None

        q4 = Decimal("0.0001")
        q6 = Decimal("0.000001")

        # USD on d1 — historical: 1.40 / 0.90 = 1.5556 → base = 100 × that.
        usd1 = events[("USD", d1)]
        expected = (Decimal("100") * (Decimal("1.40") / Decimal("0.90"))).quantize(q4)
        assert usd1.amount_base_calculated == expected
        assert usd1.amount_base == expected
        assert usd1.fx_rate_date == d1

        # USD on d2 — no history → re-based current USD rate (1.35 / 0.88, 6dp).
        usd2 = events[("USD", d2)]
        cur_rate = (Decimal("1.35") / Decimal("0.88")).quantize(q6)
        assert usd2.amount_base_calculated == (Decimal("100") * cur_rate).quantize(q4)

        # SGD on d2 — old base, no history → re-based current SGD rate (1 / 0.88, 6dp).
        sgd2 = events[("SGD", d2)]
        sgd_rate = (Decimal("1.0") / Decimal("0.88")).quantize(q6)
        assert sgd2.amount_base_calculated == (Decimal("100") * sgd_rate).quantize(q4)
    finally:
        await engine.dispose()


# ── Guards ──


async def test_non_owner_cannot_change_base_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed(factory, role="admin")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/base-currency", json={"baseCurrency": "NZD"})
        assert resp.status_code == 403
    finally:
        await engine.dispose()


async def test_unknown_currency_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/base-currency", json={"baseCurrency": "JPY"})
        assert resp.status_code == 404
    finally:
        await engine.dispose()


async def test_already_base_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/base-currency", json={"baseCurrency": "SGD"})
        assert resp.status_code == 400
    finally:
        await engine.dispose()


async def test_never_fetched_currency_400(monkeypatch):
    """A currency with the placeholder rate (last_rate_at=None) is rejected — re-basing by a
    placeholder would silently mislabel every other currency (review patch)."""
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed(factory)
        # Add a brand-new currency the FX job has never touched (placeholder rate, no last_rate_at).
        async with factory() as db:
            db.add(
                Currency(
                    household_id=hh_id, code="JPY", name="JPY", symbol="¥", is_base=False,
                    is_display_active=True, rate_to_base=Decimal("1.0"), fee_pct=Decimal("0"),
                )
            )
            await db.commit()
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/base-currency", json={"baseCurrency": "JPY"})
        assert resp.status_code == 400
        # Base unchanged.
        async with factory() as db:
            assert (await db.get(Household, hh_id)).base_currency == "SGD"
    finally:
        await engine.dispose()


async def test_zero_event_household_changes_cleanly(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/base-currency", json={"baseCurrency": "USD"})
        assert resp.status_code == 200
        assert resp.json()["baseCurrency"] == "USD"
        async with factory() as db:
            assert (await db.get(Household, hh_id)).base_currency == "USD"
    finally:
        await engine.dispose()
