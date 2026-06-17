"""Middleware tests (Story 2.2): security headers + CSP, CSRF 403/200, skip-list bypass,
single per-request validation + sliding-cookie re-send, no-session→401, rate-limit intact.

Self-contained temp-DB engines (disposed in finally — Windows WAL/SHM leak, per 1.2x). The
CSRF middleware validates against `backend.middleware.async_session_factory` (imported
outside DI), so it is monkeypatched to the temp factory. `asyncio_mode=auto`.
"""

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import Depends
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.dependencies import get_current_person
from backend.main import create_app
from backend.middleware import CSP
from backend.models.base import Base
from backend.models.identity import Household, Person
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
    db_path = Path(tmp_dir) / "mw_test.db"
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


async def _seed_session(factory) -> tuple[str, str, str]:
    """Insert a Household + member + a live Session. Returns (person_id, sid, csrf_token)."""
    hh_id = str(uuid4())
    person_id = str(uuid4())
    async with factory() as db:
        db.add(Household(id=hh_id, name="MW HH", created_by=person_id))
        await db.flush()
        person = Person(
            id=person_id,
            household_id=hh_id,
            email=f"{uuid4()}@example.com",
            google_sub=f"sub-{uuid4()}",
        )
        db.add(person)
        await db.flush()
        session = await auth.create_session(db, person, ip="127.0.0.1", user_agent="pytest")
        await db.commit()
        return person_id, session.id, session.csrf_token


def _client(factory, monkeypatch) -> TestClient:
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

    async def _protected_get(person: Person = Depends(get_current_person)) -> dict:
        return {"person_id": person.id}

    async def _protected_post(person: Person = Depends(get_current_person)) -> dict:
        return {"person_id": person.id}

    app.add_api_route("/_protected", _protected_get, methods=["GET"])
    app.add_api_route("/_protected", _protected_post, methods=["POST"])
    return TestClient(app)


# ── Security headers + CSP (AC 3) ──


def _assert_security_headers(resp) -> None:
    assert resp.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert (
        resp.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=(), payment=()"
    )
    assert resp.headers["content-security-policy"] == CSP


async def test_security_headers_present_on_200_and_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client(factory, monkeypatch)
        ok = client.get("/health")
        assert ok.status_code == 200
        _assert_security_headers(ok)

        missing = client.get("/does-not-exist")
        assert missing.status_code == 404
        _assert_security_headers(missing)
    finally:
        await engine.dispose()


async def test_security_header_not_duplicated_when_route_sets_one(monkeypatch):
    # A route emitting its own CSP must not produce a duplicate — the middleware overwrites.
    engine, factory = await _make_factory()
    try:
        app = create_app()
        monkeypatch.setattr("backend.middleware.async_session_factory", factory)

        async def _route() -> JSONResponse:
            return JSONResponse({"ok": True}, headers={"content-security-policy": "default-src *"})

        app.add_api_route("/_csp", _route, methods=["GET"])
        client = TestClient(app)

        resp = client.get("/_csp")
        # httpx joins duplicate headers with ", " — asserting equality proves a single value.
        assert resp.headers["content-security-policy"] == CSP
        assert "default-src *" not in resp.headers["content-security-policy"]
    finally:
        await engine.dispose()


