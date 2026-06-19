"""MaintenanceMiddleware tests (Story 2.10): MAINTENANCE_MODE 503s the data + auth layer
(`/api/*`, `/auth/*`) with a 7807 body, while `/health`, static/asset prefixes, and the SPA
document routes keep serving so the shell can boot the React Maintenance page (ARCH §5.4/§5.8).

`get_settings` is `@lru_cache`d → set env + clear cache (and clear again in teardown), the same
pattern as the dev-bypass tests. A temp-DB factory is wired in so any path that reaches the CSRF
middleware (e.g. an SPA document route while maintenance is on) never touches the root DB.
`asyncio_mode=auto`.
"""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import get_settings
from backend.main import create_app
from backend.models.base import Base
from backend.rate_limit import limiter


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    """Keep the shared module-level limiter inert (mirrors test_middleware)."""
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "maint_test.db"
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


def _client(factory, monkeypatch) -> TestClient:
    app = create_app()
    monkeypatch.setattr("backend.middleware.async_session_factory", factory)
    return TestClient(app)


# ── Maintenance ON ──────────────────────────────────────────────────────────


async def test_api_path_returns_503_7807_when_on(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("MAINTENANCE_MODE", "true")
        get_settings.cache_clear()
        client = _client(factory, monkeypatch)

        resp = client.get("/api/anything")
        assert resp.status_code == 503
        body = resp.json()
        assert body["type"] == "maintenance"
        assert body["status"] == 503
        assert body["instance"] == "/api/anything"
        # 503 still carries the §2.9 security headers (Maintenance sits inside SecurityHeaders)
        assert resp.headers["x-frame-options"] == "DENY"
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_auth_me_returns_503_when_on(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("MAINTENANCE_MODE", "true")
        get_settings.cache_clear()
        client = _client(factory, monkeypatch)

        resp = client.get("/auth/me")
        assert resp.status_code == 503
        assert resp.json()["type"] == "maintenance"
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_health_still_serves_when_on(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("MAINTENANCE_MODE", "true")
        get_settings.cache_clear()
        client = _client(factory, monkeypatch)

        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_spa_document_route_not_503_when_on(monkeypatch):
    # Document routes pass through so the shell can boot (no SPA dist in tests → 404, not 503).
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("MAINTENANCE_MODE", "true")
        get_settings.cache_clear()
        client = _client(factory, monkeypatch)

        resp = client.get("/dashboard")
        assert resp.status_code != 503
        assert resp.status_code == 404
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_jobs_path_not_503_when_on(monkeypatch):
    # Machine-triggered /jobs/* are NOT in the 503 set (ARCH §5.4 lists /api + /auth only) — a
    # backup/restore can still run during maintenance; passes through (no route in test → 404).
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("MAINTENANCE_MODE", "true")
        get_settings.cache_clear()
        client = _client(factory, monkeypatch)

        resp = client.get("/jobs/anything")
        assert resp.status_code != 503
    finally:
        get_settings.cache_clear()
        await engine.dispose()


# ── Maintenance OFF (default) ─────────────────────────────────────────────────


async def test_api_path_not_503_when_off(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("MAINTENANCE_MODE", "false")
        get_settings.cache_clear()
        client = _client(factory, monkeypatch)

        resp = client.get("/api/anything")
        assert resp.status_code != 503
        assert resp.status_code == 404
    finally:
        get_settings.cache_clear()
        await engine.dispose()
