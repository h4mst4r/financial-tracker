"""Transaction create/read tests (Story 5.1): manual create + FX spot fill + manual override +
base-currency collapse + Cash account-null + any-member permission + household scoping.

Mirrors `test_accounts.py`: self-contained temp-DB engines (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `/api/events` POST is a
mutating, non-exempt route, so requests carry the session cookie **and** the `X-CSRF-Token` header.
Unlike accounts, `POST /api/events` is **any-member** (no admin gate) — asserted explicitly.
"""

import tempfile
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.account import Account
from backend.models.base import Base
from backend.models.budget import Category
from backend.models.currency import Currency
from backend.models.event import FinancialEvent
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
    db_path = Path(tmp_dir) / "event_test.db"
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


async def _seed_household(factory, *, role: str = "member") -> tuple[str, str]:
    """Insert a Household + a Person (default role **member** — transactions are any-member) + the
    base SGD currency. Returns (person_id, household_id)."""
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
                display_name="Member Person",
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
                rate_to_base=Decimal("1.0"),
            )
        )
        await db.commit()
    return person_id, hh_id


async def _seed_currency(factory, hh_id: str, code: str, *, rate: str) -> None:
    """Add a non-base currency to `hh_id` (rate_to_base = SGD per 1 unit of `code`)."""
    async with factory() as db:
        db.add(
            Currency(
                household_id=hh_id,
                code=code,
                name=code,
                symbol=code,
                is_base=False,
                rate_to_base=Decimal(rate),
            )
        )
        await db.commit()


async def _seed_account(factory, hh_id: str, person_id: str, *, currency: str = "SGD") -> str:
    """Seed a minimal bank account for the 'Paid with' tests."""
    aid = str(uuid4())
    async with factory() as db:
        db.add(
            Account(
                id=aid,
                household_id=hh_id,
                created_by=person_id,
                account_type="bank",
                name="DBS",
                currency=currency,
                status="active",
                opening_balance=Decimal("0"),
                opening_balance_date=date(2026, 1, 1),
            )
        )
        await db.commit()
    return aid


async def _seed_category(factory, hh_id: str, person_id: str) -> str:
    """Seed a minimal category (for the cross-household FK-rejection test)."""
    cid = str(uuid4())
    async with factory() as db:
        db.add(
            Category(
                id=cid,
                household_id=hh_id,
                created_by=person_id,
                name="Groceries",
                color="#22c55e",
                category_type="expense",
                status="active",
            )
        )
        await db.commit()
    return cid


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


def _txn(**over) -> dict:
    return {
        "name": "Lunch",
        "event_date": "2026-06-10",
        "transaction_type": "outflow",
        "currency": "SGD",
        "amount": "20.00",
        **over,
    }


# ── Create: base currency ──


