"""Integration tests for CAT-002 — Category routes and hierarchy endpoints.

Covers all ACs:
    AC-1: GET /api/categories (flat list with filters)
    AC-2: GET /api/categories/tree (nested tree)
    AC-3: POST /api/categories (create)
    AC-4: PATCH /api/categories/{id} (update)
    AC-5: POST /api/categories/{id}/archive (soft-delete + promote children)
    AC-6: POST /api/categories/{id}/restore (restore archived)
    AC-7: DELETE /api/categories/{id} (hard delete)
    AC-8: GET /api/categories/{id}/spending-summary (stub)
    AC-9: PATCH /api/categories/{id}/reassign-children (bulk re-parent)

Test isolation: uses a fresh temp-file SQLite per test run (autouse fixture),
following the same pattern as test_household_api.py.
"""

import os
import secrets
import tempfile
from datetime import timedelta, date
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import backend.config
import backend.database  # module-level — helpers and tests use this directly
from backend.main import app
from backend.models.base import utcnow
from backend.models.category import Category
from backend.models.currency import Currency
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as SessionModel


@pytest.fixture(autouse=True)
def _reset_auth_bypass():
    """Ensure AUTH_BYPASS_ENABLED is False for these tests."""
    backend.config.settings.AUTH_BYPASS_ENABLED = False
    yield
    backend.config.settings.AUTH_BYPASS_ENABLED = False


# ---------------------------------------------------------------------------
# Test DB fixture — mirrors test_household_api.py
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _use_test_db():
    """Swap in a fresh temp SQLite for every test run."""
    import backend.config
    import backend.database as _bdb

    original_url = backend.config.settings.DATABASE_URL
    original_engine = _bdb.engine
    original_factory = _bdb.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="cat_test_")
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

    import backend.models  # noqa: F401 — registers all models with Base.metadata
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
    """Create a household, owner person, and session."""
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
    """Create categories directly in DB. Returns list of category IDs.
    
    Note: cat.id is only available after flush() (UUID default generates on flush).
    And after commit(), ORM instances expire. So capture IDs between flush and commit.
    """
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
    """Create authenticated httpx client (returns context manager)."""
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    client.cookies.set("session_id", str(session_id))
    return client


# ---------------------------------------------------------------------------
# AC-1: GET /api/categories — flat list with filters
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_categories_returns_empty():
    """Empty household returns empty list."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_categories_returns_items():
    """Created categories appear in list."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
        {"name": "Income", "color": "#84cc16", "category_type": "income", "depth": 0},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    # Sorted alphabetically
    assert data["items"][0]["name"] == "Food"
    assert data["items"][1]["name"] == "Income"


