"""`PATCH /api/profile` tests (Story 2.9): per-person profile & appearance self-edit.

Mirrors `test_household.py`: self-contained temp-DB engines (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `/api/profile` is a
mutating, non-exempt route, so requests carry the session cookie **and** the `X-CSRF-Token` header.
Covers: each field persists, partial update, enum/empty/unknown-key validation (400), cross-person
isolation, and the extended §2.14.C `/auth/me` person payload (appearance defaults).
"""

import json
import tempfile
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.currency import Currency
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
    db_path = Path(tmp_dir) / "profile_test.db"
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


async def _seed_person(factory, **overrides) -> str:
    """Insert a Person (no household needed — profile is a personal preference). Returns its id."""
    person_id = str(uuid4())
    async with factory() as db:
        db.add(
            Person(
                id=person_id,
                email=f"{uuid4()}@example.com",
                display_name=overrides.get("display_name", "Original Name"),
                role="member",
                google_sub=f"sub-{uuid4()}",
                **{k: v for k, v in overrides.items() if k != "display_name"},
            )
        )
        await db.commit()
    return person_id


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


# ── Persist ──


async def test_patch_profile_persists_each_field(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch(
            "/api/profile",
            json={
                "displayName": "Ben Lim",
                "theme": "retro",
                "font": "mono",
                "density": "compact",
                "displayFormat": "MM-DD-YYYY",
                "reduceMotion": True,
                "notificationPrefs": {"backups": True, "fxStale": False},
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["personId"] == person_id
        assert body["displayName"] == "Ben Lim"
        assert body["theme"] == "retro"
        assert body["font"] == "mono"
        assert body["density"] == "compact"
        assert body["displayFormat"] == "MM-DD-YYYY"
        assert body["reduceMotion"] is True
        # Partial notification update merges over defaults (others keep their default state).
        assert body["notificationPrefs"]["backups"] is True
        assert body["notificationPrefs"]["fxStale"] is False
        assert body["notificationPrefs"]["budgetWarnings"] is True  # default, untouched
        assert set(body["notificationPrefs"]) == {
            "budgetWarnings",
            "budgetOverruns",
            "missedRecurring",
            "upcomingPayments",
            "fxStale",
            "backups",
        }

        async with factory() as db:
            person = await db.get(Person, person_id)
            assert person.display_name == "Ben Lim"
            assert person.theme == "retro"
            assert person.font == "mono"
            assert person.density == "compact"
            assert person.display_format == "MM-DD-YYYY"
            assert person.reduce_motion is True
            assert json.loads(person.notification_prefs)["backups"] is True
    finally:
        await engine.dispose()


async def test_patch_profile_partial_leaves_others(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/profile", json={"theme": "gameboy"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["theme"] == "gameboy"
        assert body["font"] == "base"  # default, untouched
        assert body["displayName"] == "Original Name"  # untouched

        async with factory() as db:
            person = await db.get(Person, person_id)
            assert person.theme == "gameboy"
            assert person.font == "base"
            assert person.display_name == "Original Name"
    finally:
        await engine.dispose()


# ── Rejections ──


@pytest.mark.parametrize(
    "body",
    [
        {"theme": "neon"},
        {"font": "comic-sans"},
        {"density": "roomy"},
        {"displayName": "   "},
        {"displayFormat": "DD/MM/YYYY"},
        {"notificationPrefs": {"unknownKey": True}},
    ],
)
async def test_patch_profile_invalid_value_400(monkeypatch, body):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/profile", json=body)
        assert resp.status_code == 400
        assert resp.json()["status"] == 400  # RFC 7807

        async with factory() as db:
            person = await db.get(Person, person_id)
            assert person.theme == "base"  # nothing persisted
            assert person.display_name == "Original Name"
    finally:
        await engine.dispose()


async def test_patch_profile_does_not_touch_other_person(monkeypatch):
    engine, factory = await _make_factory()
    try:
        editor_id = await _seed_person(factory, display_name="Editor")
        other_id = await _seed_person(factory, display_name="Other")
        sid, csrf = await _seed_session(factory, editor_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch(
            "/api/profile",
            json={"theme": "brown", "displayName": "Edited", "displayFormat": "YYYY-MM-DD"},
        )
        assert resp.status_code == 200

        async with factory() as db:
            editor = await db.get(Person, editor_id)
            other = await db.get(Person, other_id)
            assert editor.theme == "brown"
            assert editor.display_name == "Edited"
            assert editor.display_format == "YYYY-MM-DD"
            assert other.theme == "base"  # untouched
            assert other.display_name == "Other"
            assert other.display_format == "DD-MM-YYYY"  # untouched (default)
    finally:
        await engine.dispose()


# ── Bootstrap payload (§2.14.C) ──


async def test_auth_me_person_carries_appearance_defaults(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)  # never saved any prefs
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        body = client.get("/auth/me").json()
        person = body["person"]
        assert person["theme"] == "base"
        assert person["font"] == "base"
        assert person["density"] == "comfortable"
        assert person["displayFormat"] == "DD-MM-YYYY"  # FR-P-009 default
        assert person["reduceMotion"] is False
        assert person["notificationPrefs"] == {
            "budgetWarnings": True,
            "budgetOverruns": True,
            "missedRecurring": True,
            "upcomingPayments": False,
            "fxStale": True,
            "backups": False,
        }
    finally:
        await engine.dispose()


# ── Display currency (Story 3.9, FR-CU-004) ──


async def _seed_person_with_currencies(factory) -> str:
    """A household with base SGD + a display-active NZD + a non-display-active EUR, and a member.
    Returns the member's id."""
    hh_id = str(uuid4())
    person_id = str(uuid4())
    async with factory() as db:
        db.add(Household(id=hh_id, name="Acme", base_currency="SGD", created_by=person_id))
        await db.flush()
        db.add(
            Person(
                id=person_id,
                household_id=hh_id,
                email=f"{uuid4()}@example.com",
                display_name="Member",
                role="member",
                google_sub=f"sub-{uuid4()}",
            )
        )
        for code, active in (("SGD", True), ("NZD", True), ("EUR", False)):
            db.add(
                Currency(
                    household_id=hh_id,
                    code=code,
                    name=code,
                    symbol=code,
                    is_base=(code == "SGD"),
                    is_display_active=active,
                    rate_to_base=Decimal("1.0"),
                    fee_pct=Decimal("0"),
                )
            )
        await db.commit()
    return person_id


async def test_patch_profile_display_currency_persists(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person_with_currencies(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/profile", json={"displayCurrency": "nzd"})  # lowercased input
        assert resp.status_code == 200
        assert resp.json()["displayCurrency"] == "NZD"  # uppercased

        async with factory() as db:
            assert (await db.get(Person, person_id)).display_currency == "NZD"
    finally:
        await engine.dispose()


@pytest.mark.parametrize("code", ["EUR", "USD"])
async def test_patch_profile_display_currency_invalid_400(monkeypatch, code):
    """EUR exists but is not display-active; USD is not in the household at all. Both → 400."""
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person_with_currencies(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.patch("/api/profile", json={"displayCurrency": code})
        assert resp.status_code == 400
        assert resp.json()["status"] == 400

        async with factory() as db:
            # Default is now 'native' (Story 4.9) and the 400 left it untouched.
            assert (await db.get(Person, person_id)).display_currency == "native"
    finally:
        await engine.dispose()


@pytest.mark.parametrize("sent", ["native", "NATIVE", "Native"])
async def test_patch_profile_display_currency_native_mode(monkeypatch, sent):
    """The 'native' sentinel (any case) is a display MODE — accepted without a Currency lookup,
    stored lowercase (Story 4.9, FR-CU-004)."""
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person_with_currencies(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # Move off the default first so the assertion proves the native write, not the seed default.
        assert client.patch("/api/profile", json={"displayCurrency": "NZD"}).status_code == 200

        resp = client.patch("/api/profile", json={"displayCurrency": sent})
        assert resp.status_code == 200
        assert resp.json()["displayCurrency"] == "native"

        async with factory() as db:
            assert (await db.get(Person, person_id)).display_currency == "native"
    finally:
        await engine.dispose()


# ── Recent glyphs (Story 3.1, UX §8.3) ──


async def test_recent_glyphs_empty_then_push_dedupe_cap(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id = await _seed_person(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        # Never picked → empty.
        assert client.get("/api/profile/recent-glyphs").json()["glyphs"] == []

        # Push four distinct → most-recent first.
        for g in ["🍔", "🛒", "🚇", "🏠"]:
            client.post("/api/profile/recent-glyphs", json={"glyph": g})
        assert client.get("/api/profile/recent-glyphs").json()["glyphs"] == ["🏠", "🚇", "🛒", "🍔"]

        # Re-pick an existing one → moves to front, no duplicate.
        body = client.post("/api/profile/recent-glyphs", json={"glyph": "🛒"}).json()
        assert body["glyphs"] == ["🛒", "🏠", "🚇", "🍔"]

        # Cap at 8.
        for g in ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]:
            client.post("/api/profile/recent-glyphs", json={"glyph": g})
        glyphs = client.get("/api/profile/recent-glyphs").json()["glyphs"]
        assert len(glyphs) == 8
        assert glyphs[0] == "j"  # most-recent first
    finally:
        await engine.dispose()
