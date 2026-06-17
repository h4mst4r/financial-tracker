"""Auth tests (Story 2.1): state signing, sessions, identity merge, OAuth callback, DI.

Self-contained temp-DB engines (disposed in finally — Windows WAL/SHM leak, per
1.2a/1.2b/1.2c). No live Google calls: `_exchange_code_for_tokens` / `_verify_id_token`
are monkeypatched. `asyncio_mode=auto` (no decorators needed).
"""

import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.dependencies import get_current_person
from backend.main import create_app
from backend.models.base import Base
from backend.models.identity import Household, Person, Session
from backend.rate_limit import limiter
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    """Keep the shared module-level limiter inert except in the dedicated rate-limit test."""
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "auth_test.db"
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


async def _seed_household_member(factory) -> tuple[str, str, str]:
    """Insert a Household + a Person who belongs to it. Returns (person_id, sub, email)."""
    hh_id = str(uuid4())
    person_id = str(uuid4())
    sub = f"sub-{uuid4()}"
    email = f"{uuid4()}@example.com"
    async with factory() as db:
        db.add(Household(id=hh_id, name="Test HH", created_by=person_id))
        await db.flush()
        db.add(Person(id=person_id, household_id=hh_id, email=email, google_sub=sub))
        await db.commit()
    return person_id, sub, email


# ── State signing ──


def test_sign_state_round_trips():
    state = auth.sign_state()
    assert auth.verify_state(state) is not None


def test_verify_state_rejects_tampered_signature():
    state = auth.sign_state()
    raw, _, _sig = state.rpartition(".")
    assert auth.verify_state(f"{raw}.deadbeef") is None
    assert auth.verify_state(None) is None
    assert auth.verify_state("no-dot") is None


# ── validate_session (§2.14.B) ──


async def test_validate_session_slides_window_and_returns_pair():
    engine, factory = await _make_factory()
    try:
        person_id, _sub, _email = await _seed_household_member(factory)
        async with factory() as db:
            session = await auth.create_session(
                db, await db.get(Person, person_id), ip="127.0.0.1", user_agent="pytest"
            )
            await db.commit()
            sid, before = session.id, session.last_activity_at

        async with factory() as db:
            result = await auth.validate_session(db, sid, bypass_enabled=False)
            await db.commit()
            assert result is not None
            person, validated = result
            assert person.id == person_id
            assert auth._as_utc(validated.last_activity_at) >= auth._as_utc(before)
    finally:
        await engine.dispose()


async def test_validate_session_none_cases():
    engine, factory = await _make_factory()
    try:
        async with factory() as db:
            assert await auth.validate_session(db, None, bypass_enabled=False) is None
            assert await auth.validate_session(db, "", bypass_enabled=False) is None
            assert await auth.validate_session(db, "not-a-uuid", bypass_enabled=False) is None
            assert await auth.validate_session(db, str(uuid4()), bypass_enabled=False) is None
    finally:
        await engine.dispose()


async def test_validate_session_rejects_expired_and_idle():
    engine, factory = await _make_factory()
    try:
        person_id, _sub, _email = await _seed_household_member(factory)
        now = datetime.now(UTC)
        expired_id = str(uuid4())
        idle_id = str(uuid4())
        async with factory() as db:
            db.add(
                Session(
                    id=expired_id,
                    person_id=person_id,
                    created_at=now - timedelta(hours=2),
                    last_activity_at=now - timedelta(hours=1),
                    expires_at=now - timedelta(minutes=1),  # already past → step 5
                    csrf_token=secrets_token(),
                )
            )
            db.add(
                Session(
                    id=idle_id,
                    person_id=person_id,
                    created_at=now - timedelta(hours=2),
                    last_activity_at=now - timedelta(minutes=40),  # idle > 30 → step 7
                    expires_at=now + timedelta(hours=1),
                    csrf_token=secrets_token(),
                )
            )
            await db.commit()

        async with factory() as db:
            assert await auth.validate_session(db, expired_id, bypass_enabled=False) is None
            assert await auth.validate_session(db, idle_id, bypass_enabled=False) is None
    finally:
        await engine.dispose()


