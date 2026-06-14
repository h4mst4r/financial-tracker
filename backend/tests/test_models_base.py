"""Column-contract + UUID-default verification for the shared ORM base layer (ARCH §3.1/§3.2).

Concrete `_Probe` / `_MoneyProbe` subclasses give real mapped tables to introspect; the
UUID-default proof runs one insert against a throwaway file engine with the pragma listener
NOT attached, so `foreign_keys` stays OFF and the absent households/persons tables don't block it.
"""

import uuid

from sqlalchemy import Float, Numeric, String
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.models import Base, BaseEntity, MonetaryValueMixin


class _Probe(BaseEntity):
    __tablename__ = "_probe"


class _MoneyProbe(BaseEntity, MonetaryValueMixin):
    __tablename__ = "_money_probe"


# The real households/persons tables now exist (Story 1.2c). No stubs needed.


BASE_ENTITY_COLUMNS = {
    "id",
    "household_id",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "archived",
    "archived_at",
    "archived_by",
    "status",
}

MONEY_COLUMNS = {
    "currency",
    "amount",
    "fx_rate",
    "amount_base_calculated",
    "amount_base",
    "fx_delta",
    "fee_amount",
    "fx_rate_date",
}


def test_base_entity_is_abstract_and_maps_no_table():
    assert BaseEntity.__abstract__ is True
    assert not hasattr(BaseEntity, "__table__")


def test_base_entity_exposes_exactly_the_ten_columns():
    assert set(_Probe.__table__.columns.keys()) == BASE_ENTITY_COLUMNS


def test_base_entity_column_contract():
    cols = _Probe.__table__.columns

    assert cols["id"].primary_key is True
    assert cols["id"].default is not None  # app-generated uuid4 default

    not_null = {
        "id",
        "household_id",
        "created_at",
        "updated_at",
        "created_by",
        "archived",
        "status",
    }
    nullable = {"updated_by", "archived_at", "archived_by"}
    for name in not_null:
        assert cols[name].nullable is False, name
    for name in nullable:
        assert cols[name].nullable is True, name

    for name in ("household_id", "archived", "status"):
        assert cols[name].index is True, name

    for name in ("household_id", "created_by", "updated_by", "archived_by"):
        assert cols[name].foreign_keys, name


def test_status_and_archived_defaults():
    cols = _Probe.__table__.columns
    assert cols["status"].default.arg == "active"
    assert cols["archived"].default.arg is False


def test_money_mixin_exposes_exactly_the_eight_columns():
    extra = set(_MoneyProbe.__table__.columns.keys()) - BASE_ENTITY_COLUMNS
    assert extra == MONEY_COLUMNS


def test_money_column_types_are_decimal_numeric():
    cols = _MoneyProbe.__table__.columns

    money_15_4 = {"amount", "amount_base_calculated", "amount_base", "fx_delta", "fee_amount"}
    for name in money_15_4:
        assert isinstance(cols[name].type, Numeric), name
        assert (cols[name].type.precision, cols[name].type.scale) == (15, 4), name

    assert (cols["fx_rate"].type.precision, cols["fx_rate"].type.scale) == (10, 6)

    # currency is String(3) for ISO 4217
    assert isinstance(cols["currency"].type, String)
    assert cols["currency"].type.length == 3

    not_null = {"currency", "amount", "fx_rate", "amount_base_calculated", "amount_base"}
    nullable = {"fx_delta", "fee_amount", "fx_rate_date"}
    for name in not_null:
        assert cols[name].nullable is False, name
    for name in nullable:
        assert cols[name].nullable is True, name


def test_no_float_columns_anywhere():
    for table in (_Probe.__table__, _MoneyProbe.__table__):
        for col in table.columns:
            assert not isinstance(col.type, Float), col.name


async def test_updated_at_onupdate(tmp_path):
    db_path = tmp_path / "onupdate_test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with factory() as session:
            row = _Probe(household_id="hh-1", created_by="person-1")
            session.add(row)
            await session.commit()

        original_updated_at = row.updated_at

        import asyncio

        await asyncio.sleep(0.1)  # ensure time difference

        async with factory() as session:
            loaded = await session.get(_Probe, row.id)
            loaded.status = "inactive"  # trigger update
            await session.commit()

        assert loaded.updated_at > original_updated_at, "updated_at should change on update"
    finally:
        await engine.dispose()


async def test_app_generated_uuid_pk_and_defaults(tmp_path):
    # No pragma listener → foreign_keys stays OFF, so missing households/persons don't block insert.
    db_path = tmp_path / "models_test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with factory() as session:
            row = _Probe(household_id="hh-1", created_by="person-1")
            session.add(row)
            await session.commit()

        assert uuid.UUID(row.id)  # parses → app-generated UUID string
        assert row.created_at is not None
        assert row.created_at.tzinfo is not None, "created_at must be tz-aware"
        assert row.updated_at is not None
        assert row.updated_at.tzinfo is not None, "updated_at must be tz-aware"
        assert row.status == "active"
        assert row.archived is False
    finally:
        await engine.dispose()
