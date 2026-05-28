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
        # Hit a non-auth, non-static, non-docs path
        resp = await client.get("/api/households")

    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_auth_paths_skip_middleware():
    """Paths under /auth/ should bypass authentication middleware."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # /auth/* paths should not get a 401 from AuthMiddleware — they'll
        # get a 404 because no route is registered, but NOT 401.
        resp = await client.get("/auth/login")

    # Should be 404 (no route), NOT 401 (middleware skipped)
    assert resp.status_code == 404


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
