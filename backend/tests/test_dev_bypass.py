"""Story 2.3 — dev bypass: `DevBypassMiddleware` on/off, the flag-off fail-safe, `POST
/auth/dev-login` 200/404, and the production-guard CRITICAL log (ARCH §2.5/§2.14.B).

`get_settings` is `@lru_cache`d → set env + clear cache. Through-`create_app()` tests point the
middleware's `async_session_factory` at the temp DB (the 2.2 gotcha). A localhost client is forced
via `TestClient(..., client=("127.0.0.1", N))` since the default TestClient host is "testclient".
"""

import logging
import secrets
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import get_current_person
from backend.main import create_app
from backend.models.base import Base
from backend.models.identity import Person, Session
from backend.rate_limit import limiter
from backend.services import auth

LOCALHOST = ("127.0.0.1", 54321)


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "devbypass_test.db"
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


def _app_with_protected(factory, monkeypatch) -> TestClient:
    monkeypatch.setattr("backend.middleware.async_session_factory", factory)
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

    async def _protected(person: Person = Depends(get_current_person)) -> dict:
        return {"person_id": person.id}

    app.add_api_route("/_protected", _protected, methods=["GET"])
    return TestClient(app, client=LOCALHOST)


async def test_dev_bypass_authenticates_on_localhost_when_on(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("AUTH_BYPASS_ENABLED", "true")
        get_settings.cache_clear()
        client = _app_with_protected(factory, monkeypatch)

        resp = client.get("/_protected")
        assert resp.status_code == 200
        assert resp.headers.get("X-Session-Id")
        assert "session_id" in resp.headers.get("set-cookie", "")

        async with factory() as db:
            persons = (
                (await db.execute(select(Person).where(Person.google_sub == auth.DEV_GOOGLE_SUB)))
                .scalars()
                .all()
            )
            assert len(persons) == 1
            assert persons[0].household_id is not None  # seeded a real household
            sessions = (
                (await db.execute(select(Session).where(Session.user_agent == auth.DEV_USER_AGENT)))
                .scalars()
                .all()
            )
            assert len(sessions) == 1
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_dev_bypass_skips_exempt_paths_when_on(monkeypatch):
    # A liveness/monitoring ping to an exempt path must NOT seed a dev household (§2.11 skip-list).
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("AUTH_BYPASS_ENABLED", "true")
        get_settings.cache_clear()
        client = _app_with_protected(factory, monkeypatch)

        resp = client.get("/health")
        assert resp.status_code == 200
        assert "X-Session-Id" not in resp.headers  # DevBypass stayed inert on the exempt path

        async with factory() as db:
            persons = (
                (await db.execute(select(Person).where(Person.google_sub == auth.DEV_GOOGLE_SUB)))
                .scalars()
                .all()
            )
            assert persons == []  # no dev person/household conjured by a health check
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_dev_bypass_inert_and_stale_dev_session_rejected_when_off(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setenv("AUTH_BYPASS_ENABLED", "false")
        get_settings.cache_clear()

        # A stale dev session left over from when bypass was on.
        async with factory() as db:
            person = Person(
                id=str(uuid4()),
                email=auth.DEV_BYPASS_EMAIL,
                google_sub=auth.DEV_GOOGLE_SUB,
            )
            db.add(person)
            await db.flush()
            now = datetime.now(UTC)
            stale = Session(
                id=str(uuid4()),
                person_id=person.id,
                created_at=now,
                last_activity_at=now,
                expires_at=now + timedelta(hours=12),
                csrf_token=secrets.token_urlsafe(16),
                user_agent=auth.DEV_USER_AGENT,
            )
            db.add(stale)
            await db.commit()
            stale_id = stale.id

        client = _app_with_protected(factory, monkeypatch)
        client.cookies.set("session_id", stale_id)
        resp = client.get("/_protected")
        assert resp.status_code == 401  # fail-safe: dev session rejected while bypass is off
    finally:
        get_settings.cache_clear()
        await engine.dispose()


async def test_dev_login_404_when_off_200_when_on(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setattr("backend.middleware.async_session_factory", factory)

        async def _override_get_db():
            async with factory() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

        monkeypatch.setenv("AUTH_BYPASS_ENABLED", "false")
        get_settings.cache_clear()
        app_off = create_app()
        app_off.dependency_overrides[get_db] = _override_get_db
        client_off = TestClient(app_off, client=LOCALHOST)
        assert client_off.post("/auth/dev-login").status_code == 404

        monkeypatch.setenv("AUTH_BYPASS_ENABLED", "true")
        get_settings.cache_clear()
        app_on = create_app()
        app_on.dependency_overrides[get_db] = _override_get_db
        client_on = TestClient(app_on, client=LOCALHOST)
        resp = client_on.post("/auth/dev-login")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert resp.headers.get("X-Session-Id")
        assert "session_id" in resp.headers.get("set-cookie", "")
    finally:
        get_settings.cache_clear()
        await engine.dispose()


def test_production_guard_logs_critical_when_bypass_on_in_non_dev(monkeypatch, caplog):
    monkeypatch.setenv("AUTH_BYPASS_ENABLED", "true")
    monkeypatch.setenv("ENV", "production")
    get_settings.cache_clear()
    try:
        with caplog.at_level(logging.CRITICAL):
            create_app()
        assert any(r.msg == "auth_bypass_enabled_in_non_dev_environment" for r in caplog.records)
    finally:
        get_settings.cache_clear()
