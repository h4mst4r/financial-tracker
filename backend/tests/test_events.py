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


async def _seed_txns(factory, hh_id: str, person_id: str, specs: list[dict]) -> None:
    """Bulk-insert transactions directly (fast — no HTTP) for the list/sort/pagination tests. Each
    spec may set event_date/amount/amount_base/type/name/status/gst; the rest use sane defaults."""
    async with factory() as db:
        for i, s in enumerate(specs):
            amt = Decimal(s.get("amount", "10"))
            base = Decimal(s.get("amount_base", str(amt)))
            db.add(
                FinancialEvent(
                    household_id=hh_id,
                    created_by=person_id,
                    status="active",
                    event_type="transaction",
                    transaction_status=s.get("status", "completed"),
                    source="manual",
                    name=s.get("name", f"T{i}"),
                    event_date=date.fromisoformat(s["event_date"]),
                    transaction_type=s.get("type", "outflow"),
                    category_id=s.get("category_id"),
                    payee_person_id=s.get("payee_person_id"),
                    currency="SGD",
                    amount=amt,
                    fx_rate=Decimal("1"),
                    amount_base_calculated=base,
                    amount_base=base,
                    fx_delta=Decimal("0"),
                    is_shared_expense=False,
                    is_gst_claimable=s.get("gst", False),
                    reconciled=s.get("reconciled"),
                )
            )
        await db.commit()


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


# ── Story 5.2: server-side filters ──


