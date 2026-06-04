"""Integration tests for the auth flow (AUTH-001).

Validates:
    - /auth/login generates OAuth state and redirects
    - /auth/callback validates state, exchanges code, creates session
    - /auth/me returns correct authStore contract
    - /auth/logout deletes session and clears cookie
    - End-to-end session pipeline: callback -> middleware -> /auth/me
"""

import secrets
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import backend.database
from backend.main import app
from backend.models.person import Person, Session as SessionModel


@pytest_asyncio.fixture(autouse=True)
async def _use_test_db():
    """Use a temp file-based SQLite for auth tests with tables created."""
    import tempfile
    import backend.config
    import backend.database
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory

    # Use a temp file so it persists across connections
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="auth_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(
        test_url,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    backend.database.engine = engine
    backend.database.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    # Import all models so they register with Base.metadata BEFORE create_all
    import backend.models  # noqa: F401

    # Create all tables
    from backend.database import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    # Restore original
    backend.config.settings.DATABASE_URL = original_url
    backend.database.engine = original_engine
    backend.database.async_session_factory = original_factory

    # Cleanup temp file
    try:
        import os
        os.close(tmp_fd)
        os.unlink(tmp_path)
    except OSError:
        pass


@pytest.mark.asyncio
async def test_auth_login_generates_state_and_redirects():
    """GET /auth/login should set oauth_state cookie and redirect to Google."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/auth/login", follow_redirects=False)

    assert resp.status_code == 200
    assert "oauth_state" in resp.cookies
    assert "window.location.href" in resp.text
    assert "accounts.google.com" in resp.text
    assert "scope=openid" in resp.text


@pytest.mark.asyncio
async def test_auth_callback_missing_params_returns_400():
    """GET /auth/callback without code/state should return 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/auth/callback")

    assert resp.status_code == 400
    # FastAPI wraps HTTPException detail in {"detail": ...}
    detail = resp.json().get("detail", {})
    # detail is our RFC 7807 dict
    assert detail.get("title") == "Missing authorization code or state" or (
        isinstance(detail, dict) and detail.get("title") == "Missing authorization code or state"
    )


@pytest.mark.asyncio
async def test_auth_callback_invalid_state_returns_403():
    """GET /auth/callback with invalid signed state should return 403."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/auth/callback",
            params={"code": "fake_code", "state": "fake_state"},
            cookies={"oauth_state": "invalid.signature"},
        )

    assert resp.status_code == 403
    detail = resp.json().get("detail", {})
    title = detail.get("title", "")
    assert "state" in title.lower()


@pytest.mark.asyncio
async def test_auth_callback_full_flow_creates_session():
    """Full mock OAuth callback: valid state + mock token exchange -> session created."""
    mock_id_token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0XzEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsIm5hbWUiOiJUZXN0IFVzZXIifQ.fake"

    def mock_validate_id_token(token_str):
        return {
            "sub": "test_123",
            "email": "test@example.com",
            "name": "Test User",
            "picture": "https://example.com/avatar.jpg",
        }

    async def mock_exchange_code(code, redirect_uri):
        return {
            "access_token": "mock_access_token",
            "id_token": mock_id_token,
            "token_type": "Bearer",
            "expires_in": 3600,
        }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Sign the state
        from backend.services.auth_service import sign_state
        state = secrets.token_urlsafe(16)
        signed_state = sign_state(state)

        with (
            patch("backend.services.auth_service.exchange_code_for_tokens", side_effect=mock_exchange_code),
            patch("backend.services.auth_service.validate_id_token", side_effect=mock_validate_id_token),
        ):
            resp = await client.get(
                "/auth/callback",
                params={"code": "mock_auth_code", "state": state},
                cookies={"oauth_state": signed_state},
            )

    # Should redirect to frontend via JS snippet with session in URL hash
    assert resp.status_code == 200
    import re
    match = re.search(r'#session=([0-9a-f-]+)', resp.text)
    assert match, f"Session ID not found in callback response: {resp.text[:200]}"

    # Verify session was created in DB
    from uuid import UUID as PyUUID
    session_id = PyUUID(match.group(1))
    async with backend.database.async_session_factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(SessionModel).where(SessionModel.id == session_id)
        )
        session_rec = result.scalar_one_or_none()
        assert session_rec is not None
        assert session_rec.csrf_token is not None
        assert session_rec.person_id is not None

        # Verify person was created
        from backend.models.person import Person as PersonModel
        result = await session.execute(
            select(PersonModel).where(PersonModel.id == session_rec.person_id)
        )
        person = result.scalar_one_or_none()
        assert person is not None
        assert person.google_sub == "test_123"
        assert person.email == "test@example.com"
        assert person.display_name == "Test User"
        assert person.role == "owner"


@pytest.mark.asyncio
async def test_auth_me_requires_authentication():
    """GET /auth/me without session cookie should return 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/auth/me")

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_returns_correct_contract():
    """GET /auth/me with valid session should return authStore-compatible response."""
    # Create a test person and session
    from backend.models.household import Household
    from backend.models.person import Person as PersonModel, Session as SessionModel
    from backend.services.auth_service import utcnow

    household_id = uuid4()
    person_id = uuid4()
    session_id = uuid4()

    async with backend.database.async_session_factory() as session:
        household = Household(
            id=household_id,
            name="Test Household",
            base_currency="SGD",
            created_by=person_id,
        )
        person = PersonModel(
            id=person_id,
            household_id=household_id,
            google_sub="test_me_123",
            email="me@example.com",
            display_name="Me User",
            role="owner",
            display_currency="SGD",
            default_view="household",
        )
        now = utcnow()
        csrf_token = secrets.token_urlsafe(32)
        session_rec = SessionModel(
            id=session_id,
            person_id=person_id,
            expires_at=now + timedelta(minutes=30),
            last_activity_at=now,
            csrf_token=csrf_token,
        )
        session.add(household)
        session.add(person)
        session.add(session_rec)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/auth/me",
            cookies={"session_id": str(session_id)},
        )

    assert resp.status_code == 200
    body = resp.json()

    # Verify authStore contract
    assert "person" in body
    assert "household" in body
    assert "csrfToken" in body
    assert "isFirstLogin" in body
    assert "pendingInvitationToken" in body

    person_data = body["person"]
    assert person_data["personId"] == str(person_id)
    assert person_data["displayName"] == "Me User"
    assert person_data["email"] == "me@example.com"
    assert person_data["defaultView"] == "household"
    assert person_data["displayCurrency"] == "SGD"

    household_data = body["household"]
    assert household_data["householdId"] == str(household_id)

    assert body["csrfToken"] == csrf_token
    assert body["isFirstLogin"] is True  # Person created now, role=owner → within 2-min window
    assert body["pendingInvitationToken"] is None