@pytest.mark.asyncio
async def test_list_categories_filter_top_level():
    """?top_level=true filters to parent categories only."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories?top_level=true", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Food"


@pytest.mark.asyncio
async def test_list_categories_filter_parent_id():
    """?parent_id=UUID filters to children of specific parent."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
        {"name": "Restaurants", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get(f"/api/categories?parent_id={parent_ids[0]}", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert all(item["parent_name"] == "Food" for item in data["items"])


@pytest.mark.asyncio
async def test_list_categories_excludes_archived():
    """Archived categories are excluded by default."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Active", "color": "#ef4444", "category_type": "expense", "depth": 0},
        {"name": "Archived", "color": "#ef4444", "category_type": "expense", "depth": 0, "archived": True},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Active"


@pytest.mark.asyncio
async def test_list_categories_include_archived():
    """?include_archived=true includes archived categories."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    await _create_categories(hh_id, owner_id, [
        {"name": "Active", "color": "#ef4444", "category_type": "expense", "depth": 0},
        {"name": "Archived", "color": "#ef4444", "category_type": "expense", "depth": 0, "archived": True},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories?include_archived=true", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2


@pytest.mark.asyncio
async def test_list_categories_has_children_count():
    """Each item includes children_count."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
        {"name": "Income", "color": "#84cc16", "category_type": "income", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
        {"name": "Restaurants", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    food = next(i for i in data["items"] if i["name"] == "Food")
    income = next(i for i in data["items"] if i["name"] == "Income")
    assert food["children_count"] == 2
    assert income["children_count"] == 0


# ---------------------------------------------------------------------------
# AC-2: GET /api/categories/tree — nested tree
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tree_returns_nested_structure():
    """Tree endpoint returns parent with children array."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
        {"name": "Restaurants", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/tree", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Food"
    assert len(data[0]["children"]) == 2
    child_names = [c["name"] for c in data[0]["children"]]
    assert "Groceries" in child_names
    assert "Restaurants" in child_names


@pytest.mark.asyncio
async def test_tree_excludes_archived():
    """Archived categories excluded from tree by default."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
        {"name": "Archived Child", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1, "archived": True},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get("/api/categories/tree", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert len(data[0]["children"]) == 1
    assert data[0]["children"][0]["name"] == "Groceries"


# ---------------------------------------------------------------------------
# AC-3: POST /api/categories — create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_category_returns_201():
    """Creating a category returns 201 with CategoryResponse."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories",
            json={"name": "Food", "color": "#ef4444", "icon": "🍕", "category_type": "expense"},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Food"
    assert data["color"] == "#ef4444"
    assert data["category_type"] == "expense"
    assert data["depth"] == 0


@pytest.mark.asyncio
async def test_create_category_with_parent():
    """Creating a child category sets depth=1."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            "/api/categories",
            json={"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": str(parent_ids[0])},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Groceries"
    assert data["depth"] == 1
    assert data["parent_id"] == str(parent_ids[0])


@pytest.mark.asyncio
async def test_create_duplicate_name_returns_409():
    """Creating a category with duplicate name (case-insensitive) returns 409."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    async with _get_client(session_id, csrf) as client:
        await client.post(
            "/api/categories",
            json={"name": "Food", "color": "#ef4444", "category_type": "expense"},
            headers={"X-CSRF-Token": csrf},
        )
        resp = await client.post(
            "/api/categories",
            json={"name": "food", "color": "#84cc16", "category_type": "expense"},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# AC-4: PATCH /api/categories/{id} — update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_category():
    """Updating a category returns updated CategoryResponse."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.patch(
            f"/api/categories/{cat_ids[0]}",
            json={"name": "Food & Drink"},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Food & Drink"


# ---------------------------------------------------------------------------
# AC-5: POST /api/categories/{id}/archive — archive + promote children
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_archive_category_promotes_children():
    """Archiving a parent promotes children to top-level."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
        {"name": "Restaurants", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            f"/api/categories/{parent_ids[0]}/archive",
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["promoted_children"] == 2
    assert data["archived"]["name"] == "Food"


# ---------------------------------------------------------------------------
# AC-6: POST /api/categories/{id}/restore — restore archived
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_restore_category():
    """Restoring an archived category returns 200."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0, "archived": True},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.post(
            f"/api/categories/{cat_ids[0]}/restore",
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Food"
    assert data["archived"] is False


# ---------------------------------------------------------------------------
# AC-7: DELETE /api/categories/{id} — hard delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_category_no_deps_returns_204():
    """Hard deleting a category with no dependencies returns 204."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.delete(
            f"/api/categories/{cat_ids[0]}",
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_category_with_children_returns_409():
    """Hard deleting a category with children returns 409."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.delete(
            f"/api/categories/{parent_ids[0]}",
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# AC-8: GET /api/categories/{id}/spending-summary — stub
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_spending_summary_stub():
    """Spending summary returns stub response."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    cat_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.get(
            f"/api/categories/{cat_ids[0]}/spending-summary?from=2024-01-01&to=2024-12-31",
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["from"] == "2024-01-01"
    assert data["to"] == "2024-12-31"


@pytest.mark.asyncio
async def test_spending_summary_not_found():
    """Spending summary for non-existent category returns 404."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    async with _get_client(session_id, csrf) as client:
        resp = await client.get(
            f"/api/categories/{uuid4()}/spending-summary?from=2024-01-01&to=2024-12-31",
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# AC-9: PATCH /api/categories/{id}/reassign-children — bulk re-parent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reassign_children_to_new_parent():
    """Reassigning children to a new parent works."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
        {"name": "Shopping", "color": "#6366f1", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.patch(
            f"/api/categories/{parent_ids[0]}/reassign-children",
            json={"new_parent_id": str(parent_ids[1])},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["reassigned"] == 1


@pytest.mark.asyncio
async def test_reassign_children_promote_to_top_level():
    """Reassigning children with null promotes to top-level."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()
    parent_ids = await _create_categories(hh_id, owner_id, [
        {"name": "Food", "color": "#ef4444", "category_type": "expense", "depth": 0},
    ])
    await _create_categories(hh_id, owner_id, [
        {"name": "Groceries", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
        {"name": "Restaurants", "color": "#ef4444", "category_type": "expense", "parent_id": parent_ids[0], "depth": 1},
    ])
    async with _get_client(session_id, csrf) as client:
        resp = await client.patch(
            f"/api/categories/{parent_ids[0]}/reassign-children",
            json={"new_parent_id": None},
            headers={"X-CSRF-Token": csrf},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["reassigned"] == 2


# ---------------------------------------------------------------------------
# CRUD Flow Test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_crud_flow_create_update_archive_restore():
    """Full lifecycle: create → update → archive → restore."""
    hh_id, owner_id, session_id, csrf = await _create_household_and_owner()

    async with _get_client(session_id, csrf) as client:
        # Create
        resp = await client.post(
            "/api/categories",
            json={"name": "Food", "color": "#ef4444", "category_type": "expense"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 201
        cat_id = resp.json()["id"]

        # Update
        resp = await client.patch(
            f"/api/categories/{cat_id}",
            json={"name": "Food & Drink"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Food & Drink"

        # Archive
        resp = await client.post(
            f"/api/categories/{cat_id}/archive",
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200

        # Verify excluded from default list
        resp = await client.get("/api/categories", headers={"X-CSRF-Token": csrf})
        assert resp.json()["total"] == 0

        # Verify included with include_archived
        resp = await client.get("/api/categories?include_archived=true", headers={"X-CSRF-Token": csrf})
        assert resp.json()["total"] == 1

        # Restore
        resp = await client.post(
            f"/api/categories/{cat_id}/restore",
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200

        # Verify back in default list
        resp = await client.get("/api/categories", headers={"X-CSRF-Token": csrf})
        assert resp.json()["total"] == 1
