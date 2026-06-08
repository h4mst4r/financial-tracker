"""Smoke tests for the middleware stack.

Validates that:
- Security headers are present on responses.
- Unauthenticated requests get 401.
- Authenticated requests pass through.
- CSRF token is required on mutating methods.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app


@pytest.fixture(autouse=True)
def _no_db_needed():
    """These tests use the HTTP interface; they don't need a real DB."""
    pass


@pytest.fixture(autouse=True)
def _reset_auth_bypass():
    """Ensure AUTH_BYPASS_ENABLED is False for these tests."""
    import backend.config
    backend.config.settings.AUTH_BYPASS_ENABLED = False
    yield
    backend.config.settings.AUTH_BYPASS_ENABLED = False


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_security_headers_present():
    """Health endpoint should include security headers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")

    assert resp.status_code == 200
    headers = resp.headers
    assert "strict-transport-security" in headers
    assert "x-frame-options" in headers
    assert headers["x-frame-options"] == "DENY"
    assert "x-content-type-options" in headers
    assert headers["x-content-type-options"] == "nosniff"
    assert "referrer-policy" in headers


# ---------------------------------------------------------------------------
# Authentication gating
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unauthenticated_request_rejected():
    """Request without session cookie on a protected path should get 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Hit a valid protected API path without auth
        resp = await client.get("/api/household")

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_public_auth_paths_skip_middleware():
    """Public auth paths (/auth/login, /auth/callback) should bypass auth middleware."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # /auth/login is a public route — should NOT get 401 from middleware.
        # It will return 200 with a redirect (or 500 if OAuth creds not configured).
        resp = await client.get("/auth/login", follow_redirects=False)

    # Should NOT be 401 (middleware correctly skipped)
    assert resp.status_code != 401


@pytest.mark.asyncio
async def test_protected_auth_paths_require_auth():
    """Protected auth paths (/auth/me, /auth/logout) should require authentication."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # /auth/me requires auth — should get 401
        resp = await client.get("/auth/me")

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_static_paths_skip_middleware():
    """Paths under /static/ should bypass authentication middleware."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/static/app.js")

    # Should be 404 (no route), NOT 401 (middleware skipped)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_docs_paths_skip_middleware():
    """Paths under /docs/ should bypass authentication middleware."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/docs/")

    # FastAPI serves /docs/ by default — should NOT be 401
    assert resp.status_code != 401


# ---------------------------------------------------------------------------
# CSRF protection
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_csrf_required_on_post():
    """POST without X-CSRF-Token should be rejected (401 first, then 403).

    Note: Since AuthMiddleware runs before CSRFMiddleware, an unauthenticated
    POST will get 401 from auth before CSRF even checks.  This test verifies
    the auth gate fires first.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/transactions",
            json={"description": "test"},
        )

    # AuthMiddleware rejects first (no session cookie)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_skips_csrf():
    """GET requests should bypass CSRF validation entirely."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/transactions")

    # Should get 401 (auth) or 404 (no route), NOT 403 (CSRF skipped for GET)
    assert resp.status_code != 403


