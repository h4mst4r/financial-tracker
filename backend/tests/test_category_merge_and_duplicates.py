"""Integration tests for category duplicate detection and merge.

Tests the full stack: routes → service → database for:
- GET /api/categories/duplicates  (duplicate detection)
- POST /api/categories/merge      (category merge)

Uses the same test DB pattern as test_category_routes.py (temp-file SQLite).
"""

import os
import secrets
import tempfile
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
from backend.models.household import Household
from backend.models.person import Person, Session as SessionModel


@pytest.fixture(autouse=True)
def _reset_auth_bypass():
    """Ensure AUTH_BYPASS_ENABLED is False for these tests."""
    backend.config.settings.AUTH_BYPASS_ENABLED = False
    yield
    backend.config.settings.AUTH_BYPASS_ENABLED = False


@pytest_asyncio.fixture(autouse=True)
async def _use_test_db():
    """Swap in a fresh temp SQLite for every test run."""
    import backend.config as _cfg
    import backend.database as _bdb

    original_url = _cfg.settings.DATABASE_URL
    original_engine = _bdb.engine
    original_factory = _bdb.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="merge_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    _cfg.settings.DATABASE_URL = test_url

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

    import backend.models  # noqa: F401 — registers all models
    from backend.database import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    _cfg.settings.DATABASE_URL = original_url
    _bdb.engine = original_engine
    _bdb.async_session_factory = original_factory

    try:
        os.close(tmp_fd)
        os.unlink(tmp_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_household_and_owner():
    """Create a household, owner person, and session."""
    from datetime import timedelta

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
            google_sub="test_" + owner_id.hex,
            email="test@example.com",
            display_name="Test User",
            role="owner",
            display_currency="SGD",
            default_view="household",
            created_by=owner_id,
        )
        session = SessionModel(
            person_id=owner_id,
            expires_at=now + timedelta(hours=24),
            last_activity_at=now,
            csrf_token=csrf,
        )
        db.add_all([hh, owner, session])
        await db.flush()
        session_id = session.id
        await db.commit()

    return household_id, owner_id, session_id, csrf


def _get_client(session_id, csrf_token):
    """Create authenticated httpx client (returns context manager)."""
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    client.cookies.set("session_id", str(session_id))
    return client


async def _create_categories(household_id, owner_id, categories):
    """Create categories directly in DB. Returns list of category IDs."""
    from backend.models.category import Category

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


# ---------------------------------------------------------------------------
# Duplicate Detection Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_duplicates_when_single_category():
    """Single category should return empty groups."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [{"name": "Food", "color": "#6366f1", "icon": "🏠"}])

    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["groups"] == []


@pytest.mark.asyncio
async def test_no_duplicates_when_all_unique():
    """Categories with very different names should not match."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food and Dining", "color": "#6366f1", "icon": "🍔"},
        {"name": "Transportation", "color": "#6366f1", "icon": "🚗"},
        {"name": "Entertainment", "color": "#6366f1", "icon": "🎬"},
    ])

    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["groups"] == []


@pytest.mark.asyncio
async def test_exact_match_detection():
    """Exact name matches (case-insensitive) should be grouped."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "food", "color": "#6366f1", "icon": "🍔"},
    ])
    cat1, cat2 = cat_ids

    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["groups"]) == 1

    group = data["groups"][0]
    assert group["match_type"] == "exact"
    assert group["match_score"] == 1.0
    assert len(group["categories"]) == 2
    cat_ids_in_group = {c["id"] for c in group["categories"]}
    assert str(cat1) in cat_ids_in_group
    assert str(cat2) in cat_ids_in_group


@pytest.mark.asyncio
async def test_fuzzy_match_detection():
    """Similar names (ratio >= 0.85) should be grouped."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Foods", "color": "#6366f1", "icon": "🍔"},
    ])

    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["groups"]) == 1

    group = data["groups"][0]
    assert group["match_type"] == "fuzzy"
    assert group["match_score"] >= 0.85


