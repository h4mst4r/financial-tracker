"""AUTH-007 — Tests for can_create_household grant/revoke endpoint and decline changes.

Uses the same autouse fixtures as test_household_api.py.
"""

import secrets
from datetime import timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import backend.database
from backend.main import app
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as SessionModel
from backend.models.base import utcnow


@pytest.fixture(autouse=True)
def _reset_auth_bypass():
    import backend.config
    original = backend.config.settings.AUTH_BYPASS_ENABLED
    backend.config.settings.AUTH_BYPASS_ENABLED = False
    yield
    backend.config.settings.AUTH_BYPASS_ENABLED = original


@pytest_asyncio.fixture(autouse=True)
async def _use_test_db():
    import tempfile
    import os
    import backend.config
    import backend.database as _bdb
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

    original_url = backend.config.settings.DATABASE_URL
    original_engine = _bdb.engine
    original_factory = _bdb.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="hh_creation_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(test_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    _bdb.engine = engine
    _bdb.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401
    from backend.database import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    backend.config.settings.DATABASE_URL = original_url
    _bdb.engine = original_engine
    _bdb.async_session_factory = original_factory
    try:
        os.close(tmp_fd)
        os.unlink(tmp_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _seed_owner():
    hh_id = uuid4()
    owner_id = uuid4()
    csrf = secrets.token_urlsafe(32)
    now = utcnow()

    async with backend.database.async_session_factory() as db:
        hh = Household(id=hh_id, name="Test HH", base_currency="SGD",
                       timezone="Asia/Singapore", created_by=owner_id)
        db.add(hh)
        await db.flush()
        owner = Person(
            id=owner_id, household_id=hh_id,
            google_sub=f"owner_{owner_id.hex}", email="owner@example.com",
            display_name="Owner", role="owner",
            display_currency="SGD", default_view="household",
            can_create_household=True, created_by=owner_id,
        )
        session_obj = SessionModel(
            person_id=owner_id,
            expires_at=now + timedelta(minutes=30),
            last_activity_at=now,
            csrf_token=csrf,
        )
        db.add(owner)
        db.add(session_obj)
        await db.flush()
        session_id = session_obj.id
        await db.commit()

    return hh_id, owner_id, session_id, csrf


async def _add_member(hh_id, *, email="member@example.com", role="member", can_create=False):
    member_id = uuid4()
    csrf = secrets.token_urlsafe(32)
    now = utcnow()

    async with backend.database.async_session_factory() as db:
        member = Person(
            id=member_id, household_id=hh_id,
            google_sub=f"member_{member_id.hex}", email=email,
            display_name="Member", role=role,
            display_currency="SGD", default_view="household",
            can_create_household=can_create, created_by=member_id,
        )
        session_obj = SessionModel(
            person_id=member_id,
            expires_at=now + timedelta(minutes=30),
            last_activity_at=now,
            csrf_token=csrf,
        )
        db.add(member)
        db.add(session_obj)
        await db.flush()
        session_id = session_obj.id
        await db.commit()

    return member_id, session_id, csrf


# ---------------------------------------------------------------------------
# Grant / revoke can_create_household
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_owner_grants_can_create_household():
    hh_id, owner_id, owner_session, owner_csrf = await _seed_owner()
    member_id, _, _ = await _add_member(hh_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{member_id}/household-creation",
            json={"canCreateHousehold": True},
            cookies={"session_id": str(owner_session)},
            headers={"X-CSRF-Token": owner_csrf},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["canCreateHousehold"] is True


@pytest.mark.asyncio
async def test_owner_revokes_can_create_household():
    hh_id, owner_id, owner_session, owner_csrf = await _seed_owner()
    member_id, _, _ = await _add_member(hh_id, can_create=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{member_id}/household-creation",
            json={"canCreateHousehold": False},
            cookies={"session_id": str(owner_session)},
            headers={"X-CSRF-Token": owner_csrf},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["canCreateHousehold"] is False


@pytest.mark.asyncio
async def test_non_owner_cannot_grant_household_creation():
    hh_id, owner_id, owner_session, owner_csrf = await _seed_owner()
    admin_id, admin_session, admin_csrf = await _add_member(hh_id, email="admin@example.com", role="admin")
    member_id, _, _ = await _add_member(hh_id, email="member2@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{member_id}/household-creation",
            json={"canCreateHousehold": True},
            cookies={"session_id": str(admin_session)},
            headers={"X-CSRF-Token": admin_csrf},
        )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_owner_cannot_self_revoke():
    hh_id, owner_id, owner_session, owner_csrf = await _seed_owner()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{owner_id}/household-creation",
            json={"canCreateHousehold": False},
            cookies={"session_id": str(owner_session)},
            headers={"X-CSRF-Token": owner_csrf},
        )

    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Decline invitation — detach-only (AUTH-007)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_decline_invitation_detaches_person_no_new_household():
    """Declining an invitation detaches the person; no new household is created."""
    from sqlalchemy import select, func

    hh_id, owner_id, owner_session, owner_csrf = await _seed_owner()
    member_id, member_session, member_csrf = await _add_member(hh_id, email="invitee@example.com")

    inv_id = uuid4()
    now = utcnow()
    async with backend.database.async_session_factory() as db:
        inv = HouseholdInvitation(
            id=inv_id,
            household_id=hh_id,
            invited_email="invitee@example.com",
            invited_by=owner_id,
            expires_at=now + timedelta(days=7),
            status="pending",
        )
        db.add(inv)
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/invitations/{inv_id}/decline",
            cookies={"session_id": str(member_session)},
            headers={"X-CSRF-Token": member_csrf},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["household"] is None
    assert body["isFirstLogin"] is False

    async with backend.database.async_session_factory() as db:
        result = await db.execute(select(Person).where(Person.id == member_id))
        person = result.scalar_one_or_none()
        assert person is not None
        assert person.household_id is None

        # Exactly one household still exists (the original) — no new one created
        hh_count = await db.execute(select(func.count()).select_from(Household))
        assert hh_count.scalar() == 1


@pytest.mark.asyncio
async def test_decline_wrong_email_returns_403():
    hh_id, owner_id, owner_session, owner_csrf = await _seed_owner()
    member_id, member_session, member_csrf = await _add_member(hh_id, email="member@example.com")

    inv_id = uuid4()
    now = utcnow()
    async with backend.database.async_session_factory() as db:
        inv = HouseholdInvitation(
            id=inv_id,
            household_id=hh_id,
            invited_email="different@example.com",
            invited_by=owner_id,
            expires_at=now + timedelta(days=7),
            status="pending",
        )
        db.add(inv)
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/invitations/{inv_id}/decline",
            cookies={"session_id": str(member_session)},
            headers={"X-CSRF-Token": member_csrf},
        )

    assert resp.status_code == 403
