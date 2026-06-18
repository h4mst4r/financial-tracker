"""Invitation lifecycle tests (Story 2.6a): create/dup/revoke/resend/delete + public validate +
accept/decline, with household-scoping, role gates (401/403), 409s, the derived-`expired` display,
and audit rows.

Self-contained harness mirroring `test_household.py` (temp-DB engines disposed in `finally` for the
Windows WAL/SHM leak; CSRF middleware against a monkeypatched `async_session_factory`). Mutating
routes carry the session cookie + `X-CSRF-Token`; the public `GET /api/invitations/{token}` doesn't.
"""

import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.currency import Currency
from backend.models.identity import Household, HouseholdInvitation, Person
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
    db_path = Path(tmp_dir) / "invitation_test.db"
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


async def _seed_household(factory, *, role: str = "owner") -> tuple[str, str]:
    """Insert a Household + base SGD Currency + a Person (owner). Returns (person_id, hh_id)."""
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
                display_name="Owner Person",
                role=role,
                google_sub=f"sub-{uuid4()}",
            )
        )
        db.add(
            Currency(
                id=str(uuid4()),
                household_id=hh_id,
                code="SGD",
                name="Singapore Dollar",
                symbol="S$",
                is_base=True,
                is_display_active=True,
                rate_to_base=1,
            )
        )
        await db.commit()
    return person_id, hh_id


async def _add_person(
    factory, household_id: str | None, *, role: str = "member", email: str | None = None
) -> str:
    person_id = str(uuid4())
    async with factory() as db:
        db.add(
            Person(
                id=person_id,
                household_id=household_id,
                email=email or f"{uuid4()}@example.com",
                display_name="Some Person",
                role=role,
                google_sub=f"sub-{uuid4()}",
            )
        )
        await db.commit()
    return person_id


async def _add_invitation(
    factory,
    household_id: str,
    invited_by: str,
    *,
    email: str,
    status: str = "pending",
    expires_in: timedelta = timedelta(days=7),
) -> str:
    inv_id = str(uuid4())
    async with factory() as db:
        db.add(
            HouseholdInvitation(
                id=inv_id,
                household_id=household_id,
                invited_email=email,
                invited_by=invited_by,
                expires_at=datetime.now(UTC) + expires_in,
                status=status,
            )
        )
        await db.commit()
    return inv_id


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


# ── Create ──


