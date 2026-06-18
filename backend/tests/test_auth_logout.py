"""`POST /auth/logout` tests (Story 2.4d): 204 + cleared cookie + row deleted, idempotent service,
401 (no session), 403 (missing CSRF token).

Mirrors `test_auth_me.py` / `test_household.py`: self-contained temp-DB engines (disposed in finally
— Windows WAL/SHM leak), CSRF middleware against a monkeypatched `async_session_factory`.
`/auth/logout` is a mutating, non-exempt route, so the happy path carries the session cookie **and**
the `X-CSRF-Token` header.
"""

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.identity import Household, Person, Session
from backend.rate_limit import limiter
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "auth_logout_test.db"
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


async def _seed_person(factory) -> str:
    """Insert a Household + a Person in it. Returns person_id."""
    hh_id = str(uuid4())
    person_id = str(uuid4())
    async with factory() as db:
        db.add(Household(id=hh_id, name="Acme Household", created_by=person_id))
        await db.flush()
        db.add(
            Person(
                id=person_id,
                household_id=hh_id,
                email=f"{uuid4()}@example.com",
                display_name="Owner Person",
                role="owner",
                google_sub=f"sub-{uuid4()}",
            )
        )
        await db.commit()
    return person_id


async def _seed_session(factory, person_id: str) -> tuple[str, str]:
    """Mint a session. Returns (session_id, csrf_token)."""
    async with factory() as db:
        session = await auth.create_session(
            db, await db.get(Person, person_id), ip="127.0.0.1", user_agent="pytest"
        )
        await db.commit()
        return session.id, session.csrf_token


# ── Happy path ──


async def test_logout_deletes_session_and_clears_cookie(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        client.headers["X-CSRF-Token"] = csrf

        resp = client.post("/auth/logout")
        assert resp.status_code == 204

        # Inspect EVERY Set-Cookie header individually — the CSRF middleware must NOT re-slide a
        # fresh session_id after the route clears it (else the browser keeps the live cookie). The
        # only session_id cookie present must be the cleared one (empty value + Max-Age=0), with
        # matching HttpOnly / Path / SameSite attrs (§2.14.E step 3).
        prefix = f"{auth.SESSION_COOKIE_NAME}="
        session_cookies = [h for h in resp.headers.get_list("set-cookie") if h.startswith(prefix)]
        assert len(session_cookies) == 1, session_cookies
        cookie = session_cookies[0]
        assert cookie.startswith(f"{prefix};") or f'{prefix}"";' in f"{cookie};", cookie
        assert "Max-Age=0" in cookie, cookie
        assert "HttpOnly" in cookie and "Path=/" in cookie and "SameSite=lax" in cookie, cookie

        # The session row is gone.
        async with factory() as db:
            row = (await db.execute(select(Session).where(Session.id == sid))).scalar_one_or_none()
            assert row is None
    finally:
        await engine.dispose()


# ── Idempotency (service-level: deleting a missing row is a no-op) ──


async def test_logout_session_idempotent(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)
        sid, _csrf = await _seed_session(factory, person_id)
        async with factory() as db:
            await auth.logout_session(db, sid)  # first delete
            await auth.logout_session(db, sid)  # second delete: missing row → no raise
            await auth.logout_session(db, "does-not-exist")  # never-existed → no raise
            await db.commit()
            row = (await db.execute(select(Session).where(Session.id == sid))).scalar_one_or_none()
            assert row is None
    finally:
        await engine.dispose()


# ── Auth + CSRF gates ──


async def test_logout_no_session_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client_with_db(factory, monkeypatch)
        resp = client.post("/auth/logout")
        assert resp.status_code == 401
        assert resp.json()["type"] == "unauthorized"
    finally:
        await engine.dispose()


async def test_logout_missing_csrf_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)
        sid, _csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        # No X-CSRF-Token header → the CSRF middleware rejects the mutation.

        resp = client.post("/auth/logout")
        assert resp.status_code == 403
        assert resp.json()["type"] == "forbidden"
    finally:
        await engine.dispose()