async def test_create_base_currency_transaction(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/events", json=_txn())
        assert resp.status_code == 201
        body = resp.json()
        assert body["event_type"] == "transaction"
        assert body["transaction_status"] == "completed"
        assert body["source"] == "manual"
        assert body["status"] == "active"
        assert body["created_by"] == person_id
        assert Decimal(str(body["amount"])) == Decimal("20.0000")
        assert Decimal(str(body["amount_base"])) == Decimal("20.0000")
        assert Decimal(str(body["fx_rate"])) == Decimal("1")
        assert Decimal(str(body["fx_delta"])) == Decimal("0")
        assert body["fx_rate_date"] is None
        assert body["amount_base_source"] == "spot"

        # Round-trips via GET single + list.
        one = client.get(f"/api/events/{body['id']}")
        assert one.status_code == 200
        listing = client.get("/api/events")
        assert listing.json()["total"] == 1
    finally:
        await engine.dispose()


# ── Create: foreign spot fill ──


async def test_create_foreign_spot_fill(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_currency(factory, hh_id, "USD", rate="1.35")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(
            "/api/events", json=_txn(currency="USD", amount="100.00", event_date="2026-06-12")
        )
        assert resp.status_code == 201
        body = resp.json()
        # amount_base_calculated = 100 × 1.35 = 135
        assert Decimal(str(body["amount_base_calculated"])) == Decimal("135.0000")
        assert Decimal(str(body["amount_base"])) == Decimal("135.0000")
        assert Decimal(str(body["fx_rate"])) == Decimal("1.35")
        assert Decimal(str(body["fx_delta"])) == Decimal("0")
        assert body["fx_rate_date"] == "2026-06-12"
        assert body["amount_base_source"] == "spot"
    finally:
        await engine.dispose()


# ── Create: manual override ──


async def test_create_foreign_manual_override(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_currency(factory, hh_id, "USD", rate="1.35")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # Bank charged 138 SGD (more than the 135 spot) → forex loss, positive fx_delta.
        resp = client.post(
            "/api/events", json=_txn(currency="USD", amount="100.00", amount_base="138.00")
        )
        assert resp.status_code == 201
        body = resp.json()
        assert Decimal(str(body["amount_base_calculated"])) == Decimal("135.0000")
        assert Decimal(str(body["amount_base"])) == Decimal("138.0000")
        # fx_delta = calc − base = 135 − 138 = −3 (bank charged more than the API rate)
        assert Decimal(str(body["fx_delta"])) == Decimal("-3.0000")
        assert body["amount_base_source"] == "manual"
    finally:
        await engine.dispose()


# ── Cash nulls the account leg ──


async def test_cash_nulls_source_account(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        account_id = await _seed_account(factory, hh_id, person_id)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(
            "/api/events",
            json=_txn(payment_method="cash", source_account_id=account_id),
        )
        assert resp.status_code == 201
        assert resp.json()["source_account_id"] is None
    finally:
        await engine.dispose()


# ── inflow forces shared-expense False (DB CHECK) ──


async def test_inflow_forces_shared_expense_false(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # is_shared_expense defaults True; inflow must coerce it to False or the CHECK fails.
        resp = client.post(
            "/api/events", json=_txn(transaction_type="inflow", is_shared_expense=True)
        )
        assert resp.status_code == 201
        assert resp.json()["is_shared_expense"] is False
    finally:
        await engine.dispose()


# ── any member (non-admin) CAN create — the key contrast with accounts ──


async def test_member_can_create_transaction(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory, role="member")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/events", json=_txn())
        assert resp.status_code == 201  # no admin gate
    finally:
        await engine.dispose()


# ── Cross-household FK rejected; other household isolated ──


async def test_cross_household_payee_rejected(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        other_person_id, _ = await _seed_household(factory)  # a person in a different household
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/events", json=_txn(payee_person_id=other_person_id))
        assert resp.status_code == 404
        # Nothing persisted.
        async with factory() as db:
            count = (await db.execute(select(FinancialEvent))).scalars().all()
            assert count == []
    finally:
        await engine.dispose()


async def test_cross_household_category_rejected(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        other_person_id, other_hh = await _seed_household(factory)
        foreign_cat = await _seed_category(factory, other_hh, other_person_id)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/events", json=_txn(category_id=foreign_cat))
        assert resp.status_code == 404
    finally:
        await engine.dispose()


async def test_list_isolated_per_household(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        other_person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        client.post("/api/events", json=_txn())

        # The other household's member sees nothing.
        osid, ocsrf = await _seed_session(factory, other_person_id)
        other = _client_with_db(factory, monkeypatch)
        _auth(other, osid, ocsrf)
        assert other.get("/api/events").json()["total"] == 0
    finally:
        await engine.dispose()


# ── Unknown currency → 400 before any write ──


async def test_unknown_currency_rejected(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/events", json=_txn(currency="JPY"))
        assert resp.status_code == 400
    finally:
        await engine.dispose()


# ── Body-supplied household_id is ignored (scoping never trusts the body) ──


async def test_body_household_id_ignored(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/events", json=_txn(household_id="deadbeef-not-a-household"))
        assert resp.status_code == 201
        # The row is scoped to the session household, not the body value.
        async with factory() as db:
            row = (await db.execute(select(FinancialEvent))).scalar_one()
            assert row.household_id == hh_id
    finally:
        await engine.dispose()
