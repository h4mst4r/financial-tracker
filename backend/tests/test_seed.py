"""Story 2.3 seed tests — the §2.6 decision tree, `_create_and_seed_household`, the 13 default
categories (idempotent), pending-invitation priority, never-invited, and the callback's
`detachment_reason` → `?error=` mapping.

Self-contained temp-DB engines (disposed in finally — Windows WAL/SHM leak). asyncio_mode=auto.
"""

import tempfile
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.budget import Category
from backend.models.currency import Currency
from backend.models.identity import ApprovedOwner, Household, HouseholdInvitation, Person
from backend.rate_limit import limiter
from backend.services import auth
from backend.services.category import seed_default_categories


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "seed_test.db"
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


async def _new_person(db, *, email: str, sub: str | None = None) -> Person:
    person = Person(id=str(uuid4()), email=email, google_sub=sub or f"sub-{uuid4()}")
    db.add(person)
    await db.flush()
    return person


async def test_approved_owner_seeds_household_currency_categories():
    engine, factory = await _make_factory()
    try:
        async with factory() as db:
            db.add(ApprovedOwner(email="owner@example.com", is_active=True))
            person = await _new_person(db, email="Owner@Example.com")  # case-insensitive match
            person.detachment_reason = "left"  # must be cleared on re-seed
            await auth.seed_household_if_needed(db, person)
            await db.commit()
            pid, hid = person.id, person.household_id

        async with factory() as db:
            person = await db.get(Person, pid)
            assert person.household_id is not None
            assert person.role == "owner"
            assert person.can_create_household is True
            assert person.detachment_reason is None and person.detached_at is None

            household = await db.get(Household, hid)
            assert household.base_currency == "SGD"
            assert household.timezone == "Asia/Singapore"

            currencies = (
                (await db.execute(select(Currency).where(Currency.household_id == hid)))
                .scalars()
                .all()
            )
            assert len(currencies) == 1
            assert currencies[0].is_base is True and currencies[0].code == "SGD"
            assert currencies[0].rate_to_base == Decimal("1.0")

            cats = (
                (await db.execute(select(Category).where(Category.household_id == hid)))
                .scalars()
                .all()
            )
            assert len(cats) == 13
            assert all(c.depth == 0 and c.parent_id is None for c in cats)
            types = [c.category_type for c in cats]
            assert types.count("expense") == 10
            assert types.count("income") == 2
            assert types.count("both") == 1
            assert all(c.color.startswith("#") for c in cats)
    finally:
        await engine.dispose()


async def test_seed_default_categories_idempotent_case_insensitive():
    engine, factory = await _make_factory()
    try:
        async with factory() as db:
            person = await _new_person(db, email="o@x.com")
            household = Household(name="HH", created_by=person.id)
            db.add(household)
            await db.flush()
            person.household_id = household.id
            hid = household.id
            # A pre-existing case-variant of a default name must be skipped (FR-C-007).
            db.add(
                Category(
                    household_id=hid,
                    created_by=person.id,
                    name="salary",
                    category_type="income",
                    color="#000000",
                    depth=0,
                )
            )
            await db.flush()
            await seed_default_categories(db, hid, person.id)  # skips "Salary"
            await seed_default_categories(db, hid, person.id)  # idempotent re-run adds nothing
            await db.commit()

        async with factory() as db:
            cats = (
                (await db.execute(select(Category).where(Category.household_id == hid)))
                .scalars()
                .all()
            )
            # the pre-existing "salary" + 12 other defaults = 13; "Salary" never duplicated.
            assert len(cats) == 13
            salaries = [c for c in cats if c.name.lower() == "salary"]
            assert len(salaries) == 1
    finally:
        await engine.dispose()