async def test_create_invitation_admin_returns_token(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/invitations", json={"invitedEmail": "cara@example.com"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["invitedEmail"] == "cara@example.com"
        assert body["status"] == "pending"
        assert body["invitationId"]  # the /join token is returned to the admin

        async with factory() as db:
            rows = (
                (
                    await db.execute(
                        select(HouseholdInvitation).where(HouseholdInvitation.household_id == hh_id)
                    )
                )
                .scalars()
                .all()
            )
            assert len(rows) == 1
            assert rows[0].status == "pending"
            audit_rows = (
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "household_invitation",
                            AuditLog.action == "create",
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(audit_rows) == 1
    finally:
        await engine.dispose()


async def test_create_invitation_member_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        sid, csrf = await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/invitations", json={"invitedEmail": "x@example.com"})
        assert resp.status_code == 403
        assert resp.json()["type"] == "forbidden"
    finally:
        await engine.dispose()


async def test_create_invitation_duplicate_pending_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # Case-insensitive duplicate.
        resp = client.post("/api/household/invitations", json={"invitedEmail": "CARA@example.com"})
        assert resp.status_code == 409
        assert resp.json()["type"] == "conflict"
    finally:
        await engine.dispose()


async def test_create_invitation_existing_member_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        await _add_person(factory, hh_id, role="member", email="alex@example.com")
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/invitations", json={"invitedEmail": "Alex@example.com"})
        assert resp.status_code == 409
    finally:
        await engine.dispose()


async def test_create_invitation_other_household_member_allowed(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, _hh = await _seed_household(factory)
        _other_owner, other_hh = await _seed_household(factory)
        await _add_person(factory, other_hh, role="member", email="bob@example.com")
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # bob is in ANOTHER household — inviting him here is allowed (conflict resolves at login).
        resp = client.post("/api/household/invitations", json={"invitedEmail": "bob@example.com"})
        assert resp.status_code == 200
    finally:
        await engine.dispose()


async def test_create_invitation_bad_email_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, _hh = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/invitations", json={"invitedEmail": "not-an-email"})
        assert resp.status_code == 400
        assert resp.json()["type"] == "bad_request"
    finally:
        await engine.dispose()


# ── Manage list ──


async def test_manage_list_returns_tokens_and_derives_expired(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        await _add_invitation(factory, hh_id, owner_id, email="fresh@example.com")
        await _add_invitation(
            factory, hh_id, owner_id, email="old@example.com", expires_in=timedelta(days=-1)
        )
        # Another household's invite must not leak.
        other_owner, other_hh = await _seed_household(factory)
        await _add_invitation(factory, other_hh, other_owner, email="ghost@example.com")

        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/invitations/manage")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        by_email = {i["invitedEmail"]: i for i in body["items"]}
        assert "ghost@example.com" not in by_email
        assert by_email["fresh@example.com"]["status"] == "pending"
        # Past-expiry pending row is reported as `expired` (derived at read; DB still says pending).
        assert by_email["old@example.com"]["status"] == "expired"
        assert all(i["invitationId"] for i in body["items"])
    finally:
        await engine.dispose()


async def test_manage_list_member_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        sid, csrf = await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/invitations/manage")
        assert resp.status_code == 403
    finally:
        await engine.dispose()


async def test_member_safe_list_still_hides_token(monkeypatch):
    """Guard the Story 2.5 contract: the member-visible list must never expose the token."""
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/invitations")
        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert "invitationId" not in item
        assert "id" not in item
    finally:
        await engine.dispose()


# ── Revoke / Resend / Delete ──


async def test_revoke_pending_then_409_and_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/invitations/{inv_id}/revoke")
        assert resp.status_code == 204
        async with factory() as db:
            inv = await db.get(HouseholdInvitation, inv_id)
            assert inv.status == "revoked"

        # Revoking again (now non-pending) → 409.
        resp = client.post(f"/api/household/invitations/{inv_id}/revoke")
        assert resp.status_code == 409

        # Unknown / cross-household id → 404.
        resp = client.post(f"/api/household/invitations/{uuid4()}/revoke")
        assert resp.status_code == 404
    finally:
        await engine.dispose()


async def test_revoke_member_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        member_id = await _add_person(factory, hh_id, role="member")
        sid, csrf = await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/invitations/{inv_id}/revoke")
        assert resp.status_code == 403
    finally:
        await engine.dispose()


async def test_revoke_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, _hh = await _seed_household(factory)
        other_owner, other_hh = await _seed_household(factory)
        other_inv = await _add_invitation(factory, other_hh, other_owner, email="x@example.com")
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # owner_id's household does not own other_inv → 404 (no cross-household reach).
        resp = client.post(f"/api/household/invitations/{other_inv}/revoke")
        assert resp.status_code == 404
    finally:
        await engine.dispose()


async def test_resend_advances_expiry(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        inv_id = await _add_invitation(
            factory, hh_id, owner_id, email="cara@example.com", expires_in=timedelta(days=1)
        )
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        async with factory() as db:
            before = (await db.get(HouseholdInvitation, inv_id)).expires_at

        resp = client.post(f"/api/household/invitations/{inv_id}/resend")
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

        async with factory() as db:
            after = (await db.get(HouseholdInvitation, inv_id)).expires_at
        assert after > before
    finally:
        await engine.dispose()


async def test_resend_non_pending_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        inv_id = await _add_invitation(
            factory, hh_id, owner_id, email="dee@example.com", status="declined"
        )
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/invitations/{inv_id}/resend")
        assert resp.status_code == 409
    finally:
        await engine.dispose()


async def test_delete_terminal_204_pending_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        declined = await _add_invitation(
            factory, hh_id, owner_id, email="dee@example.com", status="declined"
        )
        pending = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.request("DELETE", f"/api/household/invitations/{declined}")
        assert resp.status_code == 204
        async with factory() as db:
            assert await db.get(HouseholdInvitation, declined) is None

        resp = client.request("DELETE", f"/api/household/invitations/{pending}")
        assert resp.status_code == 409
    finally:
        await engine.dispose()


async def test_delete_expired_pending_allowed(monkeypatch):
    """A past-expiry pending row displays as `expired` (terminal) → deletable directly (AC4)."""
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        expired = await _add_invitation(
            factory, hh_id, owner_id, email="old@example.com", expires_in=timedelta(days=-1)
        )
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.request("DELETE", f"/api/household/invitations/{expired}")
        assert resp.status_code == 204
        async with factory() as db:
            assert await db.get(HouseholdInvitation, expired) is None
    finally:
        await engine.dispose()


# ── Public validate ──


async def test_validate_pending_returns_context(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        client = _client_with_db(factory, monkeypatch)  # NO auth — public

        resp = client.get(f"/api/invitations/{inv_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "pending"
        assert body["householdName"] == "Acme Household"
        assert body["invitedByDisplayName"] == "Owner Person"
        assert body["invitedEmail"] == "cara@example.com"
    finally:
        await engine.dispose()


async def test_validate_invalid_cases_never_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        declined = await _add_invitation(
            factory, hh_id, owner_id, email="d@example.com", status="declined"
        )
        expired = await _add_invitation(
            factory, hh_id, owner_id, email="e@example.com", expires_in=timedelta(days=-1)
        )
        client = _client_with_db(factory, monkeypatch)  # NO auth

        for token in (declined, expired, str(uuid4())):  # declined, expired, unknown
            resp = client.get(f"/api/invitations/{token}")
            assert resp.status_code == 200  # never 401/404
            assert resp.json()["status"] == "invalid"
    finally:
        await engine.dispose()


# ── Accept / Decline ──


async def test_accept_joins_household_and_clears_detachment(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        # A detached (previously-removed) person with a matching email + a NULL household.
        invitee = await _add_person(factory, None, role="member", email="cara@example.com")
        async with factory() as db:
            p = await db.get(Person, invitee)
            p.detachment_reason = "removed"
            p.detached_at = datetime.now(UTC)
            await db.commit()
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")

        sid, csrf = await _seed_session(factory, invitee)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/invitations/{inv_id}/accept")
        assert resp.status_code == 204

        async with factory() as db:
            p = await db.get(Person, invitee)
            assert p.household_id == hh_id
            assert p.role == "member"
            assert p.detachment_reason is None
            assert p.detached_at is None
            inv = await db.get(HouseholdInvitation, inv_id)
            assert inv.status == "accepted"
            assert inv.accepted_at is not None
            audit_rows = (
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "household_invitation",
                            AuditLog.action == "accept",
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(audit_rows) == 1
    finally:
        await engine.dispose()


async def test_accept_email_mismatch_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        invitee = await _add_person(factory, None, role="member", email="someone@example.com")
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, invitee)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/invitations/{inv_id}/accept")
        assert resp.status_code == 403
    finally:
        await engine.dispose()


async def test_accept_already_in_household_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        _other_owner, other_hh = await _seed_household(factory)
        # invitee already belongs to other_hh; invited to hh_id with a matching email.
        invitee = await _add_person(factory, other_hh, role="member", email="cara@example.com")
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, invitee)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/invitations/{inv_id}/accept")
        assert resp.status_code == 409
    finally:
        await engine.dispose()


async def test_accept_expired_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        invitee = await _add_person(factory, None, role="member", email="cara@example.com")
        inv_id = await _add_invitation(
            factory, hh_id, owner_id, email="cara@example.com", expires_in=timedelta(days=-1)
        )
        sid, csrf = await _seed_session(factory, invitee)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/invitations/{inv_id}/accept")
        assert resp.status_code == 400
    finally:
        await engine.dispose()


async def test_decline_sets_declined_with_or_without_household(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        invitee = await _add_person(factory, None, role="member", email="cara@example.com")
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, invitee)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/invitations/{inv_id}/decline")
        assert resp.status_code == 204
        async with factory() as db:
            inv = await db.get(HouseholdInvitation, inv_id)
            assert inv.status == "declined"
            # The invitee was NOT joined to the household.
            assert (await db.get(Person, invitee)).household_id is None
    finally:
        await engine.dispose()


async def test_decline_email_mismatch_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        invitee = await _add_person(factory, None, role="member", email="other@example.com")
        inv_id = await _add_invitation(factory, hh_id, owner_id, email="cara@example.com")
        sid, csrf = await _seed_session(factory, invitee)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/invitations/{inv_id}/decline")
        assert resp.status_code == 403
    finally:
        await engine.dispose()
