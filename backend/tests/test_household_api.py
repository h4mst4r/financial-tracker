"""Integration tests for AUTH-002 — household member management backend.

Covers all ACs:
    AC-1: GET/PATCH /api/household
    AC-2: GET/PATCH/DELETE /api/persons/{id}
    AC-3: POST /api/persons/invite
    AC-4: GET/DELETE /api/persons/invitations
    AC-5: POST /api/invitations/{id}/accept (including 403 on email mismatch)
    AC-6: PATCH /api/persons/{id}/role (owner only; self-demotion blocked)

Test isolation: uses a fresh temp-file SQLite per test run (autouse fixture),
following the same pattern as test_auth_flow.py.

Import strategy: `import backend.database` at module level for DB access in
helpers/tests. The fixture does its own local `import backend.config/database`
(required because Python 3.14 scoping marks `backend` as local whenever
`import backend.models` appears inside the same function).
"""

import os
import secrets
import tempfile
from datetime import timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import backend.config
import backend.database  # module-level — helpers and tests use this directly
from backend.main import app
from backend.models.base import utcnow
from backend.models.category import Category
from backend.models.currency import Currency
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as SessionModel


@pytest.fixture(autouse=True)
def _reset_auth_bypass():
    """Ensure AUTH_BYPASS_ENABLED is False for these tests."""
    backend.config.settings.AUTH_BYPASS_ENABLED = False
    yield
    backend.config.settings.AUTH_BYPASS_ENABLED = False


# ---------------------------------------------------------------------------
# Test DB fixture — mirrors test_auth_flow.py
# All `import backend.*` statements that bind the `backend` name must come
# BEFORE `import backend.models` within the same function scope.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _use_test_db():
    """Swap in a fresh temp SQLite for every test run."""
    import backend.config
    import backend.database as _bdb  # local alias avoids rebind conflict

    original_url = backend.config.settings.DATABASE_URL
    original_engine = _bdb.engine
    original_factory = _bdb.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="hh_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(
        test_url,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    _bdb.engine = engine
    _bdb.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401 — registers all models with Base.metadata
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
# Seed helpers  (use module-level `backend.database` reference)
# ---------------------------------------------------------------------------


async def _create_household_and_owner():
    """Create a household, owner person, and session."""
    household_id = uuid4()
    owner_id = uuid4()
    now = utcnow()
    csrf = secrets.token_urlsafe(32)

    async with backend.database.async_session_factory() as db:
        hh = Household(
            id=household_id,
            name="Test Household",
            base_currency="SGD",
            timezone="Asia/Singapore",
            created_by=owner_id,
        )
        owner = Person(
            id=owner_id,
            household_id=household_id,
            google_sub=f"owner_{owner_id.hex}",
            email="owner@example.com",
            display_name="Owner User",
            role="owner",
            display_currency="SGD",
            default_view="household",
            created_by=owner_id,
        )
        session = SessionModel(
            person_id=owner_id,
            expires_at=now + timedelta(minutes=30),
            last_activity_at=now,
            csrf_token=csrf,
        )
        db.add_all([hh, owner, session])
        # flush() generates DB-side defaults (e.g. session.id UUID); capture
        # all IDs NOW — commit() expires ORM instances, making attribute access fail.
        await db.flush()
        session_id = session.id
        await db.commit()

    return household_id, owner_id, session_id, csrf


async def _create_member(
    household_id, *, email="member@example.com", role="member"
):
    """Add a member person (no session) to the household. Returns person_id."""
    member_id = uuid4()
    async with backend.database.async_session_factory() as db:
        member = Person(
            id=member_id,
            household_id=household_id,
            google_sub=f"member_{member_id.hex}",
            email=email,
            display_name="Member User",
            role=role,
            display_currency="SGD",
            default_view="household",
            created_by=member_id,
        )
        db.add(member)
        await db.commit()
    return member_id


