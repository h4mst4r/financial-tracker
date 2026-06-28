"""`PATCH /api/household` tests (Story 2.4c): owner name/timezone update, partial update, audit row,
non-owner 403, invalid timezone 400, NULL-household 401.

Mirrors `test_auth_me.py`: self-contained temp-DB engines (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `/api/household` is a
mutating, non-exempt route, so requests carry the session cookie **and** the `X-CSRF-Token` header.
"""

import tempfile
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base, _utcnow
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
    db_path = Path(tmp_dir) / "household_test.db"
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


async def _seed_owner_household(factory, *, role: str = "owner") -> tuple[str, str]:
    """Insert a Household + base SGD Currency + a Person. Returns (person_id, household_id)."""
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


async def _seed_session(factory, person_id: str) -> tuple[str, str]:
    """Mint a session. Returns (session_id, csrf_token)."""
    async with factory() as db:
        session = await auth.create_session(
            db, await db.get(Person, person_id), ip="127.0.0.1", user_agent="pytest"
        )
        await db.commit()
        return session.id, session.csrf_token


def _auth(client: TestClient, sid: str, csrf: str) -> None:
    client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
    client.headers["X-CSRF-Token"] = csrf


# ── Owner updates ──


async def test_patch_household_owner_updates_name_and_timezone(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch(
            "/api/household", json={"name": "The Lim Household", "timezone": "Pacific/Auckland"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body == {
            "householdId": hh_id,
            "name": "The Lim Household",
            "baseCurrency": "SGD",  # untouched
            "timezone": "Pacific/Auckland",
        }

        async with factory() as db:
            hh = await db.get(Household, hh_id)
            assert hh.name == "The Lim Household"
            assert hh.timezone == "Pacific/Auckland"
            assert hh.base_currency == "SGD"
            rows = (
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.household_id == hh_id, AuditLog.entity_type == "household"
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(rows) == 1
            assert rows[0].action == "update"
    finally:
        await engine.dispose()


async def test_patch_household_partial_name_only_leaves_timezone(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/household", json={"name": "Renamed"})
        assert resp.status_code == 200
        assert resp.json()["timezone"] == "Asia/Singapore"  # unchanged

        async with factory() as db:
            hh = await db.get(Household, hh_id)
            assert hh.name == "Renamed"
            assert hh.timezone == "Asia/Singapore"
    finally:
        await engine.dispose()


# ── Rejections ──


async def test_patch_household_non_owner_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _hh = await _seed_owner_household(factory, role="member")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/household", json={"name": "Nope"})
        assert resp.status_code == 403
        assert resp.json()["type"] == "forbidden"
    finally:
        await engine.dispose()


async def test_patch_household_invalid_timezone_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _hh = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/household", json={"timezone": "Mars/Phobos"})
        assert resp.status_code == 400
        assert resp.json()["type"] == "bad_request"
    finally:
        await engine.dispose()


async def test_patch_household_malformed_timezone_400(monkeypatch):
    """A path-traversal-style key makes ZoneInfo raise ValueError (not ZoneInfoNotFoundError) →
    must still be a clean 400, not an uncaught 500."""
    engine, factory = await _make_factory()
    try:
        person_id, _hh = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/household", json={"timezone": "../../etc/passwd"})
        assert resp.status_code == 400
        assert resp.json()["type"] == "bad_request"
    finally:
        await engine.dispose()


async def test_patch_household_blank_name_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _hh = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/household", json={"name": "   "})
        assert resp.status_code == 400
        assert resp.json()["type"] == "bad_request"
    finally:
        await engine.dispose()


async def test_patch_household_null_household_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = str(uuid4())
        async with factory() as db:
            db.add(
                Person(
                    id=person_id,
                    household_id=None,
                    email=f"{uuid4()}@example.com",
                    role="owner",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.commit()
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/household", json={"name": "X"})
        assert resp.status_code == 401
        assert resp.json()["type"] == "unauthorized"
    finally:
        await engine.dispose()


# ── First-login setup dismissal (§2.14.C) ──


async def test_complete_setup_stamps_and_flips_first_login(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # Fresh owner household → setup not yet dismissed.
        assert client.get("/auth/me").json()["isFirstLogin"] is True

        resp = client.post("/api/household/complete-setup")
        assert resp.status_code == 200
        assert resp.json() == {
            "householdId": hh_id,
            "name": "Acme Household",
            "baseCurrency": "SGD",
            "timezone": "Asia/Singapore",
        }

        async with factory() as db:
            hh = await db.get(Household, hh_id)
            assert hh.setup_completed_at is not None

        # Survives a fresh /auth/me (the reload path) — the bug this fixes.
        assert client.get("/auth/me").json()["isFirstLogin"] is False
    finally:
        await engine.dispose()


async def test_complete_setup_idempotent(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        assert client.post("/api/household/complete-setup").status_code == 200
        async with factory() as db:
            first_stamp = (await db.get(Household, hh_id)).setup_completed_at

        # A second call (re-skip / double-submit) must not move the timestamp.
        assert client.post("/api/household/complete-setup").status_code == 200
        async with factory() as db:
            assert (await db.get(Household, hh_id)).setup_completed_at == first_stamp
    finally:
        await engine.dispose()


async def test_complete_setup_non_owner_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _hh = await _seed_owner_household(factory, role="member")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/household/complete-setup")
        assert resp.status_code == 403
        assert resp.json()["type"] == "forbidden"
    finally:
        await engine.dispose()


# ── Members / Invitations lists (Story 2.5) ──


async def _add_person(factory, household_id: str, *, role: str, name: str) -> str:
    person_id = str(uuid4())
    async with factory() as db:
        db.add(
            Person(
                id=person_id,
                household_id=household_id,
                email=f"{uuid4()}@example.com",
                display_name=name,
                role=role,
                google_sub=f"sub-{uuid4()}",
            )
        )
        await db.commit()
    return person_id


async def _add_invitation(factory, household_id: str, invited_by: str, *, email: str, status: str):
    async with factory() as db:
        db.add(
            HouseholdInvitation(
                id=str(uuid4()),
                household_id=household_id,
                invited_email=email,
                invited_by=invited_by,
                expires_at=_utcnow() + timedelta(days=7),
                status=status,
            )
        )
        await db.commit()


async def test_get_members_returns_household_members_camelcase(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_owner_household(factory)
        await _add_person(factory, hh_id, role="member", name="Alex Lim")
        # A second household whose member must NOT leak into the first household's list.
        other_owner, other_hh = await _seed_owner_household(factory)
        await _add_person(factory, other_hh, role="member", name="Outsider")

        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/members")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        emails = {m["email"] for m in body["items"]}
        names = {m["displayName"] for m in body["items"]}
        assert "Outsider" not in names
        first = body["items"][0]
        # camelCase keys + real status + canDelete emptiness signal (Story 2.5 / 2.8)
        assert set(first.keys()) == {
            "personId",
            "displayName",
            "email",
            "role",
            "pictureUrl",
            "colour",
            "status",
            "canDelete",
        }
        assert all(m["status"] == "active" for m in body["items"])
        assert owner_id in {m["personId"] for m in body["items"]}
        assert other_owner not in {m["personId"] for m in body["items"]}
        assert len(emails) == 2
    finally:
        await engine.dispose()


async def test_get_members_accessible_to_plain_member(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh_id = await _seed_owner_household(factory)
        member_id = await _add_person(factory, hh_id, role="member", name="Member Person")
        sid, csrf = await _seed_session(factory, member_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/members")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2
    finally:
        await engine.dispose()


async def test_get_members_null_household_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = str(uuid4())
        async with factory() as db:
            db.add(
                Person(
                    id=person_id,
                    household_id=None,
                    email=f"{uuid4()}@example.com",
                    role="owner",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.commit()
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/members")
        assert resp.status_code == 401
    finally:
        await engine.dispose()


async def test_get_invitations_returns_rows_scoped(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, hh_id = await _seed_owner_household(factory)
        await _add_invitation(factory, hh_id, owner_id, email="cara@example.com", status="pending")
        await _add_invitation(factory, hh_id, owner_id, email="dee@example.com", status="declined")
        # Second household's invitation must not leak.
        other_owner, other_hh = await _seed_owner_household(factory)
        await _add_invitation(
            factory, other_hh, other_owner, email="ghost@example.com", status="pending"
        )

        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/invitations")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        emails = {i["invitedEmail"] for i in body["items"]}
        assert emails == {"cara@example.com", "dee@example.com"}
        statuses = {i["status"] for i in body["items"]}
        assert statuses == {"pending", "declined"}
        # No invitation id/token is exposed in the member-visible list (it is the /join token).
        assert set(body["items"][0].keys()) == {
            "invitedEmail",
            "status",
            "expiresAt",
            "createdAt",
        }
        assert "invitationId" not in body["items"][0]
        assert "id" not in body["items"][0]
    finally:
        await engine.dispose()


async def test_get_invitations_empty(monkeypatch):
    engine, factory = await _make_factory()
    try:
        owner_id, _hh = await _seed_owner_household(factory)
        sid, csrf = await _seed_session(factory, owner_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/invitations")
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}
    finally:
        await engine.dispose()


async def test_get_invitations_null_household_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = str(uuid4())
        async with factory() as db:
            db.add(
                Person(
                    id=person_id,
                    household_id=None,
                    email=f"{uuid4()}@example.com",
                    role="owner",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.commit()
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.get("/api/household/invitations")
        assert resp.status_code == 401
    finally:
        await engine.dispose()