async def test_validate_session_dev_fail_safe():
    engine, factory = await _make_factory()
    try:
        person_id, _sub, _email = await _seed_household_member(factory)
        now = datetime.now(UTC)
        dev_id = str(uuid4())
        async with factory() as db:
            db.add(
                Session(
                    id=dev_id,
                    person_id=person_id,
                    created_at=now,
                    last_activity_at=now - timedelta(minutes=40),  # exempt from idle when dev
                    expires_at=now + timedelta(hours=12),
                    csrf_token=secrets_token(),
                    user_agent=auth.DEV_USER_AGENT,
                )
            )
            await db.commit()

        async with factory() as db:
            assert await auth.validate_session(db, dev_id, bypass_enabled=False) is None
        async with factory() as db:
            assert await auth.validate_session(db, dev_id, bypass_enabled=True) is not None
    finally:
        await engine.dispose()


# ── get_or_create_person (§2.6) ──


async def test_get_or_create_person_creates_new():
    engine, factory = await _make_factory()
    try:
        async with factory() as db:
            claims = {
                "sub": "new-sub",
                "email": "New@Example.com",
                "email_verified": True,
                "name": "New User",
            }
            person = await auth.get_or_create_person(db, claims)
            await db.commit()
            assert person.google_sub == "new-sub"
            assert person.household_id is None
    finally:
        await engine.dispose()


async def test_get_or_create_person_merges_on_verified_email():
    engine, factory = await _make_factory()
    try:
        person_id, _old_sub, email = await _seed_household_member(factory)
        async with factory() as db:
            claims = {"sub": "rotated-sub", "email": email.upper(), "email_verified": True}
            person = await auth.get_or_create_person(db, claims)
            await db.commit()
            assert person.id == person_id  # merged, not duplicated
            assert person.google_sub == "rotated-sub"
    finally:
        await engine.dispose()


async def test_get_or_create_person_no_merge_when_unverified():
    """An unverified email must NOT rotate the sub onto an existing person (§2.6).

    With the guard, the email-merge branch is skipped and the create path collides with
    the `email` UNIQUE constraint — that collision proves no silent account takeover.
    """
    engine, factory = await _make_factory()
    try:
        _person_id, _old_sub, email = await _seed_household_member(factory)
        async with factory() as db:
            claims = {"sub": "other-sub", "email": email, "email_verified": False}
            with pytest.raises(IntegrityError):
                await auth.get_or_create_person(db, claims)
    finally:
        await engine.dispose()


# ── HTTP: callback (never-500) + get_current_person + rate limit ──


def _client_with_db(factory, monkeypatch=None) -> TestClient:
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
    # The CSRF middleware validates against its own `async_session_factory` (imported
    # directly, outside DI) — point it at the temp DB so non-exempt routes don't hit the
    # real financial_tracker.db. Exempt routes (/auth/*) skip the middleware entirely.
    if monkeypatch is not None:
        monkeypatch.setattr("backend.middleware.async_session_factory", factory)

    async def _protected(person: Person = Depends(get_current_person)) -> dict:
        return {"person_id": person.id}

    app.add_api_route("/_protected", _protected, methods=["GET"])
    return TestClient(app)


async def test_login_sets_signed_state_cookie_and_redirects_to_google():
    engine, factory = await _make_factory()
    try:
        client = _client_with_db(factory)
        resp = client.get("/auth/login", follow_redirects=False)
        assert resp.status_code == 302

        location = resp.headers["location"]
        assert location.startswith(auth.GOOGLE_AUTH_ENDPOINT)
        assert "scope=openid" in location
        assert "prompt=select_account" in location
        assert "redirect_uri=" in location

        state = resp.cookies.get(auth.OAUTH_STATE_COOKIE)
        assert state is not None and auth.verify_state(state) is not None  # signed, verifiable
        # the state echoed to Google must match the cookie
        assert f"state={state}" in location or f"state={state.replace('.', '%2E')}" in location

        set_cookie = resp.headers.get("set-cookie", "").lower()
        assert "httponly" in set_cookie and "samesite=lax" in set_cookie
        assert "path=/auth/callback" in set_cookie
    finally:
        await engine.dispose()