async def test_list_filters(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        cat = await _seed_category(factory, hh_id, person_id)
        await _seed_txns(
            factory,
            hh_id,
            person_id,
            [
                {
                    "name": "Lunch",
                    "event_date": "2026-06-01",
                    "type": "outflow",
                    "category_id": cat,
                },
                {"name": "Salary", "event_date": "2026-06-15", "type": "inflow", "gst": True},
                {
                    "name": "Dinner",
                    "event_date": "2026-07-01",
                    "type": "outflow",
                    "reconciled": True,
                },
            ],
        )
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        def names(params: str) -> set[str]:
            body = client.get(f"/api/events?{params}").json()
            return {i["name"] for i in body["items"]}

        assert names("search=din") == {"Dinner"}
        assert names("type=inflow") == {"Salary"}
        assert names("type=outflow") == {"Lunch", "Dinner"}
        assert names(f"category_id={cat}") == {"Lunch"}
        assert names("gst=true") == {"Salary"}
        assert names("reconciled=true") == {"Dinner"}
        assert names("date_start=2026-06-10&date_end=2026-06-30") == {"Salary"}
    finally:
        await engine.dispose()


async def test_reconciled_filter_includes_null_as_unreconciled(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_txns(
            factory,
            hh_id,
            person_id,
            [
                {"name": "Recon", "event_date": "2026-06-01", "reconciled": True},
                {"name": "Unrecon", "event_date": "2026-06-02", "reconciled": False},
                {"name": "Never", "event_date": "2026-06-03"},  # reconciled = NULL (default)
            ],
        )
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        def names(params: str) -> set[str]:
            return {i["name"] for i in client.get(f"/api/events?{params}").json()["items"]}

        assert names("reconciled=true") == {"Recon"}
        # "Unreconciled" must include the never-reconciled (NULL) row, not just explicit False.
        assert names("reconciled=false") == {"Unrecon", "Never"}
    finally:
        await engine.dispose()


# ── Story 5.2: sort ──


async def test_list_sort(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_txns(
            factory,
            hh_id,
            person_id,
            [
                {"name": "A", "event_date": "2026-06-01", "amount": "30"},
                {"name": "B", "event_date": "2026-06-02", "amount": "10"},
                {"name": "C", "event_date": "2026-06-03", "amount": "20"},
            ],
        )
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        def order(params: str) -> list[str]:
            return [i["name"] for i in client.get(f"/api/events?{params}").json()["items"]]

        assert order("sort=amount:asc") == ["B", "C", "A"]
        assert order("sort=amount:desc") == ["A", "C", "B"]
        assert order("sort=event_date:asc") == ["A", "B", "C"]
        assert order("sort=event_date:desc") == ["C", "B", "A"]
        # Unknown sort column → default (event_date desc), no 500.
        assert order("sort=bogus") == ["C", "B", "A"]
    finally:
        await engine.dispose()


# ── Story 5.2: keyset pagination ──


async def test_list_keyset_pagination(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_txns(
            factory,
            hh_id,
            person_id,
            [{"name": f"T{i}", "event_date": f"2026-06-0{i}"} for i in range(1, 6)],
        )
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        seen: list[str] = []
        cursor = None
        pages = 0
        while True:
            url = "/api/events?sort=event_date:asc&limit=2"
            if cursor:
                url += f"&cursor={cursor}"
            body = client.get(url).json()
            assert body["total"] == 5  # total is the full filtered count, not the page size
            assert len(body["items"]) <= 2
            seen.extend(i["id"] for i in body["items"])
            cursor = body["next_cursor"]
            pages += 1
            if cursor is None:
                break
            assert pages < 10  # guard against a non-terminating cursor
        # 5 rows / 2 per page = 3 pages, no overlap, all rows seen exactly once.
        assert pages == 3
        assert len(seen) == 5
        assert len(set(seen)) == 5
    finally:
        await engine.dispose()


async def test_list_keyset_stable_under_insert(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_txns(
            factory,
            hh_id,
            person_id,
            [{"name": f"T{i}", "event_date": f"2026-06-0{i}"} for i in range(1, 5)],
        )
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        page1 = client.get("/api/events?sort=event_date:desc&limit=2").json()
        page1_ids = {i["id"] for i in page1["items"]}
        # A concurrent insert with an OLD date lands on a later page — it must not shift page 1.
        await _seed_txns(factory, hh_id, person_id, [{"name": "Older", "event_date": "2026-05-01"}])
        page2 = client.get(
            f"/api/events?sort=event_date:desc&limit=2&cursor={page1['next_cursor']}"
        ).json()
        page2_ids = {i["id"] for i in page2["items"]}
        assert page1_ids.isdisjoint(page2_ids)  # keyset never re-serves a page-1 row
    finally:
        await engine.dispose()


async def test_list_limit_cap(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        # 201 rows → an over-cap limit must clamp to 200 (and expose a next_cursor).
        await _seed_txns(
            factory,
            hh_id,
            person_id,
            [
                {"name": f"T{i}", "event_date": "2026-06-01", "amount": str(i + 1)}
                for i in range(201)
            ],
        )
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        body = client.get("/api/events?limit=9999").json()
        assert body["total"] == 201
        assert len(body["items"]) == 200  # clamped
        assert body["next_cursor"] is not None
    finally:
        await engine.dispose()


# ── Story 5.2: server summary reflects the filtered set ──


async def test_summary_reflects_filter(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_txns(
            factory,
            hh_id,
            person_id,
            [
                {"name": "O1", "event_date": "2026-06-01", "type": "outflow", "amount_base": "10"},
                {"name": "O2", "event_date": "2026-06-02", "type": "outflow", "amount_base": "20"},
                {"name": "I1", "event_date": "2026-06-03", "type": "inflow", "amount_base": "100"},
            ],
        )
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        full = client.get("/api/events").json()
        assert Decimal(str(full["summary"]["out"])) == Decimal("30")
        assert Decimal(str(full["summary"]["inflow"])) == Decimal("100")

        inflow_only = client.get("/api/events?type=inflow").json()
        assert inflow_only["total"] == 1
        assert Decimal(str(inflow_only["summary"]["out"])) == Decimal("0")
        assert Decimal(str(inflow_only["summary"]["inflow"])) == Decimal("100")
    finally:
        await engine.dispose()


async def test_summary_zero_for_other_household(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_txns(factory, hh_id, person_id, [{"name": "X", "event_date": "2026-06-01"}])
        other_person_id, _ = await _seed_household(factory)
        osid, ocsrf = await _seed_session(factory, other_person_id)
        other = _client_with_db(factory, monkeypatch)
        _auth(other, osid, ocsrf)

        body = other.get("/api/events").json()
        assert body["total"] == 0
        assert Decimal(str(body["summary"]["out"])) == Decimal("0")
        assert Decimal(str(body["summary"]["inflow"])) == Decimal("0")
    finally:
        await engine.dispose()