@pytest.mark.asyncio
async def test_auth_logout_deletes_session():
    """POST /auth/logout should delete session and clear cookie."""
    from backend.models.household import Household
    from backend.models.person import Person as PersonModel, Session as SessionModel
    from backend.services.auth_service import utcnow

    household_id = uuid4()
    person_id = uuid4()
    session_id = uuid4()

    async with backend.database.async_session_factory() as session:
        household = Household(
            id=household_id,
            name="Test Household",
            base_currency="SGD",
            created_by=person_id,
        )
        person = PersonModel(
            id=person_id,
            household_id=household_id,
            google_sub="test_logout_123",
            email="logout@example.com",
            display_name="Logout User",
            role="owner",
            display_currency="SGD",
            default_view="household",
        )
        now = utcnow()
        csrf_token = secrets.token_urlsafe(32)
        session_rec = SessionModel(
            id=session_id,
            person_id=person_id,
            expires_at=now + timedelta(minutes=30),
            last_activity_at=now,
            csrf_token=csrf_token,
        )
        session.add(household)
        session.add(person)
        session.add(session_rec)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/auth/logout",
            cookies={"session_id": str(session_id)},
            headers={"X-CSRF-Token": csrf_token},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"

    # Verify session cookie is cleared
    assert resp.cookies.get("session_id") is None

    # Verify session is deleted from DB
    async with backend.database.async_session_factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(SessionModel).where(SessionModel.id == session_id)
        )
        session_rec = result.scalar_one_or_none()
        assert session_rec is None


@pytest.mark.asyncio
async def test_e2e_session_pipeline():
    """End-to-end: callback sets cookie -> middleware validates -> /auth/me returns data."""
    mock_id_token = "fake.jwt.token"

    def mock_validate_id_token(token_str):
        return {
            "sub": "e2e_test_456",
            "email": "e2e@example.com",
            "name": "E2E User",
            "picture": None,
        }

    async def mock_exchange_code(code, redirect_uri):
        return {
            "access_token": "mock_access",
            "id_token": mock_id_token,
            "token_type": "Bearer",
            "expires_in": 3600,
        }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Callback creates session
        from backend.services.auth_service import sign_state
        state = secrets.token_urlsafe(16)
        signed_state = sign_state(state)

        with (
            patch("backend.services.auth_service.exchange_code_for_tokens", side_effect=mock_exchange_code),
            patch("backend.services.auth_service.validate_id_token", side_effect=mock_validate_id_token),
        ):
            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "e2e_code", "state": state},
                cookies={"oauth_state": signed_state},
            )

        assert callback_resp.status_code == 200
        # Session is now passed via URL hash in JS redirect (not as a cookie)
        import re
        match = re.search(r'#session=([0-9a-f-]+)', callback_resp.text)
        assert match, f"Session ID not found in callback response: {callback_resp.text[:200]}"
        session_id = match.group(1)

        # Step 2: Use session token header to call /auth/me (dev proxy mode)
        me_resp = await client.get(
            "/auth/me",
            headers={"X-Session-Token": session_id},
        )

        assert me_resp.status_code == 200
        me_body = me_resp.json()

        # Step 3: Verify full contract
        assert me_body["person"]["email"] == "e2e@example.com"
        assert me_body["person"]["displayName"] == "E2E User"
        assert me_body["household"]["householdId"] is not None
        assert me_body["csrfToken"] is not None

        # Step 4: Logout clears session (send session as dev header + CSRF token)
        logout_resp = await client.post(
            "/auth/logout",
            headers={
                "X-Session-Token": session_id,
                "X-CSRF-Token": me_body["csrfToken"],
            },
        )
        assert logout_resp.status_code == 200

        # Step 5: /auth/me should now return 401
        me_after_logout = await client.get(
            "/auth/me",
            headers={"X-Session-Token": session_id},
        )
        assert me_after_logout.status_code == 401
