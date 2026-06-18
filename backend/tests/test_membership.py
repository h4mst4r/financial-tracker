"""Membership transition tests (Story 2.7): the three exit paths of ARCH §2.8a.

Path A `DELETE /api/household` (owner teardown), Path B `POST /api/household/leave` (admin/member),
Path C `POST /api/household/members/{id}/remove` (admin/owner) — with household-scoping, role gates
(403), 404/409 guards, session invalidation, `detachment_reason` stamping, the re-login routing
round-trip, and audit rows. Harness cloned from `test_invitations.py` (temp-DB engines disposed in
`finally` for the Windows WAL/SHM leak; CSRF middleware against a monkeypatched session factory).
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
from backend.models.budget import Category
from backend.models.currency import Currency
from backend.models.identity import Household, HouseholdInvitation, Person, Session
from backend.models.system import AuditLog
from backend.rate_limit import limiter
from backend.routers.auth import _DETACHMENT_ERROR_CODES
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "membership_test.db"
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
    """Insert a Household + base SGD Currency + a Person. Returns (person_id, hh_id)."""
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


async def _add_categories(factory, household_id: str, created_by: str) -> None:
    """Seed a parent + child category to exercise the self-referential teardown (deferred FK)."""
    parent_id = str(uuid4())
    async with factory() as db:
        db.add(
            Category(
                id=parent_id,
                household_id=household_id,
                created_by=created_by,
                name="Food",
                color="#abcdef",
                depth=0,
            )
        )
        db.add(
            Category(
                id=str(uuid4()),
                household_id=household_id,
                created_by=created_by,
                name="Groceries",
                color="#abcdef",
                depth=1,
                parent_id=parent_id,
            )
        )
        await db.commit()


async def _add_invitation(factory, household_id: str, invited_by: str, *, email: str) -> str:
    inv_id = str(uuid4())
    async with factory() as db:
        db.add(
            HouseholdInvitation(
                id=inv_id,
                household_id=household_id,
                invited_email=email,
                invited_by=invited_by,
                expires_at=datetime.now(UTC) + timedelta(days=7),
                status="pending",
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


async def _person(factory, person_id: str) -> Person:
    async with factory() as db:
        return await db.get(Person, person_id)


async def _session_count(factory, person_id: str) -> int:
    async with factory() as db:
        rows = (
            (await db.execute(select(Session).where(Session.person_id == person_id)))
            .scalars()
            .all()
        )
        return len(rows)


# ── Path A — owner deletes the household ──


async def test_delete_household_owner_teardown(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        await _add_categories(factory, hh_id, owner_id)
        await _add_invitation(factory, hh_id, owner_id, email="invitee@example.com")
        # A second household must be left entirely untouched (scoping).
        other_owner, other_hh = await _seed_household(factory)

        owner_sid, owner_csrf = await _seed_session(factory, owner_id)
        await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, owner_sid, owner_csrf)

        resp = client.delete("/api/household")
        assert resp.status_code == 204

        async with factory() as db:
            # All household-scoped rows gone.
            assert await db.get(Household, hh_id) is None
            assert (
                await db.execute(select(Currency).where(Currency.household_id == hh_id))
            ).scalars().all() == []
            assert (
                await db.execute(select(Category).where(Category.household_id == hh_id))
            ).scalars().all() == []
            assert (
                await db.execute(
                    select(HouseholdInvitation).where(HouseholdInvitation.household_id == hh_id)
                )
            ).scalars().all() == []
            # Members detached (survive) with the right reason.
            for pid in (owner_id, member_id):
                p = await db.get(Person, pid)
                assert p is not None
                assert p.household_id is None
                assert p.detachment_reason == "household_deleted"
                assert p.detached_at is not None
            # The audit row survives the teardown.
            audit_rows = (
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "household", AuditLog.action == "delete"
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(audit_rows) == 1
            # Second household untouched.
            assert await db.get(Household, other_hh) is not None
            other = await db.get(Person, other_owner)
            assert other.household_id == other_hh

        # Every member's sessions were invalidated.
        assert await _session_count(factory, owner_id) == 0
        assert await _session_count(factory, member_id) == 0

        # AC4: a detached member re-logging in raises NotInvitedError carrying `household_deleted`,
        # which the callback maps to `?error=household_deleted` (the §2.6-step-4 routing).
        async with factory() as db:
            member = await db.get(Person, member_id)
            with pytest.raises(auth.NotInvitedError) as exc:
                await auth.seed_household_if_needed(db, member)
            assert exc.value.detachment_reason == "household_deleted"
            assert _DETACHMENT_ERROR_CODES.get(exc.value.detachment_reason) == "household_deleted"
    finally:
        await engine.dispose()


async def test_delete_household_non_owner_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        sid, csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.delete("/api/household")
        assert resp.status_code == 403
        assert resp.json()["type"] == "forbidden"
        # Household still exists.
        async with factory() as db:
            assert await db.get(Household, hh_id) is not None
    finally:
        await engine.dispose()


# ── Path B — member/admin leaves ──


async def test_leave_household_member(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        sid, csrf = await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/leave")
        assert resp.status_code == 204

        leaver = await _person(factory, member_id)
        assert leaver.household_id is None
        assert leaver.detachment_reason == "left"
        assert leaver.detached_at is not None
        assert await _session_count(factory, member_id) == 0
        # Owner untouched.
        owner = await _person(factory, owner_id)
        assert owner.household_id == hh_id
        # AC5: the leave wrote exactly one membership audit row (actor = the leaver).
        async with factory() as db:
            rows = (
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "membership",
                            AuditLog.entity_id == member_id,
                            AuditLog.action == "delete",
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(rows) == 1
            assert rows[0].actor_id == member_id
    finally:
        await engine.dispose()


async def test_leave_household_owner_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/leave")
        assert resp.status_code == 409
        assert resp.json()["type"] == "conflict"
        owner = await _person(factory, owner_id)
        assert owner.household_id == hh_id  # still in the household
    finally:
        await engine.dispose()


async def test_leave_invalidates_session_then_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        sid, csrf = await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        assert client.post("/api/household/leave").status_code == 204
        # The same (now-deleted) session can no longer authenticate.
        assert client.get("/api/household/members").status_code == 401
    finally:
        await engine.dispose()


# ── Path C — admin/owner removes a member ──


async def test_remove_member_admin(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        member_id = await _add_person(factory, hh_id, role="member")
        await _seed_session(factory, member_id)
        sid, csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/members/{member_id}/remove")
        assert resp.status_code == 204

        removed = await _person(factory, member_id)
        assert removed.household_id is None
        assert removed.detachment_reason == "removed"
        assert removed.detached_at is not None
        assert await _session_count(factory, member_id) == 0
        # Caller + owner untouched.
        assert (await _person(factory, admin_id)).household_id == hh_id
        assert (await _person(factory, owner_id)).household_id == hh_id
        # AC5: the remove wrote one membership audit row (actor = admin, target = member).
        async with factory() as db:
            rows = (
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "membership",
                            AuditLog.entity_id == member_id,
                            AuditLog.action == "delete",
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(rows) == 1
            assert rows[0].actor_id == admin_id
    finally:
        await engine.dispose()


async def test_remove_owner_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        sid, csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/members/{owner_id}/remove")
        assert resp.status_code == 409
        assert (await _person(factory, owner_id)).household_id == hh_id
    finally:
        await engine.dispose()


async def test_remove_self_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        sid, csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/members/{admin_id}/remove")
        assert resp.status_code == 409
        assert (await _person(factory, admin_id)).household_id == hh_id
    finally:
        await engine.dispose()


async def test_remove_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        # A member of a different household.
        _other_owner, other_hh = await _seed_household(factory)
        other_member = await _add_person(factory, other_hh, role="member")
        sid, csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/members/{other_member}/remove")
        assert resp.status_code == 404
        # Untouched.
        assert (await _person(factory, other_member)).household_id == other_hh
    finally:
        await engine.dispose()


async def test_remove_by_plain_member_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        other_member = await _add_person(factory, hh_id, role="member")
        sid, csrf = await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post(f"/api/household/members/{other_member}/remove")
        assert resp.status_code == 403
        assert resp.json()["type"] == "forbidden"
    finally:
        await engine.dispose()


# ── Re-login routing round-trip (AC4) ──


async def test_detached_member_relogin_routes_by_reason(monkeypatch):
    """After detach, the next login raises NotInvitedError carrying the reason, which the callback
    maps to the matching `?error=` code (the existing §2.6-step-4 routing). Proves the stamp→route
    contract without re-exercising the OAuth HTTP layer."""
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        admin_sid, admin_csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, admin_sid, admin_csrf)

        assert client.post(f"/api/household/members/{member_id}/remove").status_code == 204

        async with factory() as db:
            person = await db.get(Person, member_id)
            with pytest.raises(auth.NotInvitedError) as exc:
                await auth.seed_household_if_needed(db, person)
            assert exc.value.detachment_reason == "removed"
            assert _DETACHMENT_ERROR_CODES.get(exc.value.detachment_reason) == "removed"
    finally:
        await engine.dispose()


# ── Story 2.8: role management (FR-P-005) ──


async def _audit_count(factory, *, entity_type: str, action: str, entity_id: str) -> int:
    async with factory() as db:
        rows = (
            (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.entity_type == entity_type,
                        AuditLog.action == action,
                        AuditLog.entity_id == entity_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        return len(rows)


async def test_set_member_role_promote_then_demote_takes_effect_next_request(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        owner_sid, owner_csrf = await _seed_session(factory, owner_id)
        member_sid, member_csrf = await _seed_session(factory, member_id)

        owner_client = _client_with_db(factory, monkeypatch)
        _auth(owner_client, owner_sid, owner_csrf)

        # Promote member → admin.
        resp = owner_client.patch(
            f"/api/household/members/{member_id}/role", json={"role": "admin"}
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"
        assert (await _person(factory, member_id)).role == "admin"
        assert (
            await _audit_count(factory, entity_type="person", action="update", entity_id=member_id)
            == 1
        )

        # Next-request effect: the now-admin member can reach an admin-gated route.
        member_client = _client_with_db(factory, monkeypatch)
        _auth(member_client, member_sid, member_csrf)
        assert member_client.get("/api/household/invitations/manage").status_code == 200

        # Demote back → member; the same session now 403s on the admin-gated route.
        resp = owner_client.patch(
            f"/api/household/members/{member_id}/role", json={"role": "member"}
        )
        assert resp.status_code == 200
        assert (await _person(factory, member_id)).role == "member"
        assert member_client.get("/api/household/invitations/manage").status_code == 403
    finally:
        await engine.dispose()


async def test_set_member_role_guards(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        member_id = await _add_person(factory, hh_id, role="member")
        _other_owner, other_hh = await _seed_household(factory)
        other_member = await _add_person(factory, other_hh, role="member")

        # Admin caller (not owner) → 403.
        admin_sid, admin_csrf = await _seed_session(factory, admin_id)
        admin_client = _client_with_db(factory, monkeypatch)
        _auth(admin_client, admin_sid, admin_csrf)
        assert (
            admin_client.patch(
                f"/api/household/members/{member_id}/role", json={"role": "admin"}
            ).status_code
            == 403
        )

        owner_sid, owner_csrf = await _seed_session(factory, owner_id)
        owner_client = _client_with_db(factory, monkeypatch)
        _auth(owner_client, owner_sid, owner_csrf)
        # Owner-target → 409 (the owner role is not transferable here).
        assert (
            owner_client.patch(
                f"/api/household/members/{owner_id}/role", json={"role": "admin"}
            ).status_code
            == 409
        )
        # Bad role → 400.
        assert (
            owner_client.patch(
                f"/api/household/members/{member_id}/role", json={"role": "owner"}
            ).status_code
            == 400
        )
        # Cross-household target → 404.
        assert (
            owner_client.patch(
                f"/api/household/members/{other_member}/role", json={"role": "admin"}
            ).status_code
            == 404
        )
    finally:
        await engine.dispose()


# ── Story 2.8: archive / restore (FR-P-007) ──


async def test_archive_member_blocks_login_and_kills_sessions(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        member_sid, _csrf = await _seed_session(factory, member_id)
        admin_id = await _add_person(factory, hh_id, role="admin")
        admin_sid, admin_csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, admin_sid, admin_csrf)

        resp = client.post(f"/api/household/members/{member_id}/archive")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "archived"
        archived = await _person(factory, member_id)
        assert archived.archived is True
        assert archived.archived_by == admin_id
        assert archived.archived_at is not None
        assert archived.household_id == hh_id  # membership intact
        assert await _session_count(factory, member_id) == 0
        assert (
            await _audit_count(factory, entity_type="person", action="archive", entity_id=member_id)
            == 1
        )

        # The archived member's old session can no longer authenticate (it was deleted → 401).
        member_client = _client_with_db(factory, monkeypatch)
        member_client.cookies.set(auth.SESSION_COOKIE_NAME, member_sid)
        assert member_client.get("/api/household/members").status_code == 401
    finally:
        await engine.dispose()


async def test_validate_session_rejects_archived_person(monkeypatch):
    """Defense-in-depth: even a surviving session row for an archived person validates to None."""
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        sid, _csrf = await _seed_session(factory, member_id)
        # Archive directly (keep the session row) to exercise the validate_session early-return.
        async with factory() as db:
            person = await db.get(Person, member_id)
            person.archived = True
            await db.commit()

        async with factory() as db:
            assert await auth.validate_session(db, sid, bypass_enabled=False) is None
    finally:
        await engine.dispose()


async def test_archived_relogin_raises_and_callback_routes_account_archived(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        person = await _person(factory, member_id)
        async with factory() as db:
            row = await db.get(Person, member_id)
            row.archived = True
            await db.commit()

        async def _fake_exchange(code):
            return {"id_token": "fake"}  # nosec B105 (test stub, not a secret)

        monkeypatch.setattr(auth, "_exchange_code_for_tokens", _fake_exchange)
        monkeypatch.setattr(
            auth,
            "_verify_id_token",
            lambda t: {"sub": person.google_sub, "email": person.email, "email_verified": True},
        )

        # Service-level: complete_oauth_login raises before minting a session.
        async with factory() as db:
            with pytest.raises(auth.AccountArchivedError):
                await auth.complete_oauth_login(db, code="abc", ip=None, user_agent=None)

        # HTTP-level: the callback maps it to ?error=account_archived (never a 500/session cookie).
        client = _client_with_db(factory, monkeypatch)
        state = auth.sign_state()
        client.cookies.set(auth.OAUTH_STATE_COOKIE, state)
        resp = client.get(f"/auth/callback?code=abc&state={state}", follow_redirects=False)
        assert resp.status_code == 302
        assert "error=account_archived" in resp.headers["location"]
        assert auth.SESSION_COOKIE_NAME not in resp.headers.get("set-cookie", "")
    finally:
        await engine.dispose()


async def test_archive_guards(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        member_id = await _add_person(factory, hh_id, role="member")
        _other_owner, other_hh = await _seed_household(factory)
        other_member = await _add_person(factory, other_hh, role="member")

        # Plain member caller → 403.
        member_sid, member_csrf = await _seed_session(factory, member_id)
        member_client = _client_with_db(factory, monkeypatch)
        _auth(member_client, member_sid, member_csrf)
        assert member_client.post(f"/api/household/members/{admin_id}/archive").status_code == 403

        admin_sid, admin_csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, admin_sid, admin_csrf)
        # Owner-target → 409.
        assert client.post(f"/api/household/members/{owner_id}/archive").status_code == 409
        # Self-target → 409.
        assert client.post(f"/api/household/members/{admin_id}/archive").status_code == 409
        # Cross-household → 404.
        assert client.post(f"/api/household/members/{other_member}/archive").status_code == 404
        # Already archived → 409.
        assert client.post(f"/api/household/members/{member_id}/archive").status_code == 200
        assert client.post(f"/api/household/members/{member_id}/archive").status_code == 409
    finally:
        await engine.dispose()


async def test_restore_member(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        member_id = await _add_person(factory, hh_id, role="member")
        person = await _person(factory, member_id)
        admin_sid, admin_csrf = await _seed_session(factory, admin_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, admin_sid, admin_csrf)

        assert client.post(f"/api/household/members/{member_id}/archive").status_code == 200
        # Restoring a non-archived member → 409 (the owner here is not archived).
        # First the happy path: restore the archived member.
        resp = client.post(f"/api/household/members/{member_id}/restore")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        restored = await _person(factory, member_id)
        assert restored.archived is False
        assert restored.archived_at is None and restored.archived_by is None
        assert (
            await _audit_count(factory, entity_type="person", action="restore", entity_id=member_id)
            == 1
        )

        # Restoring a now-active member → 409 (nothing to restore).
        assert client.post(f"/api/household/members/{member_id}/restore").status_code == 409

        # A restored person can log in fresh (no archived block).
        async def _fake_exchange(code):
            return {"id_token": "fake"}  # nosec B105 (test stub, not a secret)

        monkeypatch.setattr(auth, "_exchange_code_for_tokens", _fake_exchange)
        monkeypatch.setattr(
            auth,
            "_verify_id_token",
            lambda t: {"sub": person.google_sub, "email": person.email, "email_verified": True},
        )
        async with factory() as db:
            session = await auth.complete_oauth_login(db, code="abc", ip=None, user_agent=None)
            await db.commit()
            assert session.person_id == member_id
    finally:
        await engine.dispose()


# ── Story 2.8: hard-delete empty person (FR-P-008) ──


async def test_delete_member_empty_204_no_audit(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        owner_sid, owner_csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, owner_sid, owner_csrf)

        # Archive first kills the member's sessions so they're truly empty (no referrers).
        assert client.post(f"/api/household/members/{member_id}/archive").status_code == 200
        audit_before = await _audit_count(
            factory, entity_type="person", action="delete", entity_id=member_id
        )

        resp = client.delete(f"/api/household/members/{member_id}")
        assert resp.status_code == 204
        assert await _person(factory, member_id) is None
        # No audit row for a confirmed-empty hard-delete (ARCH §4.7).
        audit_after = await _audit_count(
            factory, entity_type="person", action="delete", entity_id=member_id
        )
        assert audit_after == audit_before == 0
    finally:
        await engine.dispose()


async def test_delete_member_with_dependency_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        member_id = await _add_person(factory, hh_id, role="member")
        # The member has a live session → non-empty → 409 (forces archive-first).
        await _seed_session(factory, member_id)
        owner_sid, owner_csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, owner_sid, owner_csrf)

        resp = client.delete(f"/api/household/members/{member_id}")
        assert resp.status_code == 409
        assert resp.json()["type"] == "has_dependencies"
        assert await _person(factory, member_id) is not None
    finally:
        await engine.dispose()


async def test_delete_member_guards(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        admin_id = await _add_person(factory, hh_id, role="admin")
        _other_owner, other_hh = await _seed_household(factory)
        other_member = await _add_person(factory, other_hh, role="member")

        # Admin caller (not owner) → 403.
        admin_sid, admin_csrf = await _seed_session(factory, admin_id)
        admin_client = _client_with_db(factory, monkeypatch)
        _auth(admin_client, admin_sid, admin_csrf)
        assert admin_client.delete(f"/api/household/members/{other_member}").status_code == 403

        owner_sid, owner_csrf = await _seed_session(factory, owner_id)
        owner_client = _client_with_db(factory, monkeypatch)
        _auth(owner_client, owner_sid, owner_csrf)
        # Owner-target → 409 (never deletable).
        assert owner_client.delete(f"/api/household/members/{owner_id}").status_code == 409
        # Cross-household → 404.
        assert owner_client.delete(f"/api/household/members/{other_member}").status_code == 404
    finally:
        await engine.dispose()


async def test_members_list_status_and_can_delete(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_household(factory)
        empty_member = await _add_person(factory, hh_id, role="member")
        referenced = await _add_person(factory, hh_id, role="member")
        await _seed_session(factory, referenced)  # a referrer → not deletable

        owner_sid, owner_csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, owner_sid, owner_csrf)

        # Archive the empty member → status archived + deletable (it never had a session).
        assert client.post(f"/api/household/members/{empty_member}/archive").status_code == 200

        rows = {m["personId"]: m for m in client.get("/api/household/members").json()["items"]}
        assert rows[empty_member]["status"] == "archived"
        assert rows[empty_member]["canDelete"] is True
        assert rows[referenced]["canDelete"] is False  # has a session
        assert rows[owner_id]["canDelete"] is False  # owner never deletable
    finally:
        await engine.dispose()