async def test_csp_matches_arch_2_9_exactly(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client(factory, monkeypatch)
        csp = client.get("/health").headers["content-security-policy"]
        assert csp == (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https://lh3.googleusercontent.com; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
    finally:
        await engine.dispose()


# ── CSRF enforcement (AC 1) ──


async def test_mutation_without_token_rejected_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _person_id, sid, _csrf = await _seed_session(factory)
        client = _client(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)

        resp = client.post("/_protected")
        assert resp.status_code == 403
        body = resp.json()
        assert body["type"] == "forbidden"
        assert body["status"] == 403
    finally:
        await engine.dispose()


async def test_mutation_with_wrong_token_rejected_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _person_id, sid, _csrf = await _seed_session(factory)
        client = _client(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)

        resp = client.post("/_protected", headers={"X-CSRF-Token": "not-the-right-token"})
        assert resp.status_code == 403
        assert resp.json()["type"] == "forbidden"
    finally:
        await engine.dispose()


async def _asgi_status(app, method: str, path: str, raw_headers: list[tuple[bytes, bytes]]) -> int:
    """Call the ASGI app with raw header bytes (httpx/TestClient would block non-ASCII)."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }
    messages: list[dict] = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    return next(m["status"] for m in messages if m["type"] == "http.response.start")


async def test_mutation_with_non_ascii_token_rejected_403_not_500(monkeypatch):
    # A non-ASCII X-CSRF-Token must not crash hmac.compare_digest (TypeError → 500). A raw
    # HTTP client / proxy can send arbitrary header bytes, so drive the ASGI app directly.
    engine, factory = await _make_factory()
    try:
        _person_id, sid, _csrf = await _seed_session(factory)
        app = create_app()
        monkeypatch.setattr("backend.middleware.async_session_factory", factory)

        async def _route(person: Person = Depends(get_current_person)) -> dict:
            return {"person_id": person.id}

        app.add_api_route("/_protected", _route, methods=["POST"])

        status = await _asgi_status(
            app,
            "POST",
            "/_protected",
            [
                (b"cookie", f"{auth.SESSION_COOKIE_NAME}={sid}".encode()),
                (b"x-csrf-token", b"\x80\x81bad"),  # non-ASCII bytes
            ],
        )
        assert status == 403  # not 500
    finally:
        await engine.dispose()


async def test_mutation_with_matching_token_passes(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, sid, csrf = await _seed_session(factory)
        client = _client(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)

        resp = client.post("/_protected", headers={"X-CSRF-Token": csrf})
        assert resp.status_code == 200
        assert resp.json()["person_id"] == person_id
        # the sliding cookie is re-sent by the middleware on a validated request
        assert auth.SESSION_COOKIE_NAME in resp.headers.get("set-cookie", "")
        assert "max-age=1800" in resp.headers.get("set-cookie", "").lower()
    finally:
        await engine.dispose()


# ── Skip-list / safe-method bypass (AC 2) ──


async def test_safe_get_bypasses_csrf(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, sid, _csrf = await _seed_session(factory)
        client = _client(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)

        resp = client.get("/_protected")  # no X-CSRF-Token
        assert resp.status_code == 200
        assert resp.json()["person_id"] == person_id
    finally:
        await engine.dispose()


async def test_public_auth_path_not_csrf_rejected(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client(factory, monkeypatch)
        # /auth/login is exempt — a GET 302s to Google, never a CSRF 403
        resp = client.get("/auth/login", follow_redirects=False)
        assert resp.status_code == 302
    finally:
        await engine.dispose()


async def test_health_serves_under_full_stack(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client(factory, monkeypatch)
        assert client.get("/health").json() == {"status": "ok"}
    finally:
        await engine.dispose()


# ── 401 vs 403 boundary (AC 1 / Gotcha #4) ──


async def test_mutation_without_session_is_401_not_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client(factory, monkeypatch)  # no session cookie set
        resp = client.post("/_protected")
        assert resp.status_code == 401
        assert resp.json()["type"] == "unauthorized"
    finally:
        await engine.dispose()


# ── Single per-request validation (AC 4) ──


async def test_validate_session_called_once_per_mutation(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _person_id, sid, csrf = await _seed_session(factory)

        calls = {"n": 0}
        real_validate = auth.validate_session

        async def _counting_validate(db, session_id, *, bypass_enabled):
            calls["n"] += 1
            return await real_validate(db, session_id, bypass_enabled=bypass_enabled)

        # The CSRF middleware imports validate_session into its own namespace.
        monkeypatch.setattr("backend.middleware.validate_session", _counting_validate)

        client = _client(factory, monkeypatch)
        client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
        resp = client.post("/_protected", headers={"X-CSRF-Token": csrf})
        assert resp.status_code == 200
        # validated once in the middleware; get_current_person reads request.state.auth
        assert calls["n"] == 1
    finally:
        await engine.dispose()


# ── Rate limiting still works with SlowAPIMiddleware installed (AC 5) ──


async def test_auth_login_rate_limited_under_middleware(monkeypatch):
    engine, factory = await _make_factory()
    try:
        client = _client(factory, monkeypatch)
        limiter.enabled = True
        try:
            statuses = [
                client.get("/auth/login", follow_redirects=False).status_code for _ in range(21)
            ]
        finally:
            limiter.enabled = False
        assert statuses.count(429) >= 1
        assert all(s in (302, 429) for s in statuses)
        # the 429 carries the §4.6 envelope
        last = client.get("/auth/login", follow_redirects=False) if 429 in statuses else None
        if last is not None and last.status_code == 429:
            assert last.json()["type"] == "rate_limited"
    finally:
        limiter.enabled = False
        await engine.dispose()
