"""FX provider config tests (Story 3.6): owner-gated CRUD + reorder + idempotent default seeding.

Mirrors `test_currency.py`: self-contained temp-DB engines (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `/api/fx-providers`
POST/PATCH/DELETE/reorder are mutating, non-exempt, **owner-only** routes, so requests carry the
session cookie **and** the `X-CSRF-Token` header. Covers: seed-on-first-GET (idempotent), the
keyless Frankfurter + key-by-ref Open Exchange Rates default chain, `key_configured` tracking the
env, no-key-value-leak, create/bad-type, reorder, update/enable-toggle, delete + self-heal,
cross-household 404, and admin-cannot-mutate 403 (the owner-only differentiator).
"""

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import get_settings
from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.identity import Household, Person
from backend.rate_limit import limiter
from backend.services import auth


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "fx_provider_test.db"
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


async def _seed_household(factory, *, role: str = "owner") -> tuple[str, str]:
    """Insert a Household + a Person (owner by default). Returns (person_id, household_id).
    No FX providers are seeded here — Story 3.6 owns that (seed-on-first-GET)."""
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
        await db.commit()
    return person_id, hh_id


async def _seed_session(factory, person_id: str) -> tuple[str, str]:
    async with factory() as db:
        session = await auth.create_session(
            db, await db.get(Person, person_id), ip="127.0.0.1", user_agent="pytest"
        )
        await db.commit()
        return session.id, session.csrf_token


def _auth(client: TestClient, sid: str, csrf: str) -> None:
    client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
    client.headers["X-CSRF-Token"] = csrf


def _by_type(items: list[dict], provider_type: str) -> dict:
    return next(p for p in items if p["provider_type"] == provider_type)


# ── Seeding ──