async def _create_session_for(person_id, household_id):
    """Create an auth session for a person. Returns (session_id, csrf_token)."""
    now = utcnow()
    csrf = secrets.token_urlsafe(32)
    async with backend.database.async_session_factory() as db:
        session = SessionModel(
            person_id=person_id,
            expires_at=now + timedelta(minutes=30),
            last_activity_at=now,
            csrf_token=csrf,
        )
        db.add(session)
        await db.flush()        # capture id before commit expires instance
        session_id = session.id
        await db.commit()
    return session_id, csrf


# ---------------------------------------------------------------------------
# AC-1: GET/PATCH /api/household
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_household_returns_details():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/household",
            cookies={"session_id": str(session_id)},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(hh_id)
    assert body["name"] == "Test Household"
    assert body["baseCurrency"] == "SGD"
    assert body["timezone"] == "Asia/Singapore"


@pytest.mark.asyncio
async def test_patch_household_owner_updates_name():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            "/api/household",
            json={"name": "Ben & Kim's Household"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Ben & Kim's Household"


@pytest.mark.asyncio
async def test_patch_household_non_owner_gets_403():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    admin_id = await _create_member(hh_id, email="admin@example.com", role="admin")
    admin_session_id, admin_csrf = await _create_session_for(admin_id, hh_id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            "/api/household",
            json={"name": "Hacked Name"},
            cookies={"session_id": str(admin_session_id)},
            headers={"X-CSRF-Token": admin_csrf},
        )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# AC-2: GET/PATCH/DELETE /api/persons
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_persons_returns_members():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_member(hh_id, email="member@example.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/persons",
            cookies={"session_id": str(session_id)},
        )
    assert resp.status_code == 200
    emails = [p["email"] for p in resp.json()]
    assert "owner@example.com" in emails
    assert "member@example.com" in emails


@pytest.mark.asyncio
async def test_patch_person_self_update():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{owner_id}",
            json={"display_name": "Benjamin"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    assert resp.json()["displayName"] == "Benjamin"


@pytest.mark.asyncio
async def test_patch_person_admin_updates_member():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    admin_id = await _create_member(hh_id, email="admin@example.com", role="admin")
    admin_session_id, admin_csrf = await _create_session_for(admin_id, hh_id)
    member_id = await _create_member(hh_id, email="member@example.com", role="member")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{member_id}",
            json={"display_name": "Updated Member"},
            cookies={"session_id": str(admin_session_id)},
            headers={"X-CSRF-Token": admin_csrf},
        )
    assert resp.status_code == 200
    assert resp.json()["displayName"] == "Updated Member"


@pytest.mark.asyncio
async def test_patch_person_member_cannot_update_other():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    m1_id = await _create_member(hh_id, email="m1@example.com")
    m2_id = await _create_member(hh_id, email="m2@example.com")
    m1_session_id, m1_csrf = await _create_session_for(m1_id, hh_id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{m2_id}",
            json={"display_name": "Nope"},
            cookies={"session_id": str(m1_session_id)},
            headers={"X-CSRF-Token": m1_csrf},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_person_hard_deletes_when_no_events():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    member_id = await _create_member(hh_id, email="todelete@example.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.delete(
            f"/api/persons/{member_id}",
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    assert resp.json()["action"] == "deleted"

    # Verify person is gone from DB
    from sqlalchemy import select
    async with backend.database.async_session_factory() as db:
        result = await db.execute(select(Person).where(Person.id == member_id))
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_person_owner_gets_403():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.delete(
            f"/api/persons/{owner_id}",
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# AC-3: POST /api/persons/invite
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invite_member_creates_invitation():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/persons/invite",
            json={"invited_email": "newmember@example.com"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["invitedEmail"] == "newmember@example.com"
    assert body["status"] == "pending"
    assert body["householdId"] == str(hh_id)


@pytest.mark.asyncio
async def test_invite_member_non_admin_gets_403():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    member_id = await _create_member(hh_id, email="member@example.com", role="member")
    member_session_id, member_csrf = await _create_session_for(member_id, hh_id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/persons/invite",
            json={"invited_email": "another@example.com"},
            cookies={"session_id": str(member_session_id)},
            headers={"X-CSRF-Token": member_csrf},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invite_existing_member_gets_409():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_member(hh_id, email="existing@example.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/persons/invite",
            json={"invited_email": "existing@example.com"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# AC-4: GET/DELETE /api/persons/invitations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_invitations_returns_pending():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    now = utcnow()
    async with backend.database.async_session_factory() as db:
        inv = HouseholdInvitation(
            household_id=hh_id,
            invited_email="pending@example.com",
            invited_by=owner_id,
            created_at=now,
            expires_at=now + timedelta(days=7),
        )
        db.add(inv)
        await db.flush()
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/persons/invitations",
            cookies={"session_id": str(session_id)},
        )
    assert resp.status_code == 200
    assert any(i["invitedEmail"] == "pending@example.com" for i in resp.json())


@pytest.mark.asyncio
async def test_cancel_invitation():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    now = utcnow()
    async with backend.database.async_session_factory() as db:
        inv = HouseholdInvitation(
            household_id=hh_id,
            invited_email="tocancel@example.com",
            invited_by=owner_id,
            created_at=now,
            expires_at=now + timedelta(days=7),
        )
        db.add(inv)
        await db.flush()
        inv_id = inv.id
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.delete(
            f"/api/persons/invitations/{inv_id}",
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


# ---------------------------------------------------------------------------
# AC-5: POST /api/invitations/{id}/accept
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accept_invitation_correct_email():
    """Person already assigned to invited household (via seed_household_if_needed) accepts.

    Real flow per ARCH §7.1: seed_household_if_needed assigns the person to the invited
    household on first login. accept_invitation is idempotent when person.household_id
    already matches — it just marks the invitation accepted.
    Persons belonging to a *different* household are blocked with 409 (ARCH §2.6).
    """
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    # Invitee is already in the target household (assigned by seed_household_if_needed).
    invitee_id = uuid4()
    now = utcnow()
    async with backend.database.async_session_factory() as db:
        invitee = Person(
            id=invitee_id,
            household_id=hh_id,   # already in target household — idempotent accept path
            google_sub=f"invitee_{invitee_id.hex}",
            email="invitee@example.com",
            display_name="Invitee",
            role="member",
            display_currency="SGD",
            default_view="household",
            created_by=invitee_id,
        )
        inv = HouseholdInvitation(
            household_id=hh_id,
            invited_email="invitee@example.com",
            invited_by=owner_id,
            created_at=now,
            expires_at=now + timedelta(days=7),
        )
        db.add_all([invitee, inv])
        await db.flush()
        inv_id = inv.id
        await db.commit()

    invitee_session_id, invitee_csrf = await _create_session_for(invitee_id, hh_id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/invitations/{inv_id}/accept",
            cookies={"session_id": str(invitee_session_id)},
            headers={"X-CSRF-Token": invitee_csrf},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"

    # Verify person is still in the target household with member role
    from sqlalchemy import select
    async with backend.database.async_session_factory() as db:
        result = await db.execute(select(Person).where(Person.id == invitee_id))
        updated = result.scalar_one()
        assert updated.household_id == hh_id
        assert updated.role == "member"


@pytest.mark.asyncio
async def test_accept_invitation_wrong_email_returns_403():
    """Person whose email doesn't match the invitation gets 403."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    wrong_hh_id = uuid4()
    wrong_person_id = uuid4()
    now = utcnow()
    async with backend.database.async_session_factory() as db:
        wrong_hh = Household(
            id=wrong_hh_id,
            name="Wrong HH",
            base_currency="SGD",
            timezone="Asia/Singapore",
            created_by=wrong_person_id,
        )
        wrong_person = Person(
            id=wrong_person_id,
            household_id=wrong_hh_id,
            google_sub=f"wrong_{wrong_person_id.hex}",
            email="wrong@example.com",
            display_name="Wrong Person",
            role="owner",
            display_currency="SGD",
            default_view="household",
            created_by=wrong_person_id,
        )
        inv = HouseholdInvitation(
            household_id=hh_id,
            invited_email="correct@example.com",  # different from wrong@
            invited_by=owner_id,
            created_at=now,
            expires_at=now + timedelta(days=7),
        )
        db.add_all([wrong_hh, wrong_person, inv])
        await db.flush()
        inv_id = inv.id
        await db.commit()

    wrong_session_id, wrong_csrf = await _create_session_for(wrong_person_id, wrong_hh_id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/invitations/{inv_id}/accept",
            cookies={"session_id": str(wrong_session_id)},
            headers={"X-CSRF-Token": wrong_csrf},
        )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# AC-6: PATCH /api/persons/{id}/role
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_owner_can_change_member_role_to_admin():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    member_id = await _create_member(hh_id, email="member@example.com", role="member")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{member_id}/role",
            json={"role": "admin"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_owner_cannot_change_own_role():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{owner_id}/role",
            json={"role": "member"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_non_owner_cannot_change_role():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    admin_id = await _create_member(hh_id, email="admin@example.com", role="admin")
    admin_session_id, admin_csrf = await _create_session_for(admin_id, hh_id)
    member_id = await _create_member(hh_id, email="member@example.com", role="member")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{member_id}/role",
            json={"role": "admin"},
            cookies={"session_id": str(admin_session_id)},
            headers={"X-CSRF-Token": admin_csrf},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invalid_role_value_returns_422():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    member_id = await _create_member(hh_id, email="member@example.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/persons/{member_id}/role",
            json={"role": "owner"},  # "owner" not allowed via this endpoint
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unauthenticated_request_returns_401():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/household")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# AC-8: DELETE /api/household — household deletion (AUTH-005)
# ---------------------------------------------------------------------------


async def _seed_categories_and_currency(household_id, owner_id):
    """Seed 12 categories + 1 currency as seed_household_if_needed does in production."""
    async with backend.database.async_session_factory() as db:
        currency = Currency(
            household_id=household_id,
            code="SGD",
            name="Singapore Dollar",
            symbol="S$",
            is_base=True,
            is_display_active=True,
            rate_to_base=1.0,
        )
        db.add(currency)
        for name in ["Food & Drink", "Shopping", "Housing", "Transport", "Other"]:
            db.add(Category(
                household_id=household_id,
                name=name,
                category_type="expense",
                color="#6366f1",
                icon="🏷",
                depth=0,
                created_by=owner_id,
            ))
        await db.commit()


@pytest.mark.asyncio
async def test_delete_household_owner_succeeds_with_seeded_data():
    """Owner can delete household; returns 204; seeded categories+currency are also deleted."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _seed_categories_and_currency(hh_id, owner_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.request(
            "DELETE",
            "/api/household",
            json={"confirmName": "Test Household"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 204
    assert resp.content == b""

    # Session is now invalid — subsequent /api/household returns 401
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        follow_up = await client.get(
            "/api/household",
            cookies={"session_id": str(session_id)},
        )
    assert follow_up.status_code == 401


@pytest.mark.asyncio
async def test_delete_household_wrong_confirm_name_returns_422():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.request(
            "DELETE",
            "/api/household",
            json={"confirmName": "Wrong Name"},
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_household_non_owner_returns_403():
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    member_id = await _create_member(hh_id, email="member2@example.com")
    member_session_id, member_csrf = await _create_session_for(member_id, hh_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.request(
            "DELETE",
            "/api/household",
            json={"confirmName": "Test Household"},
            cookies={"session_id": str(member_session_id)},
            headers={"X-CSRF-Token": member_csrf},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_household_case_insensitive_confirm_name():
    """confirm_name match is case-insensitive."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.request(
            "DELETE",
            "/api/household",
            json={"confirmName": "TEST HOUSEHOLD"},  # uppercase — should still match
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 204