async def test_callback_happy_path_sets_session_cookie(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _person_id, sub, email = await _seed_household_member(factory)

        async def _fake_exchange(code):
            return {"id_token": "fake"}  # nosec B105 (test stub, not a secret)

        monkeypatch.setattr(auth, "_exchange_code_for_tokens", _fake_exchange)
        monkeypatch.setattr(
            auth, "_verify_id_token", lambda t: {"sub": sub, "email": email, "email_verified": True}
        )

        client = _client_with_db(factory)
        state = auth.sign_state()
        client.cookies.set(auth.OAUTH_STATE_COOKIE, state)
        resp = client.get(f"/auth/callback?code=abc&state={state}", follow_redirects=False)
        assert resp.status_code == 302
        assert "error=oauth_error" not in resp.headers["location"]
        assert auth.SESSION_COOKIE_NAME in resp.headers.get("set-cookie", "")
    finally:
        await engine.dispose()


async def test_callback_failures_redirect_oauth_error(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _person_id, sub, email = await _seed_household_member(factory)
        client = _client_with_db(factory)
        state = auth.sign_state()

        # (a) missing/mismatched oauth_state cookie
        resp = client.get(f"/auth/callback?code=abc&state={state}", follow_redirects=False)
        assert resp.status_code == 302 and "error=oauth_error" in resp.headers["location"]

        # (b) email_verified False
        async def _fake_exchange(code):
            return {"id_token": "fake"}  # nosec B105 (test stub, not a secret)

        monkeypatch.setattr(auth, "_exchange_code_for_tokens", _fake_exchange)
        monkeypatch.setattr(
            auth,
            "_verify_id_token",
            lambda t: {"sub": sub, "email": email, "email_verified": False},
        )
        client.cookies.set(auth.OAUTH_STATE_COOKIE, state)
        resp = client.get(f"/auth/callback?code=abc&state={state}", follow_redirects=False)
        assert resp.status_code == 302 and "error=oauth_error" in resp.headers["location"]

        # (c) NotInvitedError (never-invited identity, no detachment_reason) → ?error=not_invited
        # (as of Story 2.3 the callback maps NotInvitedError by detachment_reason, §2.6 step 4).
        monkeypatch.setattr(
            auth,
            "_verify_id_token",
            lambda t: {"sub": "brand-new", "email": "nobody@example.com", "email_verified": True},
        )
        client.cookies.set(auth.OAUTH_STATE_COOKIE, state)
        resp = client.get(f"/auth/callback?code=abc&state={state}", follow_redirects=False)
        assert resp.status_code == 302 and "error=not_invited" in resp.headers["location"]
    finally:
        await engine.dispose()


async def test_get_current_person_cookie_header_and_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _sub, _email = await _seed_household_member(factory)
        async with factory() as db:
            session = await auth.create_session(
                db, await db.get(Person, person_id), ip="127.0.0.1", user_agent="pytest"
            )
            await db.commit()
            sid = session.id

        client = _client_with_db(factory, monkeypatch)

        # cookie path → 200 + re-sent sliding cookie
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        resp = client.get("/_protected")
        assert resp.status_code == 200 and resp.json()["person_id"] == person_id
        assert auth.SESSION_COOKIE_NAME in resp.headers.get("set-cookie", "")

        # header fallback (no cookie) → 200
        client.cookies.clear()
        resp = client.get("/_protected", headers={auth.SESSION_HEADER_NAME: sid})
        assert resp.status_code == 200

        # no credentials → 401 in the 7807 shape
        client.cookies.clear()
        resp = client.get("/_protected")
        assert resp.status_code == 401
        assert resp.json()["type"] == "unauthorized"
    finally:
        await engine.dispose()


async def test_auth_login_rate_limited():
    engine, factory = await _make_factory()
    try:
        client = _client_with_db(factory)
        limiter.enabled = True
        try:
            statuses = [
                client.get("/auth/login", follow_redirects=False).status_code for _ in range(21)
            ]
        finally:
            limiter.enabled = False
        assert statuses.count(429) >= 1
        assert all(s in (302, 429) for s in statuses)
    finally:
        await engine.dispose()


def secrets_token() -> str:
    import secrets

    return secrets.token_urlsafe(32)