# ---------------------------------------------------------------------------
# CSRF happy path: valid session + valid token passes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_csrf_valid_session_and_token_passes():
    """POST with valid session cookie + valid X-CSRF-Token should pass CSRF middleware.
    
    CSRFMiddleware is the innermost middleware — it only sees requests that have
    already passed the path skip check.  This test creates a real session in the
    test DB and verifies the happy path (no 403 rejection).
    """
    import secrets
    import tempfile
    import os
    from datetime import timedelta, timezone
    from uuid import uuid4

    import backend.config
    import backend.database
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from backend.database import Base
    from backend.models.household import Household
    from backend.models.person import Person as PersonModel, Session as SessionModel

    # Setup temp test DB
    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="csrf_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(test_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, conn_rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    backend.database.engine = engine
    backend.database.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401 — register models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        # Create test person + session
        household_id = uuid4()
        person_id = uuid4()
        session_id = uuid4()
        csrf_token = secrets.token_urlsafe(32)

        async with backend.database.async_session_factory() as s:
            household = Household(id=household_id, name="CSRF Test HH", base_currency="SGD", created_by=person_id)
            person = PersonModel(id=person_id, household_id=household_id, google_sub="csrf_test", email="csrf@test.com", display_name="CSRF Test", role="owner", display_currency="SGD", default_view="household")
            now = __import__("datetime").datetime.now(timezone.utc)
            session_rec = SessionModel(id=session_id, person_id=person_id, expires_at=now + timedelta(minutes=30), last_activity_at=now, csrf_token=csrf_token)
            s.add(household)
            s.add(person)
            s.add(session_rec)
            await s.commit()

        # Test: POST with valid session + valid CSRF token should NOT get 403
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/household",
                json={"name": "test"},
                cookies={"session_id": str(session_id)},
                headers={"X-CSRF-Token": csrf_token},
            )

        # Should NOT be 403 (CSRF passed). Will be 409 or 422 (route-level validation), not CSRF-rejected.
        assert resp.status_code != 403, "CSRF middleware rejected a valid session + token"
    finally:
        # Restore
        backend.config.settings.DATABASE_URL = original_url
        backend.database.engine = original_engine
        backend.database.async_session_factory = original_factory
        try:
            os.close(tmp_fd)
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Session staleness (30-min sliding window)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stale_session_rejected():
    """Session with last_activity_at > 30 minutes ago should be rejected."""
    import secrets
    import tempfile
    import os
    from datetime import timedelta, timezone
    from uuid import uuid4

    import backend.config
    import backend.database
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from backend.database import Base
    from backend.models.household import Household
    from backend.models.person import Person as PersonModel, Session as SessionModel

    # Setup temp test DB
    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="stale_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(test_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, conn_rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    backend.database.engine = engine
    backend.database.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        household_id = uuid4()
        person_id = uuid4()
        session_id = uuid4()
        csrf_token = secrets.token_urlsafe(32)

        async with backend.database.async_session_factory() as s:
            household = Household(id=household_id, name="Stale Test HH", base_currency="SGD", created_by=person_id)
            person = PersonModel(id=person_id, household_id=household_id, google_sub="stale_test", email="stale@test.com", display_name="Stale Test", role="owner", display_currency="SGD", default_view="household")
            now = __import__("datetime").datetime.now(timezone.utc)
            # Session expires in 1 hour, but last_activity was 35 minutes ago (stale)
            session_rec = SessionModel(id=session_id, person_id=person_id, expires_at=now + timedelta(hours=1), last_activity_at=now - timedelta(minutes=35), csrf_token=csrf_token)
            s.add(household)
            s.add(person)
            s.add(session_rec)
            await s.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/auth/me",
                cookies={"session_id": str(session_id)},
            )

        # Stale session should be rejected (401)
        assert resp.status_code == 401, "Stale session should be rejected"
    finally:
        backend.config.settings.DATABASE_URL = original_url
        backend.database.engine = original_engine
        backend.database.async_session_factory = original_factory
        try:
            os.close(tmp_fd)
            os.unlink(tmp_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_dev_session_rejected_when_bypass_disabled():
    """Dev session cookie must be rejected when AUTH_BYPASS_ENABLED=false.

    Regression: previously a browser retaining a dev session_id cookie after
    disabling bypass would authenticate as the dev user on every request.
    """
    import secrets
    import tempfile
    import os
    from datetime import timedelta, timezone
    from uuid import uuid4

    import backend.config
    import backend.database
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from backend.database import Base
    from backend.models.household import Household
    from backend.models.person import Person as PersonModel, Session as SessionModel

    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="devbypass_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url
    backend.config.settings.AUTH_BYPASS_ENABLED = False

    engine = create_async_engine(test_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, conn_rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    backend.database.engine = engine
    backend.database.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        household_id = uuid4()
        person_id = uuid4()
        session_id = uuid4()

        async with backend.database.async_session_factory() as s:
            household = Household(id=household_id, name="Dev HH", base_currency="SGD", created_by=person_id)
            person = PersonModel(
                id=person_id, household_id=household_id,
                google_sub="dev-bypass-user-001", email="dev@localhost",
                display_name="Dev", role="owner",
                display_currency="SGD", default_view="household",
            )
            now = __import__("datetime").datetime.now(timezone.utc)
            # Session marked as dev-bypass (user_agent='dev-bypass'), still within 24h expiry
            dev_session = SessionModel(
                id=session_id, person_id=person_id,
                expires_at=now + timedelta(hours=23),
                last_activity_at=now,
                csrf_token=secrets.token_urlsafe(32),
                user_agent="dev-bypass",
            )
            s.add(household)
            s.add(person)
            s.add(dev_session)
            await s.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/auth/me",
                cookies={"session_id": str(session_id)},
            )

        # Dev session must be rejected (401) when bypass is disabled
        assert resp.status_code == 401, (
            f"Dev session should be rejected when AUTH_BYPASS_ENABLED=false, got {resp.status_code}"
        )
    finally:
        backend.config.settings.AUTH_BYPASS_ENABLED = False
        backend.config.settings.DATABASE_URL = original_url
        backend.database.engine = original_engine
        backend.database.async_session_factory = original_factory
        try:
            os.close(tmp_fd)
            os.unlink(tmp_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_stale_cookie_does_not_block_valid_header_session():
    """Stale/invalid cookie must not block a valid X-Session-Token header.

    Regression: dependencies.py previously picked cookie-or-header with a single
    validate_session call. A rejected cookie (expired, or dev-session-with-bypass-
    disabled) would block the valid header session from being tried at all.
    """
    import secrets
    import tempfile
    import os
    from datetime import timedelta, timezone
    from uuid import uuid4

    import backend.config
    import backend.database
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from backend.database import Base
    from backend.models.household import Household
    from backend.models.person import Person as PersonModel, Session as SessionModel

    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory
    backend.config.settings.AUTH_BYPASS_ENABLED = False

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="fallback_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(test_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, conn_rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    backend.database.engine = engine
    backend.database.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        household_id = uuid4()
        real_person_id = uuid4()
        dev_person_id = uuid4()
        real_session_id = uuid4()
        dev_session_id = uuid4()
        now = __import__("datetime").datetime.now(timezone.utc)

        async with backend.database.async_session_factory() as s:
            hh = Household(id=household_id, name="Real HH", base_currency="SGD", created_by=real_person_id)
            real_person = PersonModel(
                id=real_person_id, household_id=household_id,
                google_sub="real_user_001", email="real@example.com",
                display_name="Real User", role="owner",
                display_currency="SGD", default_view="household",
            )
            dev_person = PersonModel(
                id=dev_person_id, household_id=household_id,
                google_sub="dev-bypass-user-001", email="dev@localhost",
                display_name="Dev", role="owner",
                display_currency="SGD", default_view="household",
            )
            # Dev session in DB (stale cookie scenario — bypass is disabled)
            dev_session = SessionModel(
                id=dev_session_id, person_id=dev_person_id,
                expires_at=now + timedelta(hours=23), last_activity_at=now,
                csrf_token=secrets.token_urlsafe(32), user_agent="dev-bypass",
            )
            # Real OAuth session (passed via X-Session-Token header)
            real_session = SessionModel(
                id=real_session_id, person_id=real_person_id,
                expires_at=now + timedelta(minutes=30), last_activity_at=now,
                csrf_token=secrets.token_urlsafe(32),
            )
            s.add_all([hh, real_person, dev_person, dev_session, real_session])
            await s.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/auth/me",
                cookies={"session_id": str(dev_session_id)},   # stale dev cookie
                headers={"X-Session-Token": str(real_session_id)},  # valid real session
            )

        assert resp.status_code == 200, f"Valid header session should win over stale cookie, got {resp.status_code}"
        body = resp.json()
        assert body["person"]["email"] == "real@example.com", (
            f"Should be authenticated as real user, got {body['person']['email']}"
        )
    finally:
        backend.config.settings.AUTH_BYPASS_ENABLED = False
        backend.config.settings.DATABASE_URL = original_url
        backend.database.engine = original_engine
        backend.database.async_session_factory = original_factory
        try:
            os.close(tmp_fd)
            os.unlink(tmp_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_fresh_session_not_stale():
    """Session with recent last_activity_at should pass staleness check."""
    import secrets
    import tempfile
    import os
    from datetime import timedelta, timezone
    from uuid import uuid4

    import backend.config
    import backend.database
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from backend.database import Base
    from backend.models.household import Household
    from backend.models.person import Person as PersonModel, Session as SessionModel

    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="fresh_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(test_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, conn_rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    backend.database.engine = engine
    backend.database.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        household_id = uuid4()
        person_id = uuid4()
        session_id = uuid4()

        async with backend.database.async_session_factory() as s:
            household = Household(id=household_id, name="Fresh Test HH", base_currency="SGD", created_by=person_id)
            person = PersonModel(id=person_id, household_id=household_id, google_sub="fresh_test", email="fresh@test.com", display_name="Fresh Test", role="owner", display_currency="SGD", default_view="household")
            now = __import__("datetime").datetime.now(timezone.utc)
            # Fresh session: last_activity is 1 minute ago
            session_rec = SessionModel(id=session_id, person_id=person_id, expires_at=now + timedelta(minutes=30), last_activity_at=now - timedelta(minutes=1), csrf_token=secrets.token_urlsafe(32))
            s.add(household)
            s.add(person)
            s.add(session_rec)
            await s.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/auth/me",
                cookies={"session_id": str(session_id)},
            )

        # Fresh session should pass (200)
        assert resp.status_code == 200, f"Fresh session should pass, got {resp.status_code}"
    finally:
        backend.config.settings.DATABASE_URL = original_url
        backend.database.engine = original_engine
        backend.database.async_session_factory = original_factory
        try:
            os.close(tmp_fd)
            os.unlink(tmp_path)
        except OSError:
            pass