async def test_pending_invitation_beats_approval():
    engine, factory = await _make_factory()
    try:
        async with factory() as db:
            inviter = await _new_person(db, email="inviter@x.com")
            other_hh = Household(name="Other", created_by=inviter.id)
            db.add(other_hh)
            await db.flush()
            inviter.household_id = other_hh.id

            db.add(ApprovedOwner(email="dual@x.com", is_active=True))  # also approved
            person = await _new_person(db, email="dual@x.com")
            db.add(
                HouseholdInvitation(
                    household_id=other_hh.id,
                    invited_email="Dual@x.com",  # case-insensitive match
                    invited_by=inviter.id,
                    expires_at=datetime.now(UTC) + timedelta(days=7),
                    status="pending",
                )
            )
            await db.flush()

            await auth.seed_household_if_needed(db, person)
            await db.commit()
            assert person.household_id is None  # pending path won — no household seeded

        async with factory() as db:
            households = (await db.execute(select(Household))).scalars().all()
            assert len(households) == 1  # only the inviter's; none seeded for the approved owner
            assert (await db.execute(select(Currency))).scalars().first() is None
            assert (await db.execute(select(Category))).scalars().first() is None
    finally:
        await engine.dispose()


async def test_expired_invitation_does_not_block_approval():
    engine, factory = await _make_factory()
    try:
        async with factory() as db:
            inviter = await _new_person(db, email="inv2@x.com")
            other_hh = Household(name="Other", created_by=inviter.id)
            db.add(other_hh)
            await db.flush()
            inviter.household_id = other_hh.id

            db.add(ApprovedOwner(email="late@x.com", is_active=True))
            person = await _new_person(db, email="late@x.com")
            db.add(
                HouseholdInvitation(
                    household_id=other_hh.id,
                    invited_email="late@x.com",
                    invited_by=inviter.id,
                    expires_at=datetime.now(UTC) - timedelta(days=1),  # expired → ignored
                    status="pending",
                )
            )
            await db.flush()

            await auth.seed_household_if_needed(db, person)
            await db.commit()
            assert person.household_id is not None  # approval seeded a household
            assert person.role == "owner"
    finally:
        await engine.dispose()


async def test_never_invited_raises_and_person_persists():
    engine, factory = await _make_factory()
    try:
        async with factory() as db:
            person = await _new_person(db, email="nobody@x.com")
            with pytest.raises(auth.NotInvitedError):
                await auth.seed_household_if_needed(db, person)
            await db.commit()  # the Person row still persists (valid identity, no rights)

        async with factory() as db:
            found = (
                await db.execute(select(Person).where(Person.email == "nobody@x.com"))
            ).scalar_one_or_none()
            assert found is not None and found.household_id is None
    finally:
        await engine.dispose()


async def test_not_invited_exception_carries_detachment_reason():
    engine, factory = await _make_factory()
    try:
        for reason in (None, "left", "removed", "household_deleted"):
            async with factory() as db:
                person = await _new_person(db, email=f"{reason}@x.com")
                person.detachment_reason = reason
                await db.flush()
                with pytest.raises(auth.NotInvitedError) as excinfo:
                    await auth.seed_household_if_needed(db, person)
                assert excinfo.value.detachment_reason == reason
    finally:
        await engine.dispose()


def _client_with_db(factory) -> TestClient:
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
    return TestClient(app)


@pytest.mark.parametrize(
    ("reason", "expected"),
    [
        (None, "not_invited"),
        ("left", "not_invited"),
        ("removed", "removed"),
        ("household_deleted", "household_deleted"),
    ],
)
async def test_callback_maps_detachment_reason_to_error_code(monkeypatch, reason, expected):
    engine, factory = await _make_factory()
    try:

        async def _raise(*_args, **_kwargs):
            raise auth.NotInvitedError("x@x.com", detachment_reason=reason)

        monkeypatch.setattr(auth, "complete_oauth_login", _raise)
        client = _client_with_db(factory)
        state = auth.sign_state()
        client.cookies.set(auth.OAUTH_STATE_COOKIE, state)
        resp = client.get(f"/auth/callback?code=abc&state={state}", follow_redirects=False)
        assert resp.status_code == 302
        assert f"error={expected}" in resp.headers["location"]
    finally:
        await engine.dispose()
