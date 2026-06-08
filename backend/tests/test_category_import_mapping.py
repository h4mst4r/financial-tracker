"""Tests for CAT-004 — Import category mapping service.

Covers:
    - preview_import_mappings() service function (exact, trimmed, fuzzy, unmapped)
    - auto_create_category() colour cycling and idempotency
    - POST /api/categories/import/preview route endpoint
    - Validation: empty category_values, > 500 items
"""

import os
import secrets
import tempfile
from datetime import timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import backend.config
import backend.database
from backend.main import app
from backend.models.base import utcnow
from backend.models.category import Category
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as SessionModel
from backend.services.category_service import (
    auto_create_category,
    ENTITY_ACCENT_COLORS,
    preview_import_mappings,
)


@pytest.fixture(autouse=True)
def _reset_auth_bypass():
    backend.config.settings.AUTH_BYPASS_ENABLED = False
    yield
    backend.config.settings.AUTH_BYPASS_ENABLED = False


# ---------------------------------------------------------------------------
# Test DB fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _use_test_db():
    """Swap in a fresh temp SQLite for every test run."""
    import backend.config
    import backend.database as _bdb

    original_url = backend.config.settings.DATABASE_URL
    original_engine = _bdb.engine
    original_factory = _bdb.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="cat_import_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(
        test_url,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    _bdb.engine = engine
    _bdb.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    import backend.models  # noqa: F401
    from backend.database import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    backend.config.settings.DATABASE_URL = original_url
    _bdb.engine = original_engine
    _bdb.async_session_factory = original_factory

    try:
        os.close(tmp_fd)
        os.unlink(tmp_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _create_household_and_owner():
    household_id = uuid4()
    owner_id = uuid4()
    now = utcnow()
    csrf = secrets.token_urlsafe(32)

    async with backend.database.async_session_factory() as db:
        hh = Household(
            id=household_id,
            name="Test Household",
            base_currency="SGD",
            timezone="Asia/Singapore",
            created_by=owner_id,
        )
        owner = Person(
            id=owner_id,
            household_id=household_id,
            google_sub=f"owner_{owner_id.hex}",
            email="owner@example.com",
            display_name="Owner User",
            role="owner",
            display_currency="SGD",
            default_view="household",
            created_by=owner_id,
        )
        session = SessionModel(
            person_id=owner_id,
            expires_at=now + timedelta(minutes=30),
            last_activity_at=now,
            csrf_token=csrf,
        )
        db.add_all([hh, owner, session])
        await db.flush()
        session_id = session.id
        await db.commit()

    return household_id, owner_id, session_id, csrf


async def _create_categories(household_id, owner_id, categories):
    cats = []
    async with backend.database.async_session_factory() as db:
        for cat_data in categories:
            cat = Category(
                household_id=household_id,
                created_by=owner_id,
                **cat_data,
            )
            db.add(cat)
            cats.append(cat)
        await db.flush()
        cat_ids = [cat.id for cat in cats]
        await db.commit()
    return cat_ids


def _get_client(session_id, csrf):
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    client.cookies.set("session_id", str(session_id))
    return client


# ---------------------------------------------------------------------------
# AC: preview_import_mappings() — match types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preview_exact_match():
    """Exact match: 'Food & Drink' → existing 'Food & Drink'."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food & Drink", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])

    async with backend.database.async_session_factory() as db:
        mappings = await preview_import_mappings(db, hh_id, ["Food & Drink"])

    assert len(mappings) == 1
    assert mappings[0]["match_type"] == "exact"
    assert mappings[0]["mapped_to_name"] == "Food & Drink"
    assert mappings[0]["suggested_action"] == "map"


@pytest.mark.asyncio
async def test_preview_trimmed_match():
    """Trimmed match: '  Shopping  ' → existing 'Shopping'."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Shopping", "color": "#3b82f6", "category_type": "expense", "depth": 0},
    ])

    async with backend.database.async_session_factory() as db:
        mappings = await preview_import_mappings(db, hh_id, ["  Shopping  "])

    assert len(mappings) == 1
    assert mappings[0]["match_type"] == "trimmed"
    assert mappings[0]["mapped_to_name"] == "Shopping"
    assert mappings[0]["suggested_action"] == "map"