@pytest.mark.asyncio
async def test_multiple_duplicate_groups():
    """Multiple independent duplicate groups should be returned."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Transport", "color": "#6366f1", "icon": "🚗"},
        {"name": "transport", "color": "#6366f1", "icon": "🚗"},
    ])

    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["groups"]) == 2


@pytest.mark.asyncio
async def test_archived_categories_excluded():
    """Archived categories should not appear in duplicate detection."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "food", "color": "#6366f1", "icon": "🍔"},
    ])
    cat2 = cat_ids[1]

    # Archive cat2
    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            f"/api/categories/{cat2}/archive",
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200

    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["groups"] == []


@pytest.mark.asyncio
async def test_child_categories_excluded():
    """Only top-level categories (depth=0) should be checked."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [{"name": "Food", "color": "#6366f1", "icon": "🍔"}])
    parent = parent_ids[0]
    await _create_categories(hh_id, owner_id, [{"name": "food", "color": "#6366f1", "icon": "🍔", "parent_id": parent, "depth": 1}])

    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/duplicates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["groups"] == []


# ---------------------------------------------------------------------------
# Merge Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_merge_two_categories():
    """Basic merge of two categories."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={"target_id": str(target), "source_ids": [str(source)]},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["target_id"] == str(target)
    assert len(data["source_categories"]) == 1
    assert data["source_categories"][0]["id"] == str(source)


@pytest.mark.asyncio
async def test_merge_multiple_sources():
    """Merge multiple sources into one target."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
        {"name": "Restaurants", "color": "#6366f1", "icon": "🍽️"},
    ])
    target, source1, source2 = cat_ids

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={
                "target_id": str(target),
                "source_ids": [str(source1), str(source2)],
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert len(data["source_categories"]) == 2


@pytest.mark.asyncio
async def test_merge_archives_sources():
    """Source categories should be archived after merge."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids

    async with _get_client(session_id, csrf) as client:
        await client.post(
            "/api/categories/merge",
            json={"target_id": str(target), "source_ids": [str(source)]},
            headers={"X-CSRF-Token": csrf},
        )

        # Source should not be in normal list
        resp = await client.get("/api/categories")
        items = resp.json()["items"]
        source_ids = [c["id"] for c in items]
        assert str(source) not in source_ids


