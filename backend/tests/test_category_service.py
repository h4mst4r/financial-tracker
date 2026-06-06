"""Tests for category service CRUD and seeding operations.

Validates:
    - seed_default_categories idempotency (12 categories, case-insensitive skip)
    - create_category name uniqueness (case-insensitive)
    - create_category hierarchy validation (parent exists, max depth)
    - update_category partial updates with re-validation
    - archive_category auto-promotes children
    - delete_category blocks on downstream references
    - restore_category unarchives properly
"""

from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select

import backend.database
from backend.models.category import Category
from backend.schemas.category import CategoryCreate, CategoryUpdate
from backend.services.category_service import (
    archive_category,
    create_category,
    delete_category,
    restore_category,
    seed_default_categories,
    update_category,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session():
    """In-memory async session for category tests."""
    import tempfile
    import backend.config
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="cat_test_")
    test_url = f"sqlite+aiosqlite:///{tmp_path}"
    backend.config.settings.DATABASE_URL = test_url

    engine = create_async_engine(
        test_url,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    backend.database.engine = engine
    backend.database.async_session_factory = async_sessionmaker(engine, class_=AsyncSession)

    from backend.database import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with backend.database.async_session_factory() as session:
        yield session

    # Restore
    backend.config.settings.DATABASE_URL = original_url
    backend.database.engine = original_engine
    backend.database.async_session_factory = original_factory


@pytest_asyncio.fixture
async def household_id(db_session):
    """Create a Household (FK constraint on household_id)."""
    from backend.models.household import Household
    
    holder_id = uuid4()
    household = Household(name="Test Household", created_by=holder_id)
    db_session.add(household)
    await db_session.flush()
    return household.id


@pytest_asyncio.fixture
async def actor_id(db_session, household_id):
    """Create a Person for actor_id (FK constraint on created_by)."""
    from backend.models.person import Person
    
    person = Person(
        household_id=household_id,
        email="test@example.com",
        display_name="Test User",
        google_sub="test-google-sub",
        role="admin",
    )
    db_session.add(person)
    await db_session.flush()
    return person.id


# ---------------------------------------------------------------------------
# Seed tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_seed_default_categories_creates_12(db_session, household_id, actor_id):
    """Seeding creates exactly 12 default categories."""
    await seed_default_categories(db_session, household_id, actor_id)
    await db_session.flush()

    result = await db_session.execute(
        select(Category).where(
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    categories = result.scalars().all()

    assert len(categories) == 12


@pytest.mark.asyncio
async def test_seed_default_categories_idempotent(db_session, household_id, actor_id):
    """Running seed twice does not duplicate categories."""
    await seed_default_categories(db_session, household_id, actor_id)
    await seed_default_categories(db_session, household_id, actor_id)
    await db_session.flush()

    result = await db_session.execute(
        select(Category).where(
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    categories = result.scalars().all()

    assert len(categories) == 12


@pytest.mark.asyncio
async def test_seed_default_categories_skips_existing(db_session, household_id, actor_id):
    """Seeding skips if all 12 categories already exist (case-insensitive)."""
    # Pre-create a category with the same name but different case
    existing = Category(
        household_id=household_id,
        name="food & drink",  # lowercase
        category_type="expense",
        color="#ef4444",
        depth=0,
        created_by=actor_id,
    )
    db_session.add(existing)
    await db_session.flush()

    await seed_default_categories(db_session, household_id, actor_id)
    await db_session.flush()

    # Should have 12 (existing + 11 new), not 13
    result = await db_session.execute(
        select(Category).where(
            Category.household_id == household_id,
            Category.archived == False,
        )
    )
    categories = result.scalars().all()

    assert len(categories) == 12


# ---------------------------------------------------------------------------
# Create tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_category_success(db_session, household_id, actor_id):
    """Creating a category works with valid data."""
    data = CategoryCreate(
        name="Test Category",
        color="#ff0000",
        icon="🧪",
        category_type="expense",
    )

    category = await create_category(db_session, household_id, actor_id, data)
    await db_session.flush()

    assert category.name == "Test Category"
    assert category.color == "#ff0000"
    assert category.icon == "🧪"
    assert category.category_type == "expense"
    assert category.depth == 0
    assert category.parent_id is None


@pytest.mark.asyncio
async def test_create_category_duplicate_name_conflict(db_session, household_id, actor_id):
    """Creating a category with a duplicate name (case-insensitive) raises 409."""
    data1 = CategoryCreate(name="Test", color="#ff0000", icon="🧪", category_type="expense")
    await create_category(db_session, household_id, actor_id, data1)
    await db_session.flush()

    data2 = CategoryCreate(name="test", color="#00ff00", icon="🧪", category_type="expense")

    with pytest.raises(HTTPException) as exc:
        await create_category(db_session, household_id, actor_id, data2)

    assert exc.value.status_code == 409
    assert exc.value.detail.get("error") == "DUPLICATE_NAME"


@pytest.mark.asyncio
async def test_create_category_with_parent(db_session, household_id, actor_id):
    """Creating a child category sets depth=1."""
    parent_data = CategoryCreate(name="Parent", color="#ff0000", icon="📁", category_type="expense")
    parent = await create_category(db_session, household_id, actor_id, parent_data)
    await db_session.flush()

    child_data = CategoryCreate(
        name="Child",
        color="#00ff00",
        icon="📄",
        category_type="expense",
        parent_id=parent.id,
    )
    child = await create_category(db_session, household_id, actor_id, child_data)
    await db_session.flush()

    assert child.depth == 1
    assert child.parent_id == parent.id


@pytest.mark.asyncio
async def test_create_category_parent_not_found(db_session, household_id, actor_id):
    """Creating with a non-existent parent raises 404."""
    data = CategoryCreate(
        name="Child",
        color="#00ff00",
        icon="📄",
        category_type="expense",
        parent_id=uuid4(),  # non-existent
    )

    with pytest.raises(HTTPException) as exc:
        await create_category(db_session, household_id, actor_id, data)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_create_category_max_depth_exceeded(db_session, household_id, actor_id):
    """Creating a child of a child (depth=2) raises 400."""
    parent_data = CategoryCreate(name="Parent", color="#ff0000", icon="📁", category_type="expense")
    parent = await create_category(db_session, household_id, actor_id, parent_data)
    await db_session.flush()

    child_data = CategoryCreate(name="Child", color="#00ff00", icon="📄", category_type="expense", parent_id=parent.id)
    child = await create_category(db_session, household_id, actor_id, child_data)
    await db_session.flush()

    grandchild_data = CategoryCreate(
        name="Grandchild",
        color="#0000ff",
        icon="📄",
        category_type="expense",
        parent_id=child.id,
    )

    with pytest.raises(HTTPException) as exc:
        await create_category(db_session, household_id, actor_id, grandchild_data)

    assert exc.value.status_code == 400
    assert exc.value.detail.get("error") == "MAX_DEPTH_EXCEEDED"


# ---------------------------------------------------------------------------
# Update tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_category_partial(db_session, household_id, actor_id):
    """Updating only name leaves other fields unchanged."""
    data = CategoryCreate(name="Original", color="#ff0000", icon="🧪", category_type="expense")
    category = await create_category(db_session, household_id, actor_id, data)
    await db_session.flush()

    original_color = category.color

    update_data = CategoryUpdate(name="Updated Name")
    updated = await update_category(db_session, household_id, actor_id, category.id, update_data)

    assert updated.name == "Updated Name"
    assert updated.color == original_color  # unchanged


@pytest.mark.asyncio
async def test_update_category_name_uniqueness(db_session, household_id, actor_id):
    """Updating name to an existing name raises 409."""
    data1 = CategoryCreate(name="Cat A", color="#ff0000", icon="🧪", category_type="expense")
    cat_a = await create_category(db_session, household_id, actor_id, data1)
    await db_session.flush()

    data2 = CategoryCreate(name="Cat B", color="#00ff00", icon="🧪", category_type="expense")
    cat_b = await create_category(db_session, household_id, actor_id, data2)
    await db_session.flush()

    update_data = CategoryUpdate(name="cat a")  # case-insensitive duplicate

    with pytest.raises(HTTPException) as exc:
        await update_category(db_session, household_id, actor_id, cat_b.id, update_data)

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_update_category_change_parent(db_session, household_id, actor_id):
    """Changing parent recalculates depth."""
    parent_data = CategoryCreate(name="Parent", color="#ff0000", icon="📁", category_type="expense")
    parent = await create_category(db_session, household_id, actor_id, parent_data)
    await db_session.flush()

    child_data = CategoryCreate(name="Child", color="#00ff00", icon="📄", category_type="expense")
    child = await create_category(db_session, household_id, actor_id, child_data)
    await db_session.flush()

    assert child.depth == 0

    update_data = CategoryUpdate(parent_id=parent.id)
    updated = await update_category(db_session, household_id, actor_id, child.id, update_data)

    assert updated.depth == 1
    assert updated.parent_id == parent.id


@pytest.mark.asyncio
async def test_update_category_self_parent_raises(db_session, household_id, actor_id):
    """Setting parent_id to self raises 400."""
    data = CategoryCreate(name="Selfish", color="#ff0000", icon="🧪", category_type="expense")
    category = await create_category(db_session, household_id, actor_id, data)
    await db_session.flush()

    update_data = CategoryUpdate(parent_id=category.id)

    with pytest.raises(HTTPException) as exc:
        await update_category(db_session, household_id, actor_id, category.id, update_data)

    assert exc.value.status_code == 400
    assert exc.value.detail.get("error") == "SELF_PARENT"


# ---------------------------------------------------------------------------
# Archive tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_archive_category_promotes_children(db_session, household_id, actor_id):
    """Archiving a parent promotes children to top-level."""
    parent_data = CategoryCreate(name="Parent", color="#ff0000", icon="📁", category_type="expense")
    parent = await create_category(db_session, household_id, actor_id, parent_data)
    await db_session.flush()

    child_data = CategoryCreate(
        name="Child",
        color="#00ff00",
        icon="📄",
        category_type="expense",
        parent_id=parent.id,
    )
    child = await create_category(db_session, household_id, actor_id, child_data)
    await db_session.flush()

    result = await archive_category(db_session, household_id, actor_id, parent.id)
    await db_session.flush()

    assert result["promoted_children"] == 1
    assert parent.archived is True

    # Reload child
    child_result = await db_session.execute(
        select(Category).where(Category.id == child.id)
    )
    reloaded_child = child_result.scalar_one()

    assert reloaded_child.parent_id is None
    assert reloaded_child.depth == 0
    assert reloaded_child.archived is False


# ---------------------------------------------------------------------------
# Delete tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_category_not_found(db_session, household_id, actor_id):
    """Deleting a non-existent category raises 404."""
    with pytest.raises(HTTPException) as exc:
        await delete_category(db_session, household_id, actor_id, uuid4())

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_category_success_no_dependencies(db_session, household_id, actor_id):
    """Deleting a category with no dependencies succeeds."""
    data = CategoryCreate(name="ToDelete", color="#ff0000", icon="🧪", category_type="expense")
    category = await create_category(db_session, household_id, actor_id, data)
    await db_session.flush()

    await delete_category(db_session, household_id, actor_id, category.id)
    await db_session.flush()

    result = await db_session.execute(
        select(Category).where(Category.id == category.id)
    )
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_category_blocked_by_children(db_session, household_id, actor_id):
    """Deleting a category with children raises 409."""
    parent_data = CategoryCreate(name="Parent", color="#ff0000", icon="📁", category_type="expense")
    parent = await create_category(db_session, household_id, actor_id, parent_data)
    await db_session.flush()

    child_data = CategoryCreate(
        name="Child", color="#00ff00", icon="📄", category_type="expense", parent_id=parent.id
    )
    await create_category(db_session, household_id, actor_id, child_data)
    await db_session.flush()

    with pytest.raises(HTTPException) as exc:
        await delete_category(db_session, household_id, actor_id, parent.id)

    assert exc.value.status_code == 409
    assert exc.value.detail.get("error") == "HAS_DEPENDENCIES"


# ---------------------------------------------------------------------------
# Restore tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_restore_category(db_session, household_id, actor_id):
    """Restoring an archived category unarchives it."""
    data = CategoryCreate(name="Restorable", color="#ff0000", icon="🧪", category_type="expense")
    category = await create_category(db_session, household_id, actor_id, data)
    await db_session.flush()

    await archive_category(db_session, household_id, actor_id, category.id)
    await db_session.flush()

    restored = await restore_category(db_session, household_id, actor_id, category.id)
    await db_session.flush()

    assert restored.archived is False
    assert restored.archived_at is None


@pytest.mark.asyncio
async def test_restore_non_archived_category_raises(db_session, household_id, actor_id):
    """Restoring an active category raises 400."""
    data = CategoryCreate(name="Active", color="#ff0000", icon="🧪", category_type="expense")
    category = await create_category(db_session, household_id, actor_id, data)
    await db_session.flush()

    with pytest.raises(HTTPException) as exc:
        await restore_category(db_session, household_id, actor_id, category.id)

    assert exc.value.status_code == 400
    assert exc.value.detail.get("error") == "NOT_ARCHIVED"
