"""Account CRUD tests (Story 4.1): subtype-adaptive create + STI discriminated-union response +
audited edit + vivid + household scoping + role gate.

Mirrors `test_category.py`: self-contained temp-DB engines (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `/api/accounts` POST/PATCH
are mutating, non-exempt routes, so requests carry the session cookie **and** the `X-CSRF-Token`
header. Covers: create each subtype (ledger-backed need opening_balance+date), creator as sole
owner, discriminated-union list (subtype-only columns), audited PATCH + `account_number` masking,
vivid round-trip, member 403, cross-household 404, and ledger-backed-missing-opening 422.
"""

import json
import tempfile
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.account import Account, AccountOwner, AccountSnapshot
from backend.models.base import Base
from backend.models.event import FinancialEvent
from backend.models.identity import Household, Person
from backend.models.system import AuditLog
from backend.rate_limit import limiter
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "account_test.db"
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
    """Insert a Household + a Person (default role admin — accounts need admin). Returns
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


def _bank(**over) -> dict:
    return {
        "account_type": "bank",
        "name": "DBS Multiplier",
        "opening_balance": "12840.00",
        "opening_balance_date": "2026-06-01",
        **over,
    }


# ── Create per subtype ──


async def test_create_bank_ledger_backed(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/accounts", json=_bank(vivid=True, account_number="1234567890"))
        assert resp.status_code == 201
        body = resp.json()
        assert body["account_type"] == "bank"
        assert body["status"] == "active"
        assert body["created_by"] == person_id
        assert body["vivid"] is True
        assert Decimal(body["opening_balance"]) == Decimal("12840.00")
        # Creator is the sole owner.
        assert body["owner_ids"] == [person_id]
        # snake_case wire (generic-entity surface)
        assert "account_number" in body
    finally:
        await engine.dispose()


async def test_create_asset_like_no_opening_balance(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        for atype, extra in (
            ("capital", {"cost_basis": "10000.00"}),
            ("asset", {"asset_type": "property"}),
            ("insurance", {"insurer": "Prudential", "policy_type": "life"}),
        ):
            resp = client.post(
                "/api/accounts", json={"account_type": atype, "name": f"{atype} acct", **extra}
            )
            assert resp.status_code == 201, resp.text
            assert resp.json()["account_type"] == atype
    finally:
        await engine.dispose()


async def test_creator_is_sole_owner(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        async with factory() as db:
            owners = (
                (await db.execute(select(AccountOwner).where(AccountOwner.account_id == acct_id)))
                .scalars()
                .all()
            )
        assert len(owners) == 1
        assert owners[0].person_id == person_id
        assert owners[0].is_primary is True
    finally:
        await engine.dispose()


# ── Discriminated-union list ──


async def test_list_discriminated_union(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        client.post("/api/accounts", json=_bank())
        client.post(
            "/api/accounts",
            json={"account_type": "capital", "name": "Stocks", "cost_basis": "5000"},
        )

        body = client.get("/api/accounts").json()
        assert body["total"] == 2
        by_type = {a["account_type"]: a for a in body["items"]}
        # Each subtype carries ONLY its own columns (no flat padding).
        assert "account_number" in by_type["bank"]
        assert "cost_basis" not in by_type["bank"]
        assert "cost_basis" in by_type["capital"]
        assert "opening_balance" not in by_type["capital"]
        assert by_type["bank"]["owner_ids"] == [person_id]
    finally:
        await engine.dispose()


async def test_list_account_type_filter(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        client.post("/api/accounts", json=_bank())
        client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Stocks"}
        )

        body = client.get("/api/accounts?account_type=capital").json()
        assert body["total"] == 1
        assert body["items"][0]["account_type"] == "capital"
    finally:
        await engine.dispose()


# ── Update + audit + vivid ──


async def test_patch_edits_and_audits(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct = client.post("/api/accounts", json=_bank(account_number="9876543210")).json()
        resp = client.patch(
            f"/api/accounts/{acct['id']}", json={"name": "POSB", "vivid": True}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "POSB"
        assert body["vivid"] is True

        # An update audit row exists and `account_number` is masked in its snapshots.
        async with factory() as db:
            rows = (
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "account",
                            AuditLog.action == "update",
                        )
                    )
                )
                .scalars()
                .all()
            )
        assert len(rows) == 1
        after = json.loads(rows[0].after_state)
        assert after["account_number"] == "****3210"
        assert after["name"] == "POSB"
    finally:
        await engine.dispose()


# ── Scoping / permission / validation ──


async def test_patch_rejects_cross_subtype_field_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct = client.post("/api/accounts", json=_bank()).json()
        # cost_basis is a capital column — invalid on a bank account.
        resp = client.patch(f"/api/accounts/{acct['id']}", json={"cost_basis": "100"})
        assert resp.status_code == 400
        assert resp.json()["status"] == 400
    finally:
        await engine.dispose()


async def test_member_cannot_create_or_edit_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory, role="member")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/accounts", json=_bank())
        assert resp.status_code == 403
        assert resp.json()["status"] == 403
    finally:
        await engine.dispose()


async def test_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_a, _ = await _seed_household(factory)
        sid_a, csrf_a = await _seed_session(factory, person_a)
        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, sid_a, csrf_a)
        acct_id = client_a.post("/api/accounts", json=_bank()).json()["id"]

        # A second household's admin cannot see account A.
        person_b, _ = await _seed_household(factory)
        sid_b, csrf_b = await _seed_session(factory, person_b)
        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, sid_b, csrf_b)
        assert client_b.get(f"/api/accounts/{acct_id}").status_code == 404
        assert client_b.patch(f"/api/accounts/{acct_id}", json={"name": "x"}).status_code == 404
    finally:
        await engine.dispose()


async def test_ledger_backed_missing_opening_balance_422(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/accounts", json={"account_type": "bank", "name": "No balance"})
        assert resp.status_code == 422
    finally:
        await engine.dispose()


# ── Archive / restore (Story 4.2) ──


async def _audit_count(factory, entity_id: str, action: str) -> int:
    async with factory() as db:
        return (
            await db.execute(
                select(func.count())
                .select_from(AuditLog)
                .where(
                    AuditLog.entity_type == "account",
                    AuditLog.entity_id == entity_id,
                    AuditLog.action == action,
                )
            )
        ).scalar_one()


async def test_archive_hides_then_restore_reverses(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]

        resp = client.post(f"/api/accounts/{acct_id}/archive")
        assert resp.status_code == 200
        assert resp.json()["status"] == "archived"
        # Excluded from the default list, present with include_archived.
        assert client.get("/api/accounts").json()["total"] == 0
        assert client.get("/api/accounts?include_archived=true").json()["total"] == 1
        assert await _audit_count(factory, acct_id, "archive") == 1

        resp = client.post(f"/api/accounts/{acct_id}/restore")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        assert client.get("/api/accounts").json()["total"] == 1
    finally:
        await engine.dispose()


async def test_archive_idempotent_single_audit_row(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        assert client.post(f"/api/accounts/{acct_id}/archive").status_code == 200
        assert client.post(f"/api/accounts/{acct_id}/archive").status_code == 200  # no-op
        assert await _audit_count(factory, acct_id, "archive") == 1
    finally:
        await engine.dispose()


# ── Hard-delete-if-empty (Story 4.2) ──


async def test_delete_empty_204_removes_owners_no_audit(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        assert client.delete(f"/api/accounts/{acct_id}").status_code == 204

        async with factory() as db:
            assert await db.get(Account, acct_id) is None
            owners = (
                await db.execute(select(AccountOwner).where(AccountOwner.account_id == acct_id))
            ).scalars().all()
            assert owners == []
        # Hard delete leaves NO audit row (INFO log only).
        async with factory() as db:
            rows = (
                await db.execute(
                    select(func.count())
                    .select_from(AuditLog)
                    .where(AuditLog.entity_id == acct_id, AuditLog.action == "delete")
                )
            ).scalar_one()
        assert rows == 0
    finally:
        await engine.dispose()


async def test_delete_blocked_by_snapshot_409_value_history(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        async with factory() as db:
            db.add(
                AccountSnapshot(
                    household_id=hh_id,
                    created_by=person_id,
                    account_id=acct_id,
                    snapshot_date=date(2026, 6, 1),
                    value=Decimal("100.00"),
                    currency="SGD",
                    value_base=Decimal("100.00"),
                    source="manual",
                )
            )
            await db.commit()

        assert client.delete(f"/api/accounts/{acct_id}").status_code == 409
        # The row survives and reports can_delete=false + the reason.
        item = next(
            a for a in client.get("/api/accounts").json()["items"] if a["id"] == acct_id
        )
        assert item["can_delete"] is False
        assert item["delete_blocked_reason"] == "has value history"
    finally:
        await engine.dispose()


async def test_delete_blocked_by_transaction_409_has_transactions(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        async with factory() as db:
            db.add(
                FinancialEvent(
                    household_id=hh_id,
                    created_by=person_id,
                    event_type="financial_event",
                    event_date=date(2026, 6, 2),
                    source_account_id=acct_id,
                    currency="SGD",
                    amount=Decimal("50.00"),
                    fx_rate=Decimal("1.000000"),
                    amount_base_calculated=Decimal("50.00"),
                    amount_base=Decimal("50.00"),
                )
            )
            await db.commit()

        assert client.delete(f"/api/accounts/{acct_id}").status_code == 409
        item = client.get(f"/api/accounts/{acct_id}").json()
        assert item["can_delete"] is False
        assert item["delete_blocked_reason"] == "has transactions"
    finally:
        await engine.dispose()


# ── Duplicate (Story 4.2) ──


async def test_duplicate_clones_columns_and_owner(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        src = client.post(
            "/api/accounts", json=_bank(vivid=True, account_number="1234567890")
        ).json()
        resp = client.post(f"/api/accounts/{src['id']}/duplicate")
        assert resp.status_code == 201
        clone = resp.json()

        assert clone["id"] != src["id"]
        assert clone["name"] == src["name"]  # verbatim (non-unique by design)
        assert clone["account_type"] == "bank"
        assert clone["status"] == "active"
        assert clone["vivid"] is True
        assert clone["account_number"] == "1234567890"
        assert Decimal(clone["opening_balance"]) == Decimal("12840.00")
        assert clone["created_by"] == person_id
        assert clone["owner_ids"] == [person_id]
        # The clone is a new entity → a `create` audit row on the new id.
        assert await _audit_count(factory, clone["id"], "create") == 1
    finally:
        await engine.dispose()


async def test_duplicate_of_archived_is_active(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        src_id = client.post("/api/accounts", json=_bank()).json()["id"]
        client.post(f"/api/accounts/{src_id}/archive")
        clone = client.post(f"/api/accounts/{src_id}/duplicate").json()
        assert clone["status"] == "active"
    finally:
        await engine.dispose()


# ── Permission / scoping on the lifecycle routes ──


async def test_member_cannot_run_lifecycle_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        # An admin creates the account; a member then tries the lifecycle routes.
        admin_id, hh_id = await _seed_household(factory)
        sid_a, csrf_a = await _seed_session(factory, admin_id)
        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, sid_a, csrf_a)
        acct_id = client_a.post("/api/accounts", json=_bank()).json()["id"]

        member_id = str(uuid4())
        async with factory() as db:
            db.add(
                Person(
                    id=member_id,
                    household_id=hh_id,
                    email=f"{uuid4()}@example.com",
                    display_name="Member",
                    role="member",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.commit()
        sid_m, csrf_m = await _seed_session(factory, member_id)
        client_m = _client_with_db(factory, monkeypatch)
        _auth(client_m, sid_m, csrf_m)

        assert client_m.post(f"/api/accounts/{acct_id}/archive").status_code == 403
        assert client_m.post(f"/api/accounts/{acct_id}/duplicate").status_code == 403
        assert client_m.delete(f"/api/accounts/{acct_id}").status_code == 403
    finally:
        await engine.dispose()


async def test_lifecycle_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_a, _ = await _seed_household(factory)
        sid_a, csrf_a = await _seed_session(factory, person_a)
        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, sid_a, csrf_a)
        acct_id = client_a.post("/api/accounts", json=_bank()).json()["id"]

        person_b, _ = await _seed_household(factory)
        sid_b, csrf_b = await _seed_session(factory, person_b)
        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, sid_b, csrf_b)
        assert client_b.post(f"/api/accounts/{acct_id}/archive").status_code == 404
        assert client_b.post(f"/api/accounts/{acct_id}/duplicate").status_code == 404
        assert client_b.delete(f"/api/accounts/{acct_id}").status_code == 404
    finally:
        await engine.dispose()