async def test_seed_on_first_get_idempotent(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        items = client.get("/api/fx-providers").json()["items"]
        # OXR is the primary (priority 0, seeds disabled until keyed); Frankfurter is the keyless
        # always-on fallback (priority 1).
        assert [p["provider_type"] for p in items] == ["openexchangerates", "frankfurter"]
        assert items[0]["priority"] == 0 and items[1]["priority"] == 1

        # A second GET does not duplicate (idempotent on (household, provider_type)).
        again = client.get("/api/fx-providers").json()
        assert again["total"] == 2
    finally:
        await engine.dispose()


async def test_key_configured_reflects_env(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # No key in the env → openexchangerates seeded disabled + key_configured false.
        get_settings.cache_clear()
        monkeypatch.setattr(get_settings(), "exchangerate_api_key", "", raising=False)
        items = client.get("/api/fx-providers").json()["items"]
        oxr = _by_type(items, "openexchangerates")
        frank = _by_type(items, "frankfurter")
        assert oxr["requires_key"] is True
        assert oxr["key_configured"] is False
        assert oxr["is_enabled"] is False
        assert frank["requires_key"] is False
        assert frank["is_enabled"] is True  # keyless always usable

        # Set the key → key_configured flips true (is_enabled is the seeded value, unchanged).
        monkeypatch.setattr(get_settings(), "exchangerate_api_key", "test-key-123", raising=False)
        items2 = client.get("/api/fx-providers").json()["items"]
        assert _by_type(items2, "openexchangerates")["key_configured"] is True
    finally:
        await engine.dispose()
        get_settings.cache_clear()


async def test_no_key_value_ever_leaks(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        get_settings.cache_clear()
        secret = "super-secret-value"  # nosec B105
        monkeypatch.setattr(get_settings(), "exchangerate_api_key", secret, raising=False)
        raw = client.get("/api/fx-providers").text
        # Only the reference NAME may appear, never the secret value.
        assert "super-secret-value" not in raw
        assert "EXCHANGERATE_API_KEY" in raw
    finally:
        await engine.dispose()
        get_settings.cache_clear()


# ── Create ──


async def test_create_appends_with_registry_defaults(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        client.get("/api/fx-providers")  # seed the 2 defaults (priority 0, 1)
        resp = client.post("/api/fx-providers", json={"provider_type": "exchangerate_api"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "ExchangeRate-API"  # registry default
        assert body["base_url"].startswith("https://")
        assert body["priority"] == 2  # appended to the chain end
        assert body["requires_key"] is True
    finally:
        await engine.dispose()


async def test_create_keyless_ignores_secret_ref(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # Delete the seeded frankfurter, then re-create it with a stray secret ref → stored NULL.
        seeded = client.get("/api/fx-providers").json()["items"]
        frank_id = _by_type(seeded, "frankfurter")["id"]
        client.delete(f"/api/fx-providers/{frank_id}")
        resp = client.post(
            "/api/fx-providers",
            json={"provider_type": "frankfurter", "api_key_secret_ref": "IGNORED"},  # nosec B105
        )
        assert resp.status_code == 201
        assert resp.json()["api_key_secret_ref"] is None
    finally:
        await engine.dispose()


async def test_create_bad_type_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/fx-providers", json={"provider_type": "madeup"})
        assert resp.status_code == 400
        assert resp.json()["status"] == 400
    finally:
        await engine.dispose()


# ── Reorder ──


async def test_reorder_rewrites_priority(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        items = client.get("/api/fx-providers").json()["items"]
        frank = _by_type(items, "frankfurter")["id"]
        oxr = _by_type(items, "openexchangerates")["id"]

        # Swap the seeded order (oxr, frank) → (frank, oxr).
        resp = client.post("/api/fx-providers/reorder", json={"ordered_ids": [frank, oxr]})
        assert resp.status_code == 200
        reordered = resp.json()["items"]
        assert [p["id"] for p in reordered] == [frank, oxr]
        assert reordered[0]["priority"] == 0 and reordered[1]["priority"] == 1

        # A list missing an id (or with a stranger) → 400.
        assert (
            client.post("/api/fx-providers/reorder", json={"ordered_ids": [oxr]}).status_code == 400
        )
        bad = client.post(
            "/api/fx-providers/reorder", json={"ordered_ids": [oxr, frank, str(uuid4())]}
        )
        assert bad.status_code == 400
    finally:
        await engine.dispose()


# ── Update ──


async def test_update_enable_toggle_and_keyless_ref_ignored(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        items = client.get("/api/fx-providers").json()["items"]
        frank = _by_type(items, "frankfurter")["id"]

        # Enable toggle persists.
        resp = client.patch(f"/api/fx-providers/{frank}", json={"is_enabled": False})
        assert resp.status_code == 200
        assert resp.json()["is_enabled"] is False

        # A secret ref on the keyless Frankfurter row is ignored (stays NULL).
        resp2 = client.patch(
            f"/api/fx-providers/{frank}", json={"api_key_secret_ref": "X"}  # nosec B105
        )
        assert resp2.json()["api_key_secret_ref"] is None
    finally:
        await engine.dispose()


# ── Delete + self-heal ──


async def test_delete_sticks_reseed_only_when_emptied(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        items = client.get("/api/fx-providers").json()["items"]
        oxr = _by_type(items, "openexchangerates")["id"]
        frank = _by_type(items, "frankfurter")["id"]

        # Removing a default provider STICKS — the household still has frankfurter, so no re-seed.
        assert client.delete(f"/api/fx-providers/{oxr}").status_code == 204
        after = client.get("/api/fx-providers").json()["items"]
        assert {p["provider_type"] for p in after} == {"frankfurter"}

        # Only an emptied household re-seeds the full default chain on the next GET.
        assert client.delete(f"/api/fx-providers/{frank}").status_code == 204
        reseeded = client.get("/api/fx-providers").json()["items"]
        assert {p["provider_type"] for p in reseeded} == {"frankfurter", "openexchangerates"}
    finally:
        await engine.dispose()


# ── Scoping & role ──


async def test_cross_household_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        a_person, _ = await _seed_household(factory)
        b_person, _ = await _seed_household(factory)
        a_sid, a_csrf = await _seed_session(factory, a_person)
        b_sid, b_csrf = await _seed_session(factory, b_person)

        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, a_sid, a_csrf)
        a_items = client_a.get("/api/fx-providers").json()["items"]
        a_id = a_items[0]["id"]

        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, b_sid, b_csrf)
        patched = client_b.patch(f"/api/fx-providers/{a_id}", json={"is_enabled": False})
        assert patched.status_code == 404
        assert client_b.delete(f"/api/fx-providers/{a_id}").status_code == 404
    finally:
        await engine.dispose()


async def test_admin_cannot_mutate_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        # Integrations are OWNER-only (vs. admin for categories/currencies) — an admin gets 403.
        person_id, _ = await _seed_household(factory, role="admin")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        assert client.get("/api/fx-providers").status_code == 200  # admin can read
        created = client.post("/api/fx-providers", json={"provider_type": "frankfurter"})
        assert created.status_code == 403
        items = client.get("/api/fx-providers").json()["items"]
        pid = items[0]["id"]
        patched = client.patch(f"/api/fx-providers/{pid}", json={"is_enabled": False})
        assert patched.status_code == 403
        assert client.delete(f"/api/fx-providers/{pid}").status_code == 403
        reordered = client.post("/api/fx-providers/reorder", json={"ordered_ids": []})
        assert reordered.status_code == 403
    finally:
        await engine.dispose()


async def test_member_can_read_owner_can_mutate(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory, role="member")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        assert client.get("/api/fx-providers").status_code == 200
        created = client.post("/api/fx-providers", json={"provider_type": "frankfurter"})
        assert created.status_code == 403
    finally:
        await engine.dispose()