@pytest.mark.asyncio
async def test_preview_fuzzy_match():
    """Fuzzy match: 'Food Drink' → fuzzy matches 'Food & Drink' (ratio ~0.89)."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food & Drink", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])

    async with backend.database.async_session_factory() as db:
        mappings = await preview_import_mappings(db, hh_id, ["Food Drink"])

    assert len(mappings) == 1
    assert mappings[0]["match_type"] == "fuzzy"
    assert mappings[0]["mapped_to_name"] == "Food & Drink"
    assert mappings[0]["suggested_action"] == "map"


@pytest.mark.asyncio
async def test_preview_unmapped():
    """Unmapped: 'Pet Supplies' → no match."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food & Drink", "color": "#ef4444", "category_type": "expense", "depth": 0},
        {"name": "Shopping", "color": "#3b82f6", "category_type": "expense", "depth": 0},
    ])

    async with backend.database.async_session_factory() as db:
        mappings = await preview_import_mappings(db, hh_id, ["Pet Supplies"])

    assert len(mappings) == 1
    assert mappings[0]["match_type"] == "unmapped"
    assert mappings[0]["mapped_to_id"] is None
    assert mappings[0]["suggested_action"] == "create_new"


@pytest.mark.asyncio
async def test_preview_case_insensitive():
    """Case-insensitive: 'INCOME' → matches 'Income'."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Income", "color": "#84cc16", "category_type": "income", "depth": 0},
    ])

    async with backend.database.async_session_factory() as db:
        mappings = await preview_import_mappings(db, hh_id, ["INCOME"])

    assert len(mappings) == 1
    assert mappings[0]["match_type"] == "exact"
    assert mappings[0]["mapped_to_name"] == "Income"


@pytest.mark.asyncio
async def test_preview_deduplication():
    """Same name (case-insensitive) appears twice → one mapping entry."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])

    async with backend.database.async_session_factory() as db:
        mappings = await preview_import_mappings(db, hh_id, ["Food", "food", "FOOD"])

    assert len(mappings) == 1
    assert mappings[0]["original_name"] == "Food"


@pytest.mark.asyncio
async def test_preview_empty_string_filtered():
    """Empty/whitespace-only strings are filtered during deduplication."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])

    async with backend.database.async_session_factory() as db:
        mappings = await preview_import_mappings(db, hh_id, ["Food", "", "   ", "Food"])

    # Should only have 1 mapping for "Food" — empty strings filtered
    assert len(mappings) == 1
    assert mappings[0]["original_name"] == "Food"
    assert mappings[0]["match_type"] == "exact"


# ---------------------------------------------------------------------------
# AC: auto_create_category() — colour cycling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_create_category_colour_cycling():
    """Create 15 categories, verify colours cycle through 14-colour array."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    async with backend.database.async_session_factory() as db:
        colors = []
        for i in range(15):
            cat = await auto_create_category(
                db, f"Auto Cat {i}", hh_id, owner_id
            )
            colors.append(cat.color)

        # First 14 should match ENTITY_ACCENT_COLORS in order
        for i in range(14):
            assert colors[i] == ENTITY_ACCENT_COLORS[i], f"Index {i}: expected {ENTITY_ACCENT_COLORS[i]}, got {colors[i]}"

        # 15th (index 14) should wrap to index 0
        assert colors[14] == ENTITY_ACCENT_COLORS[0]


@pytest.mark.asyncio
async def test_auto_create_category_idempotency():
    """Call twice with same name → returns existing, no duplicate."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    async with backend.database.async_session_factory() as db:
        cat1 = await auto_create_category(db, "Unique Name", hh_id, owner_id)
        cat2 = await auto_create_category(db, "unique name", hh_id, owner_id)

    assert cat1.id == cat2.id


@pytest.mark.asyncio
async def test_auto_create_category_defaults():
    """Verify default values: expense type, no icon, top-level."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    async with backend.database.async_session_factory() as db:
        cat = await auto_create_category(db, "New Category", hh_id, owner_id)

    assert cat.category_type == "expense"
    assert cat.icon is None
    assert cat.parent_id is None
    assert cat.depth == 0


# ---------------------------------------------------------------------------
# AC: Route endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_preview_route_success():
    """POST /api/categories/import/preview returns correct mappings."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food & Drink", "color": "#ef4444", "category_type": "expense", "depth": 0},
        {"name": "Shopping", "color": "#3b82f6", "category_type": "expense", "depth": 0},
    ])

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/import/preview",
            json={"category_values": ["Food & Drink", "  Shopping  ", "Pet Supplies"]},
            headers={"X-CSRF-Token": csrf},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["mappings"]) == 3
    assert data["mappings"][0]["match_type"] == "exact"
    assert data["mappings"][1]["match_type"] == "trimmed"
    assert data["mappings"][2]["match_type"] == "unmapped"


@pytest.mark.asyncio
async def test_import_preview_route_empty_category_values():
    """Empty category_values returns 422."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/import/preview",
            json={"category_values": []},
            headers={"X-CSRF-Token": csrf},
        )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_import_preview_route_too_many_values():
    """> 500 category_values returns 422."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/import/preview",
            json={"category_values": [f"Cat {i}" for i in range(501)]},
            headers={"X-CSRF-Token": csrf},
        )

    assert resp.status_code == 422
