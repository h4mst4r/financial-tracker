"""Currency CRUD tests (Story 3.5): add ISO-4217 + display-active toggle + base invariants.

Mirrors `test_category.py`: self-contained temp-DB engines (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `/api/currencies`
POST/PATCH/DELETE are mutating, non-exempt routes, so requests carry the session cookie **and** the
`X-CSRF-Token` header. Each household is seeded with its base SGD currency (the single `is_base`
row, as the real household seed does). Covers: create (code uppercased, non-base, placeholder rate,
vivid), bad-code 400, duplicate-code 409, display-active toggle, base delete/edit guards, non-base
delete, cross-household 404, member-role 403.
"""

import tempfile
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.currency import Currency, FxRateHistory
from backend.models.identity import Household, Person
from backend.rate_limit import limiter
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "currency_test.db"
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


async def _seed_household(factory, *, role: str = "admin") -> tuple[str, str]:
    """Insert a Household + a Person + the base SGD Currency (the single `is_base` row). Returns
    (person_id, household_id)."""
    hh_id = str(uuid4())
    person_id = str(uuid4())
    async with factory() as db:
        db.add(
            Household(
                id=hh_id,
                name="Acme Household",
                base_currency="SGD",
                timezone="Asia/Singapore",
                created_by=person_id,
            )
        )
        await db.flush()
        db.add(
            Person(
                id=person_id,
                household_id=hh_id,
                email=f"{uuid4()}@example.com",
                display_name="Admin Person",
                role=role,
                google_sub=f"sub-{uuid4()}",
            )
        )
        db.add(
            Currency(
                household_id=hh_id,
                code="SGD",
                name="Singapore Dollar",
                symbol="S$",
                is_base=True,
                is_display_active=True,
                rate_to_base=Decimal("1.0"),
                fee_pct=Decimal("0"),
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


def _new(code: str, **over) -> dict:
    return {"code": code, "name": "Test Dollar", "symbol": "$", **over}


def _base_id(client: TestClient) -> str:
    """The seeded base SGD currency id."""
    items = client.get("/api/currencies").json()["items"]
    return next(c["id"] for c in items if c["is_base"])


# ── Create ──


async def test_create_currency_uppercases_and_defaults(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/currencies", json=_new("nzd", name="NZ Dollar"))
        assert resp.status_code == 201
        body = resp.json()
        assert body["code"] == "NZD"  # uppercased
        assert body["is_base"] is False
        assert body["is_display_active"] is True
        assert Decimal(str(body["rate_to_base"])) == Decimal("1.0")  # placeholder
        assert body["last_rate_at"] is None
        assert body["rate_source"] is None
        assert body["vivid"] is False
    finally:
        await engine.dispose()


async def test_create_currency_vivid_persists(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        created = client.post("/api/currencies", json=_new("USD", vivid=True)).json()
        assert created["vivid"] is True
        fetched = client.get(f"/api/currencies/{created['id']}").json()
        assert fetched["vivid"] is True
    finally:
        await engine.dispose()


async def test_create_bad_code_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        assert client.post("/api/currencies", json=_new("US")).status_code == 400
        resp = client.post("/api/currencies", json=_new("US1"))
        assert resp.status_code == 400
        assert resp.json()["status"] == 400  # RFC 7807
    finally:
        await engine.dispose()


async def test_create_duplicate_code_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        assert client.post("/api/currencies", json=_new("NZD")).status_code == 201
        resp = client.post("/api/currencies", json=_new("nzd"))  # case-insensitive (upper)
        assert resp.status_code == 409
        assert resp.json()["status"] == 409
    finally:
        await engine.dispose()


# ── Display-active toggle ──


async def test_toggle_display_active(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cur = client.post("/api/currencies", json=_new("NZD")).json()
        resp = client.patch(f"/api/currencies/{cur['id']}", json={"is_display_active": False})
        assert resp.status_code == 200
        assert resp.json()["is_display_active"] is False
    finally:
        await engine.dispose()


# ── Base invariants ──


async def test_cannot_delete_base_currency_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.delete(f"/api/currencies/{_base_id(client)}")
        assert resp.status_code == 400
        assert resp.json()["status"] == 400
    finally:
        await engine.dispose()


async def test_can_edit_base_metadata_but_not_is_base(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        base_id = _base_id(client)
        # is_base is not on CurrencyUpdate → Pydantic drops it; name still updates, base stays base.
        # is_display_active=false is ignored for the base (it is "always shown", AC2).
        resp = client.patch(
            f"/api/currencies/{base_id}",
            json={"name": "Sing Dollar", "is_base": False, "is_display_active": False},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Sing Dollar"
        assert body["is_base"] is True
        assert body["is_display_active"] is True  # base stays display-active
    finally:
        await engine.dispose()


async def test_exactly_one_base_after_adding(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        client.post("/api/currencies", json=_new("NZD"))
        client.post("/api/currencies", json=_new("USD"))
        items = client.get("/api/currencies").json()["items"]
        assert sum(1 for c in items if c["is_base"]) == 1
    finally:
        await engine.dispose()


async def test_delete_non_base_204(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cur = client.post("/api/currencies", json=_new("NZD")).json()
        assert client.delete(f"/api/currencies/{cur['id']}").status_code == 204
        ids = {c["id"] for c in client.get("/api/currencies").json()["items"]}
        assert cur["id"] not in ids
    finally:
        await engine.dispose()


# ── Scoping & role ──


async def test_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        a_person, _ = await _seed_household(factory)
        b_person, _ = await _seed_household(factory)
        a_sid, a_csrf = await _seed_session(factory, a_person)
        b_sid, b_csrf = await _seed_session(factory, b_person)

        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, a_sid, a_csrf)
        cur = client_a.post("/api/currencies", json=_new("NZD")).json()

        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, b_sid, b_csrf)
        assert client_b.get(f"/api/currencies/{cur['id']}").status_code == 404
        assert client_b.delete(f"/api/currencies/{cur['id']}").status_code == 404
    finally:
        await engine.dispose()


async def test_member_role_cannot_mutate_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory, role="member")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        assert client.post("/api/currencies", json=_new("NZD")).status_code == 403
        # but a member CAN list
        assert client.get("/api/currencies").status_code == 200
    finally:
        await engine.dispose()


# ── Conversion fee (Story 3.8 — fee_pct is the percentage number, stored as-is) ──


async def test_fee_pct_persists(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cur = client.post("/api/currencies", json=_new("NZD")).json()
        resp = client.patch(f"/api/currencies/{cur['id']}", json={"fee_pct": 1.5})
        assert resp.status_code == 200
        # Stored as the percentage number itself (no x100/÷100), ARCH §3.8 fee convention.
        assert Decimal(str(resp.json()["fee_pct"])) == Decimal("1.5")
        fetched = client.get(f"/api/currencies/{cur['id']}").json()
        assert Decimal(str(fetched["fee_pct"])) == Decimal("1.5")
    finally:
        await engine.dispose()


async def test_negative_fee_rejected_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cur = client.post("/api/currencies", json=_new("NZD")).json()
        resp = client.patch(f"/api/currencies/{cur['id']}", json={"fee_pct": -5})
        assert resp.status_code == 400
        assert resp.json()["status"] == 400  # RFC 7807
    finally:
        await engine.dispose()


async def test_member_cannot_set_fee_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        # An admin creates the currency; then a member of the SAME household tries to set the fee.
        admin_id, hh_id = await _seed_household(factory)
        a_sid, a_csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, a_sid, a_csrf)
        cur = client.post("/api/currencies", json=_new("NZD")).json()

        member_id = str(uuid4())
        async with factory() as db:
            db.add(
                Person(
                    id=member_id,
                    household_id=hh_id,
                    email=f"{uuid4()}@example.com",
                    display_name="Member Person",
                    role="member",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.commit()
        m_sid, m_csrf = await _seed_session(factory, member_id)
        client_m = _client_with_db(factory, monkeypatch)
        _auth(client_m, m_sid, m_csrf)
        resp = client_m.patch(f"/api/currencies/{cur['id']}", json={"fee_pct": 1.5})
        assert resp.status_code == 403
    finally:
        await engine.dispose()


# ── FX rate history embedded in the list (Story 3.8 — sparkline series) ──


async def _add_history(factory, currency_id: str, rates: list[float]) -> None:
    """Insert `len(rates)` consecutive daily FxRateHistory rows (oldest first)."""
    async with factory() as db:
        start = date.today() - timedelta(days=len(rates) - 1)
        for i, rate in enumerate(rates):
            db.add(
                FxRateHistory(
                    currency_id=currency_id,
                    rate_date=start + timedelta(days=i),
                    rate_to_base=Decimal(str(rate)),
                    source="test",
                )
            )
        await db.commit()


async def test_list_includes_rate_history(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        nzd = client.post("/api/currencies", json=_new("NZD")).json()
        # 14 days of history — only the most recent 12 should come back, oldest->newest.
        rates = [round(0.80 + i * 0.01, 6) for i in range(14)]
        await _add_history(factory, nzd["id"], rates)
        # A currency with NO history → empty series.
        client.post("/api/currencies", json=_new("USD"))

        items = client.get("/api/currencies").json()["items"]
        by_code = {c["code"]: c for c in items}
        assert by_code["NZD"]["rate_history"] == rates[-12:]
        assert by_code["USD"]["rate_history"] == []
        assert by_code["SGD"]["rate_history"] == []  # base, no history
    finally:
        await engine.dispose()
