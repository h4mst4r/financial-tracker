"""Tests for DEV-002 security hardening — headers, rate limiting, route guards."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app


@pytest.mark.asyncio
async def test_csp_header_present():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    csp = response.headers.get("content-security-policy", "")
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp


@pytest.mark.asyncio
async def test_permissions_policy_header_present():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    pp = response.headers.get("permissions-policy", "")
    assert "camera=()" in pp


@pytest.mark.asyncio
async def test_standard_security_headers_present():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert "strict-transport-security" in response.headers
    assert "referrer-policy" in response.headers


@pytest.mark.asyncio
async def test_auth_login_rate_limited():
    """21 rapid requests from the same IP should result in a 429 on the 21st."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for _ in range(20):
            await client.get("/auth/login")
        response = await client.get("/auth/login")
    assert response.status_code == 429
    body = response.json()
    assert body.get("code") == "RATE_LIMITED"
