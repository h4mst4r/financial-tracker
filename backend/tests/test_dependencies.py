"""Test get_or_404 and DI dependencies (AC: 4).

get_or_404 returns in-scope entity and raises 404 for missing + cross-household ids.
"""

from uuid import uuid4

import pytest
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.dependencies import get_or_404


class _Base(DeclarativeBase):
    pass


class _TestEntity(_Base):
    __tablename__ = "test_entities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    household_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)


async def test_get_or_404_returns_in_scope_entity(temp_db):
    """get_or_404 returns entity when id matches and household_id matches."""
    _, factory = await temp_db(_Base.metadata)
    hh_id, entity_id = str(uuid4()), str(uuid4())

    async with factory() as session:
        session.add(_TestEntity(id=entity_id, household_id=hh_id, name="Test"))
        await session.commit()

    async with factory() as session:
        result = await get_or_404(session, _TestEntity, entity_id, household_id=hh_id)
        assert result.id == entity_id
        assert result.household_id == hh_id


async def test_get_or_404_raises_404_for_missing_id(temp_db):
    """get_or_404 raises 404 when entity doesn't exist."""
    _, factory = await temp_db(_Base.metadata)
    async with factory() as session:
        with pytest.raises(Exception) as exc_info:
            await get_or_404(session, _TestEntity, str(uuid4()), household_id=str(uuid4()))
        assert exc_info.value.status_code == 404


async def test_get_or_404_raises_404_for_cross_household(temp_db):
    """get_or_404 raises 404 when entity belongs to another household."""
    _, factory = await temp_db(_Base.metadata)
    hh_a, hh_b, entity_id = str(uuid4()), str(uuid4()), str(uuid4())

    async with factory() as session:
        session.add(_TestEntity(id=entity_id, household_id=hh_a, name="Test"))
        await session.commit()

    async with factory() as session:
        with pytest.raises(Exception) as exc_info:
            await get_or_404(session, _TestEntity, entity_id, household_id=hh_b)
        assert exc_info.value.status_code == 404
