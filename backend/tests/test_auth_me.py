"""`GET /auth/me` tests (Story 2.4a): §2.14.C contract, isFirstLogin window, pending invite, 401.

Self-contained temp-DB engines (disposed in finally — Windows WAL/SHM leak, per 2.1/2.3). `/auth/me`
is non-exempt, so the CSRF middleware validates the session against its own
`backend.middleware.async_session_factory` — monkeypatched to the temp DB. `asyncio_mode=auto`.
"""

import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.identity import Household, HouseholdInvitation, Person
from backend.rate_limit import limiter
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "auth_me_test.db"
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


async def _seed_session_for_person(factory, person_id: str) -> tuple[str, str]:
    """Mint a session for an existing person. Returns (session_id, csrf_token)."""
    async with factory() as db:
        session = await auth.create_session(
            db, await db.get(Person, person_id), ip="127.0.0.1", user_agent="pytest"
        )
        await db.commit()
        return session.id, session.csrf_token


async def _seed_owner_household(
    factory, *, created_at: datetime | None = None, role: str = "owner"
) -> tuple[str, str]:
    """Insert a Household + a Person in it. Returns (person_id, household_id)."""
    hh_id = str(uuid4())
    person_id = str(uuid4())
    async with factory() as db:
        db.add(
            Household(
                id=hh_id,
                name="Acme Household",
                base_currency="SGD",
                timezone="Asia/Singapore",
                created_at=created_at or datetime.now(UTC),
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
        await db.commit()
    return person_id, hh_id


# ── In-household contract (§2.14.C) ──


async def test_auth_me_in_household_returns_full_contract(monkeypatch):
    engine, factory = await _make_factory()
    try:
        # created_at well outside the 2-min window so isFirstLogin is False here
        person_id, hh_id = await _seed_owner_household(
            factory, created_at=datetime.now(UTC) - timedelta(hours=1)
        )
        sid, csrf = await _seed_session_for_person(factory, person_id)

        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        body = resp.json()

        assert set(body) == {
            "person",
            "household",
            "csrfToken",
            "pendingInvitation",
            "isFirstLogin",
        }
        assert set(body["person"]) == {
            "personId",
            "displayName",
            "email",
            "role",
            "pictureUrl",
            "defaultView",
            "displayCurrency",
            "canCreateHousehold",
            # Appearance preferences (Story 2.9) — the SPA bootstraps these into the theming engine.
            "theme",
            "font",
            "density",
            "reduceMotion",
            "notificationPrefs",
        }
        assert body["person"]["personId"] == person_id
        assert body["person"]["role"] == "owner"
        assert body["household"] == {
            "householdId": hh_id,
            "name": "Acme Household",
            "baseCurrency": "SGD",
            "timezone": "Asia/Singapore",
        }
        assert body["csrfToken"] == csrf
        assert body["pendingInvitation"] is None
        assert body["isFirstLogin"] is False
    finally:
        await engine.dispose()


async def test_auth_me_is_first_login_true_for_fresh_owner(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _hh = await _seed_owner_household(factory, created_at=datetime.now(UTC))
        sid, _csrf = await _seed_session_for_person(factory, person_id)

        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        assert client.get("/auth/me").json()["isFirstLogin"] is True
    finally:
        await engine.dispose()


async def test_auth_me_is_first_login_false_for_member_in_fresh_household(monkeypatch):
    engine, factory = await _make_factory()
    try:
        # fresh household, but the person is a member → role gate makes isFirstLogin False
        person_id, _hh = await _seed_owner_household(
            factory, created_at=datetime.now(UTC), role="member"
        )
        sid, _csrf = await _seed_session_for_person(factory, person_id)

        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        assert client.get("/auth/me").json()["isFirstLogin"] is False
    finally:
        await engine.dispose()


# ── NULL-household sessions (§2.8) ──


async def test_auth_me_null_household_with_pending_invite(monkeypatch):
    engine, factory = await _make_factory()
    try:
        invite_id = str(uuid4())
        inviter_id = str(uuid4())
        hh_id = str(uuid4())
        invitee_id = str(uuid4())
        invitee_email = f"{uuid4()}@example.com"
        async with factory() as db:
            db.add(Household(id=hh_id, name="Target HH", created_by=inviter_id))
            await db.flush()
            db.add(
                Person(
                    id=inviter_id,
                    household_id=hh_id,
                    email=f"{uuid4()}@example.com",
                    display_name="Inviting Owner",
                    role="owner",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            db.add(
                Person(
                    id=invitee_id,
                    household_id=None,
                    email=invitee_email,
                    display_name="Invitee",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.flush()  # persons must exist before the invitation's invited_by FK
            db.add(
                HouseholdInvitation(
                    id=invite_id,
                    household_id=hh_id,
                    invited_email=invitee_email.upper(),  # exercise func.lower match
                    invited_by=inviter_id,
                    expires_at=datetime.now(UTC) + timedelta(days=7),
                    status="pending",
                )
            )
            await db.commit()
        sid, _csrf = await _seed_session_for_person(factory, invitee_id)

        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["household"] is None
        assert body["isFirstLogin"] is False
        assert body["pendingInvitation"] == {
            "token": invite_id,
            "householdId": hh_id,
            "householdName": "Target HH",
            "invitedByDisplayName": "Inviting Owner",
            "invitedEmail": invitee_email.upper(),
            "expiresAt": body["pendingInvitation"]["expiresAt"],
            "status": "pending",
        }
    finally:
        await engine.dispose()


async def test_auth_me_pending_invite_oldest_first(monkeypatch):
    """Multiple active pending invites → the payload surfaces the oldest, deterministically."""
    engine, factory = await _make_factory()
    try:
        inviter_id = str(uuid4())
        hh_id = str(uuid4())
        invitee_id = str(uuid4())
        invitee_email = f"{uuid4()}@example.com"
        older_id = str(uuid4())
        newer_id = str(uuid4())
        now = datetime.now(UTC)
        async with factory() as db:
            db.add(Household(id=hh_id, name="Target HH", created_by=inviter_id))
            await db.flush()
            db.add(
                Person(
                    id=inviter_id,
                    household_id=hh_id,
                    email=f"{uuid4()}@example.com",
                    display_name="Inviting Owner",
                    role="owner",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            db.add(
                Person(
                    id=invitee_id,
                    household_id=None,
                    email=invitee_email,
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.flush()
            # Insert the newer row first so row order != created_at order (proves the ORDER BY).
            db.add(
                HouseholdInvitation(
                    id=newer_id,
                    household_id=hh_id,
                    invited_email=invitee_email,
                    invited_by=inviter_id,
                    created_at=now,
                    expires_at=now + timedelta(days=7),
                    status="pending",
                )
            )
            db.add(
                HouseholdInvitation(
                    id=older_id,
                    household_id=hh_id,
                    invited_email=invitee_email,
                    invited_by=inviter_id,
                    created_at=now - timedelta(days=1),
                    expires_at=now + timedelta(days=7),
                    status="pending",
                )
            )
            await db.commit()
        sid, _csrf = await _seed_session_for_person(factory, invitee_id)

        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        body = client.get("/auth/me").json()
        assert body["pendingInvitation"]["token"] == older_id
    finally:
        await engine.dispose()


async def test_auth_me_null_household_no_invite(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = str(uuid4())
        async with factory() as db:
            db.add(
                Person(
                    id=person_id,
                    household_id=None,
                    email=f"{uuid4()}@example.com",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.commit()
        sid, _csrf = await _seed_session_for_person(factory, person_id)

        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["household"] is None
        assert body["pendingInvitation"] is None
        assert body["isFirstLogin"] is False
    finally:
        await engine.dispose()


# ── In-household cross-household conflict-push (Story 2.6c, ARCH §2.8a) ──


async def test_auth_me_in_household_with_cross_household_pending_invite(monkeypatch):
    """An in-household person with a pending invite to a *different* household sees BOTH the
    non-null `household` (their own) AND the `pendingInvitation` (the target) — the conflict-push
    that drives the login-time HouseholdConflictDialog (ARCH §2.8a / §2.14.C)."""
    engine, factory = await _make_factory()
    try:
        # The invitee's OWN household (they are a member here).
        invitee_id, own_hh_id = await _seed_owner_household(
            factory, created_at=datetime.now(UTC) - timedelta(hours=1), role="member"
        )
        # A DIFFERENT household with a pending invite to that same person's email.
        target_hh_id = str(uuid4())
        inviter_id = str(uuid4())
        invite_id = str(uuid4())
        async with factory() as db:
            invitee = await db.get(Person, invitee_id)
            invitee_email = invitee.email
            db.add(Household(id=target_hh_id, name="Target HH", created_by=inviter_id))
            await db.flush()
            db.add(
                Person(
                    id=inviter_id,
                    household_id=target_hh_id,
                    email=f"{uuid4()}@example.com",
                    display_name="Inviting Owner",
                    role="owner",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.flush()  # inviter must exist before the invitation's invited_by FK
            db.add(
                HouseholdInvitation(
                    id=invite_id,
                    household_id=target_hh_id,
                    invited_email=invitee_email.upper(),  # exercise func.lower match
                    invited_by=inviter_id,
                    expires_at=datetime.now(UTC) + timedelta(days=7),
                    status="pending",
                )
            )
            await db.commit()
        sid, _csrf = await _seed_session_for_person(factory, invitee_id)

        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        body = resp.json()
        # The person stays in their own household...
        assert body["household"]["householdId"] == own_hh_id
        # ...and the pending invite to the OTHER household is surfaced alongside it.
        assert body["pendingInvitation"]["token"] == invite_id
        assert body["pendingInvitation"]["householdId"] == target_hh_id
        assert body["pendingInvitation"]["householdName"] == "Target HH"
        assert body["isFirstLogin"] is False
    finally:
        await engine.dispose()


async def test_auth_me_no_session_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client_with_db(factory, monkeypatch)
        resp = client.get("/auth/me")
        assert resp.status_code == 401
        assert resp.json()["type"] == "unauthorized"
    finally:
        await engine.dispose()