@pytest.mark.asyncio
async def test_merge_target_not_found_returns_404():
    """Target ID that doesn't exist should return 404."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [{"name": "Food", "color": "#6366f1", "icon": "🍔"}])
    source = cat_ids[0]

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={
                "target_id": str(uuid4()),  # Non-existent
                "source_ids": [str(source)],
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_merge_source_not_found_returns_404():
    """Source ID that doesn't exist should return 404."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [{"name": "Food", "color": "#6366f1", "icon": "🍔"}])
    target = cat_ids[0]

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={
                "target_id": str(target),
                "source_ids": [str(uuid4())],  # Non-existent
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_merge_target_must_be_top_level():
    """Target category must be depth=0."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [{"name": "Parent", "color": "#6366f1", "icon": "📁"}])
    parent = parent_ids[0]
    child_ids = await _create_categories(hh_id, owner_id, [{"name": "Child", "color": "#6366f1", "icon": "📄", "parent_id": parent, "depth": 1}])
    child = child_ids[0]
    source_ids = await _create_categories(hh_id, owner_id, [{"name": "Source", "color": "#6366f1", "icon": "📄"}])
    source = source_ids[0]

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={
                "target_id": str(child),
                "source_ids": [str(source)],
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_merge_source_must_be_top_level():
    """Source categories must be depth=0."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    target_ids = await _create_categories(hh_id, owner_id, [{"name": "Food", "color": "#6366f1", "icon": "🍔"}])
    target = target_ids[0]
    parent_ids = await _create_categories(hh_id, owner_id, [{"name": "Parent", "color": "#6366f1", "icon": "📁"}])
    parent = parent_ids[0]
    child_ids = await _create_categories(hh_id, owner_id, [{"name": "Child", "color": "#6366f1", "icon": "📄", "parent_id": parent, "depth": 1}])
    child = child_ids[0]

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={
                "target_id": str(target),
                "source_ids": [str(child)],
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_merge_subcategories_reassigned():
    """Subcategories of source should be reassigned to target."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids
    child_ids = await _create_categories(hh_id, owner_id, [{"name": "Produce", "color": "#6366f1", "icon": "🥬", "parent_id": source, "depth": 1}])
    child = child_ids[0]

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={"target_id": str(target), "source_ids": [str(source)]},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_subcategories_reassigned"] == 1

        # Verify child is now under target (check flat list)
        resp = await client.get("/api/categories")
        assert resp.status_code == 200
        items = resp.json()["items"]
        child_data = next(c for c in items if c["id"] == str(child))
        assert child_data["parent_id"] == str(target)


@pytest.mark.asyncio
async def test_merge_subcategory_name_clash_resolved():
    """If target already has a child with the same name, append (2)."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids

    # Both have a "Produce" child
    await _create_categories(hh_id, owner_id, [{"name": "Produce", "color": "#6366f1", "icon": "🥬", "parent_id": target, "depth": 1}])
    child_source_ids = await _create_categories(hh_id, owner_id, [{"name": "Produce", "color": "#6366f1", "icon": "🥬", "parent_id": source, "depth": 1}])
    child_source = child_source_ids[0]

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={"target_id": str(target), "source_ids": [str(source)]},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200

        # Verify source's "Produce" was renamed to "Produce (2)" (check flat list)
        resp = await client.get("/api/categories")
        assert resp.status_code == 200
        items = resp.json()["items"]
        child_data = next(c for c in items if c["id"] == str(child_source))
        assert child_data["name"] == "Produce (2)"


@pytest.mark.asyncio
async def test_merge_validation_target_not_in_sources():
    """Schema should prevent target_id being in source_ids."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={
                "target_id": str(target),
                "source_ids": [str(target), str(source)],
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_merge_validation_no_duplicate_sources():
    """Schema should prevent duplicate source_ids."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={
                "target_id": str(target),
                "source_ids": [str(source), str(source)],
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_merge_response_message():
    """Response should have a human-readable success message."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids

    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories/merge",
            json={"target_id": str(target), "source_ids": [str(source)]},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "Food" in data["message"]


@pytest.mark.asyncio
async def test_merge_removes_source_from_duplicates():
    """After merge, archived source should no longer appear in duplicate groups."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "food", "color": "#6366f1", "icon": "🍔"},
    ])
    target, source = cat_ids

    async with _get_client(session_id, csrf) as client:
        # Before merge: exact duplicate group exists
        resp = await client.get("/api/categories/duplicates")
        assert resp.status_code == 200
        assert len(resp.json()["groups"]) == 1

        # Merge source into target
        resp = await client.post(
            "/api/categories/merge",
            json={"target_id": str(target), "source_ids": [str(source)]},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200

        # After merge: no duplicates (source is archived, excluded from detection)
        resp = await client.get("/api/categories/duplicates")
        assert resp.status_code == 200
        data = resp.json()
        assert data["groups"] == []


@pytest.mark.asyncio
async def test_merge_reassigns_archived_subcategories():
    """Archived children of a source category should also be reassigned (not orphaned)."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#6366f1", "icon": "🍔"},
        {"name": "Groceries", "color": "#6366f1", "icon": "🛒"},
    ])
    target, source = cat_ids

    # Create an archived child under source
    archived_child_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Old Produce", "color": "#6366f1", "icon": "🥬",
         "parent_id": source, "depth": 1},
    ])
    archived_child = archived_child_ids[0]

    # Archive the child
    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            f"/api/categories/{archived_child}/archive",
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200

        # Merge source into target
        resp = await client.post(
            "/api/categories/merge",
            json={"target_id": str(target), "source_ids": [str(source)]},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200

        # Verify archived child was reassigned to target (check with include_archived)
        resp = await client.get("/api/categories?include_archived=true")
        assert resp.status_code == 200
        items = resp.json()["items"]
        child_data = next(c for c in items if c["id"] == str(archived_child))
        assert child_data["parent_id"] == str(target)
