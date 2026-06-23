"""Entity-preference endpoint tests (Story 4.12, FR-E-021).

The `/api/entity-preferences` GET + partial-merge PUT (the favourite-star backend the accounts page
needs). Self-contained temp-DB harness like `test_accounts.py`. Covers: favourite round-trips; a
later sort PUT does NOT wipe the favourite (the merge contract); per-person isolation; a
body-supplied person id can't override session scoping. `entity_id` is an opaque string here — the
table has no FK, so the tests use a synthetic id rather than seeding a real account.
"""

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

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
    db_path = Path(tmp_dir) / "entity_pref_test.db"
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


async def _seed_person(factory, hh_id: str | None = None) -> tuple[str, str]:
    """Insert a Person (with its Household if new). Returns (person_id, household_id)."""
    person_id = str(uuid4())
    async with factory() as db:
        if hh_id is None:
            hh_id = str(uuid4())
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
                display_name="Member",
                role="admin",
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
    # Clear first: a prior request's sliding-cookie Set-Cookie lingers in the jar and would
    # otherwise collide with the manual set when a test switches persons on the same client.
    client.cookies.clear()
    client.cookies.set(auth.SESSION_COOKIE_NAME, sid)
    client.headers["X-CSRF-Token"] = csrf


async def test_favourite_round_trips(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        acct = str(uuid4())

        put = client.put(
            "/api/entity-preferences",
            json={"entity_type": "accounts", "entity_id": acct, "is_favourite": True},
        )
        assert put.status_code == 200
        assert put.json()["is_favourite"] is True

        got = client.get("/api/entity-preferences?entity_type=accounts").json()
        assert got["total"] == 1
        assert got["items"][0]["entity_id"] == acct
        assert got["items"][0]["is_favourite"] is True
    finally:
        await engine.dispose()


async def test_sort_put_does_not_wipe_favourite(monkeypatch):
    """The partial-merge contract: setting sort_order later must NOT reset is_favourite (and a
    favourite toggle must not clear a prior sort). A naive full-row replace would fail this."""
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        acct = str(uuid4())

        client.put(
            "/api/entity-preferences",
            json={"entity_type": "accounts", "entity_id": acct, "is_favourite": True},
        )
        # Second PUT sends ONLY sort_order — is_favourite is omitted, must stay True.
        merged = client.put(
            "/api/entity-preferences",
            json={"entity_type": "accounts", "entity_id": acct, "sort_order": 3},
        )
        assert merged.json()["is_favourite"] is True
        assert merged.json()["sort_order"] == 3

        # And a favourite-only PUT afterwards leaves the sort intact.
        again = client.put(
            "/api/entity-preferences",
            json={"entity_type": "accounts", "entity_id": acct, "is_favourite": False},
        )
        assert again.json()["sort_order"] == 3
        assert again.json()["is_favourite"] is False
    finally:
        await engine.dispose()


async def test_per_person_isolation(monkeypatch):
    """One member's favourite is invisible to another — even in the same household."""
    engine, factory = await _make_factory()
    try:
        person_a, hh_id = await _seed_person(factory)
        person_b, _ = await _seed_person(factory, hh_id)
        sid_a, csrf_a = await _seed_session(factory, person_a)
        sid_b, csrf_b = await _seed_session(factory, person_b)
        client = _client_with_db(factory, monkeypatch)
        acct = str(uuid4())

        _auth(client, sid_a, csrf_a)
        client.put(
            "/api/entity-preferences",
            json={"entity_type": "accounts", "entity_id": acct, "is_favourite": True},
        )

        # Person B sees nothing.
        _auth(client, sid_b, csrf_b)
        got_b = client.get("/api/entity-preferences?entity_type=accounts").json()
        assert got_b["total"] == 0
    finally:
        await engine.dispose()


async def test_body_person_id_cannot_override_scoping(monkeypatch):
    """A body-supplied person id is ignored — the row is scoped to the SESSION person only."""
    engine, factory = await _make_factory()
    try:
        person_a, hh_id = await _seed_person(factory)
        person_b, _ = await _seed_person(factory, hh_id)
        sid_a, csrf_a = await _seed_session(factory, person_a)
        sid_b, csrf_b = await _seed_session(factory, person_b)
        client = _client_with_db(factory, monkeypatch)
        acct = str(uuid4())

        # Person A writes, trying to attribute it to person B via the body.
        _auth(client, sid_a, csrf_a)
        client.put(
            "/api/entity-preferences",
            json={
                "entity_type": "accounts",
                "entity_id": acct,
                "is_favourite": True,
                "person_id": person_b,
            },
        )
        # It landed under A (A sees it), not B.
        assert client.get("/api/entity-preferences?entity_type=accounts").json()["total"] == 1
        _auth(client, sid_b, csrf_b)
        assert client.get("/api/entity-preferences?entity_type=accounts").json()["total"] == 0
    finally:
        await engine.dispose()


async def test_blank_keys_rejected_422(monkeypatch):
    """An empty/whitespace entity_type or entity_id is a 422 — never a persisted junk row."""
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        blank_id = client.put(
            "/api/entity-preferences",
            json={"entity_type": "accounts", "entity_id": "   ", "is_favourite": True},
        )
        assert blank_id.status_code == 422
        blank_type = client.put(
            "/api/entity-preferences",
            json={"entity_type": "", "entity_id": "x", "is_favourite": True},
        )
        assert blank_type.status_code == 422
    finally:
        await engine.dispose()


async def test_upsert_merges_pre_existing_row_on_repeat(monkeypatch):
    """A second favourite-PUT for the same key merges the existing row (the no-race upsert path) —
    no duplicate row, no IntegrityError surfacing as a 500."""
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)
        acct = str(uuid4())

        for _ in range(3):
            r = client.put(
                "/api/entity-preferences",
                json={"entity_type": "accounts", "entity_id": acct, "is_favourite": True},
            )
            assert r.status_code == 200
        # Still exactly one row.
        assert client.get("/api/entity-preferences?entity_type=accounts").json()["total"] == 1
    finally:
        await engine.dispose()
