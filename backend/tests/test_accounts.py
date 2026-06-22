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
from datetime import UTC, date, datetime
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
from backend.models.currency import Currency
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
        # The base currency row (Story 2.4c seeds this for real households) — accounts validate
        # their native currency against the household's configured currencies (Story 4.4).
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


async def _seed_currency(
    factory, hh_id: str, code: str, *, rate: str = "1.0"
) -> str:
    """Add a non-base currency to `hh_id` (for the native-currency / FX snapshot tests)."""
    cid = str(uuid4())
    async with factory() as db:
        db.add(
            Currency(
                id=cid,
                household_id=hh_id,
                code=code,
                name=code,
                symbol=code,
                is_base=False,
                rate_to_base=Decimal(rate),
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


def _bank(**over) -> dict:
    return {
        "account_type": "bank",
        "name": "DBS Multiplier",
        "currency": "SGD",
        "opening_balance": "12840.00",
        "opening_balance_date": "2026-06-01",
        **over,
    }


def _snap(
    value: str, *, on: str = "2026-06-14", currency: str = "SGD", source: str = "manual"
) -> dict:
    """An `account_snapshots` POST body (Story 4.4)."""
    return {"snapshot_date": on, "value": value, "currency": currency, "source": source}


async def _add_event(
    factory,
    hh_id: str,
    person_id: str,
    *,
    event_type: str = "transaction",
    on: str = "2026-06-10",
    source_account_id: str | None = None,
    destination_account_id: str | None = None,
    amount: str = "50.00",
    created_at: datetime | None = None,
) -> str:
    """Seed a `financial_events` row directly — no event-write router exists until Epic 5. Sets the
    required `MonetaryValueMixin` block; uses a real subtype `event_type` ('transaction'/'transfer')
    to exercise the single-class STI (the polymorphic-mapper strip, Story 4.6 Task 1). `created_at`
    overridable for deterministic same-date tiebreaks."""
    eid = str(uuid4())
    amt = Decimal(amount)
    y, m, d = (int(p) for p in on.split("-"))
    async with factory() as db:
        ev = FinancialEvent(
            id=eid,
            household_id=hh_id,
            created_by=person_id,
            event_type=event_type,
            event_date=date(y, m, d),
            source_account_id=source_account_id,
            destination_account_id=destination_account_id,
            currency="SGD",
            amount=amt,
            fx_rate=Decimal("1.000000"),
            amount_base_calculated=amt,
            amount_base=amt,
        )
        if created_at is not None:
            ev.created_at = created_at
        db.add(ev)
        await db.commit()
    return eid


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
                "/api/accounts",
                json={"account_type": atype, "name": f"{atype} acct", "currency": "SGD", **extra},
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
            json={
                "account_type": "capital",
                "name": "Stocks",
                "currency": "SGD",
                "cost_basis": "5000",
            },
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
            "/api/accounts",
            json={"account_type": "capital", "name": "Stocks", "currency": "SGD"},
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
        # A bare-`date` column (opening_balance_date) serializes to ISO in the audit snapshot —
        # locks the audit `_serialize_scalar` date branch (Story 4.10); a regression would 500 the
        # PATCH (json.dumps on a raw date) and fail the 200 assert above.
        assert after["opening_balance_date"] == "2026-06-01"
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


async def _audit_count(
    factory, entity_id: str, action: str, *, entity_type: str = "account"
) -> int:
    async with factory() as db:
        return (
            await db.execute(
                select(func.count())
                .select_from(AuditLog)
                .where(
                    AuditLog.entity_type == entity_type,
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


# ── Multiple owners (Story 4.3) ──


async def _add_member(factory, hh_id: str, *, role: str = "member") -> str:
    """Insert another Person into `hh_id`, returning their id."""
    pid = str(uuid4())
    async with factory() as db:
        db.add(
            Person(
                id=pid,
                household_id=hh_id,
                email=f"{uuid4()}@example.com",
                display_name="Member",
                role=role,
                google_sub=f"sub-{uuid4()}",
            )
        )
        await db.commit()
    return pid


async def _owner_rows(factory, account_id: str) -> list[AccountOwner]:
    async with factory() as db:
        return (
            (await db.execute(select(AccountOwner).where(AccountOwner.account_id == account_id)))
            .scalars()
            .all()
        )


async def test_create_with_owner_ids_creator_primary(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        alex = await _add_member(factory, hh_id)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        body = client.post(
            "/api/accounts", json=_bank(owner_ids=[person_id, alex])
        ).json()
        assert set(body["owner_ids"]) == {person_id, alex}
        rows = await _owner_rows(factory, body["id"])
        assert len(rows) == 2
        primary = [o.person_id for o in rows if o.is_primary]
        assert primary == [person_id]  # creator is primary when present in the set
    finally:
        await engine.dispose()


async def test_create_without_owner_ids_creator_sole_owner(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        body = client.post("/api/accounts", json=_bank()).json()
        assert body["owner_ids"] == [person_id]
    finally:
        await engine.dispose()


async def test_create_owner_ids_without_creator_first_is_primary(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        alex = await _add_member(factory, hh_id)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        body = client.post("/api/accounts", json=_bank(owner_ids=[alex])).json()
        assert body["owner_ids"] == [alex]
        rows = await _owner_rows(factory, body["id"])
        assert [o.person_id for o in rows if o.is_primary] == [alex]
    finally:
        await engine.dispose()


async def test_put_owners_add_then_remove_reassigns_primary(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        alex = await _add_member(factory, hh_id)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]

        # Add alex → two owners, ben (creator) stays primary.
        resp = client.put(f"/api/accounts/{acct_id}/owners", json={"owner_ids": [person_id, alex]})
        assert resp.status_code == 200
        assert set(resp.json()["owner_ids"]) == {person_id, alex}
        rows = await _owner_rows(factory, acct_id)
        assert [o.person_id for o in rows if o.is_primary] == [person_id]

        # Remove ben → alex is the lone owner and the new primary.
        resp = client.put(f"/api/accounts/{acct_id}/owners", json={"owner_ids": [alex]})
        assert resp.status_code == 200
        assert resp.json()["owner_ids"] == [alex]
        rows = await _owner_rows(factory, acct_id)
        assert len(rows) == 1
        assert rows[0].person_id == alex
        assert rows[0].is_primary is True
    finally:
        await engine.dispose()


async def test_put_owners_empty_400_untouched(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        resp = client.put(f"/api/accounts/{acct_id}/owners", json={"owner_ids": []})
        assert resp.status_code == 400
        assert resp.json()["status"] == 400
        # The original owner row survives untouched.
        rows = await _owner_rows(factory, acct_id)
        assert [o.person_id for o in rows] == [person_id]
    finally:
        await engine.dispose()


async def test_put_owners_non_member_400_untouched(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # A person in a DIFFERENT household.
        other_id, _ = await _seed_household(factory)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        resp = client.put(
            f"/api/accounts/{acct_id}/owners", json={"owner_ids": [person_id, other_id]}
        )
        assert resp.status_code == 400
        rows = await _owner_rows(factory, acct_id)
        assert [o.person_id for o in rows] == [person_id]  # untouched
    finally:
        await engine.dispose()


async def test_put_owners_member_403_and_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        admin_id, hh_id = await _seed_household(factory)
        sid_a, csrf_a = await _seed_session(factory, admin_id)
        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, sid_a, csrf_a)
        acct_id = client_a.post("/api/accounts", json=_bank()).json()["id"]

        # Plain member of the SAME household → 403.
        member_id = await _add_member(factory, hh_id, role="member")
        sid_m, csrf_m = await _seed_session(factory, member_id)
        client_m = _client_with_db(factory, monkeypatch)
        _auth(client_m, sid_m, csrf_m)
        assert (
            client_m.put(
                f"/api/accounts/{acct_id}/owners", json={"owner_ids": [admin_id]}
            ).status_code
            == 403
        )

        # Admin of ANOTHER household → 404 (cross-household scope).
        other_admin, _ = await _seed_household(factory)
        sid_b, csrf_b = await _seed_session(factory, other_admin)
        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, sid_b, csrf_b)
        assert (
            client_b.put(
                f"/api/accounts/{acct_id}/owners", json={"owner_ids": [other_admin]}
            ).status_code
            == 404
        )
    finally:
        await engine.dispose()


async def test_put_owners_not_audited(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        alex = await _add_member(factory, hh_id)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]

        async def _total_audit() -> int:
            async with factory() as db:
                return (
                    await db.execute(
                        select(func.count())
                        .select_from(AuditLog)
                        .where(AuditLog.entity_id == acct_id)
                    )
                ).scalar_one()

        before = await _total_audit()
        client.put(f"/api/accounts/{acct_id}/owners", json={"owner_ids": [person_id, alex]})
        assert await _total_audit() == before  # owner changes are not audited
    finally:
        await engine.dispose()


# ── Native currency + value snapshots (Story 4.4) ──


async def test_create_requires_valid_currency(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_currency(factory, hh_id, "NZD")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # A configured currency → 201, echoed on the response.
        resp = client.post("/api/accounts", json=_bank(currency="NZD"))
        assert resp.status_code == 201, resp.text
        assert resp.json()["currency"] == "NZD"

        # Missing currency → 422 (required field).
        no_ccy = _bank()
        del no_ccy["currency"]
        assert client.post("/api/accounts", json=no_ccy).status_code == 422

        # Unconfigured currency → 400 Unknown currency.
        resp = client.post("/api/accounts", json=_bank(currency="XYZ"))
        assert resp.status_code == 400
        assert resp.json()["title"] == "Unknown currency"
    finally:
        await engine.dispose()


async def test_currency_edit_gate(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_currency(factory, hh_id, "NZD")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]

        # No history → currency is editable.
        resp = client.patch(f"/api/accounts/{acct_id}", json={"currency": "NZD"})
        assert resp.status_code == 200
        assert resp.json()["currency"] == "NZD"

        # Same-value no-op is always allowed.
        assert client.patch(f"/api/accounts/{acct_id}", json={"currency": "NZD"}).status_code == 200

        # Unconfigured currency → 400 Unknown currency.
        resp = client.patch(f"/api/accounts/{acct_id}", json={"currency": "XYZ"})
        assert resp.status_code == 400
        assert resp.json()["title"] == "Unknown currency"

        # Add a snapshot → now it has history → currency is locked.
        client.post(
            f"/api/accounts/{acct_id}/snapshots",
            json=_snap("100", on="2026-06-01", currency="NZD"),
        )
        resp = client.patch(f"/api/accounts/{acct_id}", json={"currency": "SGD"})
        assert resp.status_code == 400
        assert resp.json()["title"] == "Currency locked"
        assert client.get(f"/api/accounts/{acct_id}").json()["currency"] == "NZD"  # unchanged
    finally:
        await engine.dispose()


async def test_delete_currency_blocked_when_account_denominated(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        nzd_id = await _seed_currency(factory, hh_id, "NZD")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        client.post("/api/accounts", json=_bank(currency="NZD"))
        resp = client.delete(f"/api/currencies/{nzd_id}")
        assert resp.status_code == 409
        assert resp.json()["type"] == "has_dependencies"
        # The currency survives.
        assert any(c["code"] == "NZD" for c in client.get("/api/currencies").json()["items"])
    finally:
        await engine.dispose()


async def test_snapshot_resolves_current_value(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # Asset-like: no snapshot → current_value null; after a snapshot → that value + currency.
        cap_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        assert client.get(f"/api/accounts/{cap_id}").json()["current_value"] is None

        client.post(
            f"/api/accounts/{cap_id}/snapshots",
            json=_snap("5000", on="2026-06-10", source="appraisal"),
        )
        body = client.get(f"/api/accounts/{cap_id}").json()
        assert Decimal(body["current_value"]) == Decimal("5000")
        assert body["current_value_currency"] == "SGD"

        # Ledger-backed: no snapshot → the opening anchor; after a snapshot → the snapshot.
        bank_id = client.post("/api/accounts", json=_bank()).json()["id"]
        body = client.get(f"/api/accounts/{bank_id}").json()
        assert Decimal(body["current_value"]) == Decimal("12840.00")
        assert body["current_value_currency"] == "SGD"

        client.post(
            f"/api/accounts/{bank_id}/snapshots",
            json=_snap("13000", on="2026-06-11", source="reconciliation"),
        )
        body = client.get(f"/api/accounts/{bank_id}").json()
        assert Decimal(body["current_value"]) == Decimal("13000")
    finally:
        await engine.dispose()


async def test_snapshot_non_account_currency_value_base_and_unknown_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_currency(factory, hh_id, "USD", rate="1.35")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]

        # A snapshot in a non-base currency caches value_base = value × rate_to_base (4dp).
        resp = client.post(
            f"/api/accounts/{acct_id}/snapshots",
            json=_snap("100", on="2026-06-12", currency="USD"),
        )
        assert resp.status_code == 201
        assert Decimal(resp.json()["value_base"]) == Decimal("135.0000")

        # Unknown currency → 400 and no row written.
        resp = client.post(
            f"/api/accounts/{acct_id}/snapshots",
            json=_snap("1", on="2026-06-12", currency="XYZ"),
        )
        assert resp.status_code == 400
        async with factory() as db:
            count = (
                await db.execute(
                    select(func.count())
                    .select_from(AccountSnapshot)
                    .where(AccountSnapshot.account_id == acct_id)
                )
            ).scalar_one()
        assert count == 1  # only the USD one
    finally:
        await engine.dispose()


async def test_snapshot_same_date_tiebreak_latest_written(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        for val in ("100", "200"):
            client.post(
                f"/api/accounts/{acct_id}/snapshots", json=_snap(val, on="2026-06-13")
            )
        # Same date → the latest-written (200) wins current value.
        current = client.get(f"/api/accounts/{acct_id}").json()["current_value"]
        assert Decimal(current) == Decimal("200")
        # list_snapshots returns it first (newest-first).
        items = client.get(f"/api/accounts/{acct_id}/snapshots").json()["items"]
        assert items[0]["value"] in ("200", "200.0000")
        assert Decimal(items[0]["value"]) == Decimal("200")
    finally:
        await engine.dispose()


async def test_snapshot_source_guard_and_user_sources(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]

        # A system source → 422 (Pydantic Literal).
        resp = client.post(
            f"/api/accounts/{acct_id}/snapshots", json=_snap("1", source="formula")
        )
        assert resp.status_code == 422

        # The three user sources are all accepted.
        for src in ("manual", "reconciliation", "appraisal"):
            resp = client.post(
                f"/api/accounts/{acct_id}/snapshots", json=_snap("1", source=src)
            )
            assert resp.status_code == 201, resp.text
    finally:
        await engine.dispose()


async def test_snapshot_member_403_and_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        admin_id, hh_id = await _seed_household(factory)
        sid_a, csrf_a = await _seed_session(factory, admin_id)
        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, sid_a, csrf_a)
        acct_id = client_a.post("/api/accounts", json=_bank()).json()["id"]

        snap = _snap("1", on="2026-06-15")

        # Plain member of the same household → 403 on POST.
        member_id = await _add_member(factory, hh_id, role="member")
        sid_m, csrf_m = await _seed_session(factory, member_id)
        client_m = _client_with_db(factory, monkeypatch)
        _auth(client_m, sid_m, csrf_m)
        assert client_m.post(f"/api/accounts/{acct_id}/snapshots", json=snap).status_code == 403

        # Admin of another household → 404 on POST + GET.
        other_admin, _ = await _seed_household(factory)
        sid_b, csrf_b = await _seed_session(factory, other_admin)
        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, sid_b, csrf_b)
        assert client_b.post(f"/api/accounts/{acct_id}/snapshots", json=snap).status_code == 404
        assert client_b.get(f"/api/accounts/{acct_id}/snapshots").status_code == 404
    finally:
        await engine.dispose()


# ── Edit & delete value snapshots (Story 4.10) ──


async def test_snapshot_create_is_audited(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        snap_id = client.post(f"/api/accounts/{acct_id}/snapshots", json=_snap("100")).json()["id"]

        # Snapshots are mutable corrections now → create writes a `create` audit row (Story 4.10).
        assert await _audit_count(factory, snap_id, "create", entity_type="account_snapshot") == 1
    finally:
        await engine.dispose()


async def test_update_snapshot_rederives_value_base_and_audits(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        await _seed_currency(factory, hh_id, "USD", rate="1.35")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        snap_id = client.post(f"/api/accounts/{acct_id}/snapshots", json=_snap("100")).json()["id"]

        # Edit the value → value changes and value_base re-derives (SGD rate 1.0).
        resp = client.patch(f"/api/accounts/{acct_id}/snapshots/{snap_id}", json={"value": "250"})
        assert resp.status_code == 200, resp.text
        assert Decimal(resp.json()["value"]) == Decimal("250")
        assert Decimal(resp.json()["value_base"]) == Decimal("250.0000")

        # Edit the currency → value_base re-derives at the new rate (250 × 1.35).
        resp = client.patch(
            f"/api/accounts/{acct_id}/snapshots/{snap_id}", json={"currency": "USD"}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["currency"] == "USD"
        assert Decimal(resp.json()["value_base"]) == Decimal("337.5000")

        # Two edits → two `update` audit rows.
        assert await _audit_count(factory, snap_id, "update", entity_type="account_snapshot") == 2
    finally:
        await engine.dispose()


async def test_update_snapshot_partial_fields_leave_value_base(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        snap = client.post(f"/api/accounts/{acct_id}/snapshots", json=_snap("100")).json()
        snap_id, base_before = snap["id"], snap["value_base"]

        # Editing only note/source/date never touches value_base.
        resp = client.patch(
            f"/api/accounts/{acct_id}/snapshots/{snap_id}",
            json={"note": "year-end", "source": "appraisal", "snapshot_date": "2026-06-20"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["note"] == "year-end"
        assert resp.json()["source"] == "appraisal"
        assert resp.json()["snapshot_date"] == "2026-06-20"
        assert resp.json()["value_base"] == base_before
    finally:
        await engine.dispose()


async def test_update_snapshot_unknown_currency_400_and_system_source_422(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        snap = client.post(f"/api/accounts/{acct_id}/snapshots", json=_snap("100")).json()
        snap_id = snap["id"]

        # Unknown currency → 400, the row is untouched.
        resp = client.patch(
            f"/api/accounts/{acct_id}/snapshots/{snap_id}", json={"value": "5", "currency": "XYZ"}
        )
        assert resp.status_code == 400
        unchanged = client.get(f"/api/accounts/{acct_id}/snapshots").json()["items"][0]
        assert Decimal(unchanged["value"]) == Decimal("100")
        assert unchanged["currency"] == "SGD"

        # System source → 422 (Pydantic Literal).
        resp = client.patch(
            f"/api/accounts/{acct_id}/snapshots/{snap_id}", json={"source": "formula"}
        )
        assert resp.status_code == 422
    finally:
        await engine.dispose()


async def test_delete_snapshot_recomputes_current_value_and_audits(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        client.post(f"/api/accounts/{acct_id}/snapshots", json=_snap("100", on="2026-06-10"))
        latest_id = client.post(
            f"/api/accounts/{acct_id}/snapshots", json=_snap("200", on="2026-06-14")
        ).json()["id"]
        assert Decimal(client.get(f"/api/accounts/{acct_id}").json()["current_value"]) == Decimal(
            "200"
        )

        # Delete the latest → 204, current value falls back to the remaining (earlier) snapshot.
        resp = client.delete(f"/api/accounts/{acct_id}/snapshots/{latest_id}")
        assert resp.status_code == 204
        items = client.get(f"/api/accounts/{acct_id}/snapshots").json()["items"]
        assert all(i["id"] != latest_id for i in items)
        assert Decimal(client.get(f"/api/accounts/{acct_id}").json()["current_value"]) == Decimal(
            "100"
        )
        assert await _audit_count(factory, latest_id, "delete", entity_type="account_snapshot") == 1
    finally:
        await engine.dispose()


async def test_snapshot_mutation_perms_and_wrong_account_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        admin_id, hh_id = await _seed_household(factory)
        sid_a, csrf_a = await _seed_session(factory, admin_id)
        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, sid_a, csrf_a)

        acct_id = client_a.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        other_id = client_a.post(
            "/api/accounts", json={"account_type": "capital", "name": "Two", "currency": "SGD"}
        ).json()["id"]
        snap_id = client_a.post(f"/api/accounts/{acct_id}/snapshots", json=_snap("100")).json()[
            "id"
        ]

        # A real snapshot id but the wrong (sibling) account → 404 on both verbs.
        assert (
            client_a.patch(
                f"/api/accounts/{other_id}/snapshots/{snap_id}", json={"value": "5"}
            ).status_code
            == 404
        )
        assert (
            client_a.delete(f"/api/accounts/{other_id}/snapshots/{snap_id}").status_code == 404
        )

        # Plain member → 403 on both verbs.
        member_id = await _add_member(factory, hh_id, role="member")
        sid_m, csrf_m = await _seed_session(factory, member_id)
        client_m = _client_with_db(factory, monkeypatch)
        _auth(client_m, sid_m, csrf_m)
        assert (
            client_m.patch(
                f"/api/accounts/{acct_id}/snapshots/{snap_id}", json={"value": "5"}
            ).status_code
            == 403
        )
        assert (
            client_m.delete(f"/api/accounts/{acct_id}/snapshots/{snap_id}").status_code == 403
        )

        # Admin of another household → 404.
        other_admin, _ = await _seed_household(factory)
        sid_b, csrf_b = await _seed_session(factory, other_admin)
        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, sid_b, csrf_b)
        assert (
            client_b.delete(f"/api/accounts/{acct_id}/snapshots/{snap_id}").status_code == 404
        )
    finally:
        await engine.dispose()


# ── Value-history series for the card MiniSparkline (Story 4.5) ──


async def test_value_series_oldest_to_newest(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        # Three snapshots on ascending dates → value_series is their value_base, oldest→newest.
        for val, on in (("100", "2026-06-10"), ("250", "2026-06-11"), ("175", "2026-06-12")):
            client.post(f"/api/accounts/{acct_id}/snapshots", json=_snap(val, on=on))

        item = next(a for a in client.get("/api/accounts").json()["items"] if a["id"] == acct_id)
        assert [Decimal(v) for v in item["value_series"]] == [
            Decimal("100"),
            Decimal("250"),
            Decimal("175"),
        ]
    finally:
        await engine.dispose()


async def test_value_series_empty_and_single(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # No snapshots → [] (the atom's "no history yet" placeholder; opening anchor NOT folded in).
        bank_id = client.post("/api/accounts", json=_bank()).json()["id"]
        # One snapshot → length 1 (backend still returns the single point).
        cap_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        client.post(f"/api/accounts/{cap_id}/snapshots", json=_snap("42", on="2026-06-10"))

        items = {a["id"]: a for a in client.get("/api/accounts").json()["items"]}
        assert items[bank_id]["value_series"] == []
        assert [Decimal(v) for v in items[cap_id]["value_series"]] == [Decimal("42")]
    finally:
        await engine.dispose()


async def test_value_series_caps_at_twelve_most_recent(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        # 15 snapshots on ascending dates (values 1..15) → series is the most recent 12 (4..15),
        # still oldest→newest.
        for i in range(1, 16):
            client.post(
                f"/api/accounts/{acct_id}/snapshots",
                json=_snap(str(i), on=date(2026, 6, i).isoformat()),
            )

        item = next(a for a in client.get("/api/accounts").json()["items"] if a["id"] == acct_id)
        assert [Decimal(v) for v in item["value_series"]] == [Decimal(str(i)) for i in range(4, 16)]
    finally:
        await engine.dispose()


async def test_value_series_same_date_in_write_order(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post(
            "/api/accounts", json={"account_type": "capital", "name": "Fund", "currency": "SGD"}
        ).json()["id"]
        # Two same-date snapshots → ASC created_at tiebreak: write order (100 then 200).
        for val in ("100", "200"):
            client.post(f"/api/accounts/{acct_id}/snapshots", json=_snap(val, on="2026-06-13"))

        item = next(a for a in client.get("/api/accounts").json()["items"] if a["id"] == acct_id)
        assert [Decimal(v) for v in item["value_series"]] == [Decimal("100"), Decimal("200")]
    finally:
        await engine.dispose()


# ── Transaction history (Story 4.6, FR-A-007) ──


async def test_account_events_empty_until_epic5(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        resp = client.get(f"/api/accounts/{acct_id}/events")
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}
    finally:
        await engine.dispose()


async def test_account_events_both_legs_and_lean_shape(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]
        other_id = client.post("/api/accounts", json=_bank(name="Other")).json()["id"]

        # source leg (transaction) + destination leg (incoming transfer) → both included.
        src_ev = await _add_event(
            factory, hh_id, person_id, event_type="transaction",
            source_account_id=acct_id, on="2026-06-01",
        )
        dst_ev = await _add_event(
            factory, hh_id, person_id, event_type="transfer",
            destination_account_id=acct_id, on="2026-06-02",
        )
        # touches neither leg of acct → excluded (proves the filter, not just household scope).
        await _add_event(
            factory, hh_id, person_id, event_type="transaction",
            source_account_id=other_id, on="2026-06-03",
        )

        body = client.get(f"/api/accounts/{acct_id}/events").json()
        # Selecting transaction/transfer *entities* here also proves the polymorphic-mapper strip
        # (Task 1) — with the mapper present this would raise "No such polymorphic_identity".
        assert body["total"] == 2
        assert {e["id"] for e in body["items"]} == {src_ev, dst_ev}

        # Lean base-event projection (Epic-5 seam — flat, not the §4.5 union).
        row = next(e for e in body["items"] if e["id"] == src_ev)
        assert row.keys() == {
            "id", "event_type", "name", "event_date", "transaction_status",
            "transaction_type", "currency", "amount", "amount_base",
            "source_account_id", "destination_account_id", "category_id", "notes", "created_at",
        }
        assert row["event_type"] == "transaction"
        assert row["source_account_id"] == acct_id
    finally:
        await engine.dispose()


async def test_account_events_scope_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]

        # A different household's member must not read this account's history (scope guard → 404).
        p2, _ = await _seed_household(factory)
        sid2, csrf2 = await _seed_session(factory, p2)
        client2 = _client_with_db(factory, monkeypatch)
        _auth(client2, sid2, csrf2)
        assert client2.get(f"/api/accounts/{acct_id}/events").status_code == 404
    finally:
        await engine.dispose()


async def test_account_events_sort_by_date(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]

        e1 = await _add_event(factory, hh_id, person_id, source_account_id=acct_id, on="2026-06-01")
        e2 = await _add_event(factory, hh_id, person_id, source_account_id=acct_id, on="2026-06-02")
        e3 = await _add_event(factory, hh_id, person_id, source_account_id=acct_id, on="2026-06-03")

        desc = [e["id"] for e in client.get(f"/api/accounts/{acct_id}/events").json()["items"]]
        assert desc == [e3, e2, e1]  # default order=desc, newest-first
        asc = [
            e["id"]
            for e in client.get(f"/api/accounts/{acct_id}/events?order=asc").json()["items"]
        ]
        assert asc == [e1, e2, e3]

        # Same-date rows tiebreak on created_at (asc → write order by timestamp).
        a = await _add_event(
            factory, hh_id, person_id, source_account_id=acct_id, on="2026-06-05",
            created_at=datetime(2026, 6, 5, 10, 0, tzinfo=UTC),
        )
        b = await _add_event(
            factory, hh_id, person_id, source_account_id=acct_id, on="2026-06-05",
            created_at=datetime(2026, 6, 5, 11, 0, tzinfo=UTC),
        )
        items = client.get(f"/api/accounts/{acct_id}/events?order=asc").json()["items"]
        same = [e["id"] for e in items if e["event_date"] == "2026-06-05"]
        assert same == [a, b]
    finally:
        await engine.dispose()


async def test_account_events_pagination(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        acct_id = client.post("/api/accounts", json=_bank()).json()["id"]

        for i in range(1, 6):  # 5 events on distinct dates
            await _add_event(
                factory, hh_id, person_id, source_account_id=acct_id, on=f"2026-06-0{i}"
            )

        page = client.get(f"/api/accounts/{acct_id}/events?limit=2&order=asc").json()
        assert page["total"] == 5  # full match count, not the page size
        assert [e["event_date"] for e in page["items"]] == ["2026-06-01", "2026-06-02"]
        nxt = client.get(f"/api/accounts/{acct_id}/events?limit=2&offset=2&order=asc").json()
        assert [e["event_date"] for e in nxt["items"]] == ["2026-06-03", "2026-06-04"]

        # Out-of-range params → 422.
        assert client.get(f"/api/accounts/{acct_id}/events?limit=0").status_code == 422
        assert client.get(f"/api/accounts/{acct_id}/events?limit=201").status_code == 422
        assert client.get(f"/api/accounts/{acct_id}/events?offset=-1").status_code == 422
    finally:
        await engine.dispose()
