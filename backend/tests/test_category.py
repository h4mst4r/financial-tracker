"""Category CRUD tests (Story 3.1): create/edit + the depth-2 limit + household scoping + role gate.

Mirrors `test_household.py`: self-contained temp-DB engines (disposed in finally — Windows WAL/SHM
leak), CSRF middleware against a monkeypatched `async_session_factory`. `/api/categories` POST/PATCH
are mutating, non-exempt routes, so requests carry the session cookie **and** the `X-CSRF-Token`
header. Covers: top-level (depth 0) + subcategory (depth 1, vivid persists), grandchild reject
(400), dup name (409, case-insensitive), archived excluded by default, cross-household 404, and
the member-role 403 gate.
"""

import tempfile
from datetime import date
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
from backend.models.budget import Budget, Category
from backend.models.event import FinancialEvent
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
    db_path = Path(tmp_dir) / "category_test.db"
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


async def _seed_household(factory, *, role: str = "admin") -> tuple[str, str]:
    """Insert a Household + a Person (default role admin — categories need admin). Returns
    (person_id, household_id)."""
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
                display_name="Admin Person",
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


def _new(name: str, **over) -> dict:
    return {"name": name, "color": "#3b82f6", **over}


# ── Create ──


async def test_create_top_level_depth_0(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/categories", json=_new("Travel", icon="✈", vivid=True))
        assert resp.status_code == 201
        body = resp.json()
        assert body["depth"] == 0
        assert body["parent_id"] is None
        assert body["vivid"] is True
        assert body["status"] == "active"
        # snake_case wire (generic-entity surface, not camelCase)
        assert "category_type" in body
    finally:
        await engine.dispose()


async def test_create_subcategory_depth_1(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        resp = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"]))
        assert resp.status_code == 201
        body = resp.json()
        assert body["depth"] == 1
        assert body["parent_id"] == parent["id"]
    finally:
        await engine.dispose()


async def test_reject_grandchild_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        child = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"])).json()
        resp = client.post("/api/categories", json=_new("Sushi", parent_id=child["id"]))
        assert resp.status_code == 400
        assert resp.json()["status"] == 400  # RFC 7807
    finally:
        await engine.dispose()


async def test_duplicate_name_case_insensitive_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        assert client.post("/api/categories", json=_new("Travel")).status_code == 201
        resp = client.post("/api/categories", json=_new("travel"))
        assert resp.status_code == 409
        assert resp.json()["status"] == 409
    finally:
        await engine.dispose()


# ── Update ──


async def test_update_category(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cat = client.post("/api/categories", json=_new("Food")).json()
        resp = client.patch(
            f"/api/categories/{cat['id']}", json={"name": "Groceries", "vivid": True}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Groceries"
        assert body["vivid"] is True
    finally:
        await engine.dispose()


# ── List ──


async def test_list_excludes_archived_by_default(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        active = client.post("/api/categories", json=_new("Active")).json()
        archived = client.post("/api/categories", json=_new("Archived")).json()
        # Archive one directly (the archive endpoint is Story 3.2).
        async with factory() as db:
            row = await db.get(Category, archived["id"])
            row.archived = True
            await db.commit()

        listed = client.get("/api/categories").json()
        ids = {c["id"] for c in listed["items"]}
        assert active["id"] in ids
        assert archived["id"] not in ids
        assert listed["total"] == len(listed["items"])

        with_archived = client.get("/api/categories?include_archived=true").json()
        assert archived["id"] in {c["id"] for c in with_archived["items"]}
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

        # Separate clients per identity — one cookie jar each (the sliding-cookie re-send otherwise
        # cross-contaminates a shared jar).
        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, a_sid, a_csrf)
        cat = client_a.post("/api/categories", json=_new("Secret")).json()

        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, b_sid, b_csrf)
        assert client_b.get(f"/api/categories/{cat['id']}").status_code == 404
        assert client_b.patch(f"/api/categories/{cat['id']}", json={"name": "x"}).status_code == 404
    finally:
        await engine.dispose()


async def test_member_role_cannot_create_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory, role="member")
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        resp = client.post("/api/categories", json=_new("Nope"))
        assert resp.status_code == 403
        # but a member CAN list
        assert client.get("/api/categories").status_code == 200
    finally:
        await engine.dispose()


# ── Story 3.2 helpers: insert a referencing event / budget directly ──


async def _insert_event(factory, household_id: str, actor_id: str, category_id: str) -> None:
    async with factory() as db:
        db.add(
            FinancialEvent(
                household_id=household_id,
                created_by=actor_id,
                event_type="transaction",
                event_date=date(2026, 1, 1),
                category_id=category_id,
                currency="SGD",
                amount=Decimal("10.00"),
                fx_rate=Decimal("1.000000"),
                amount_base_calculated=Decimal("10.00"),
                amount_base=Decimal("10.00"),
            )
        )
        await db.commit()


async def _insert_budget(factory, household_id: str, actor_id: str, category_id: str) -> None:
    async with factory() as db:
        db.add(
            Budget(
                household_id=household_id,
                created_by=actor_id,
                name="Groceries budget",
                category_id=category_id,
                period_type="monthly",
                limit_currency="SGD",
                limit_amount=Decimal("100.00"),
                limit_amount_base=Decimal("100.00"),
                period_start=date(2026, 1, 1),
                period_end=date(2026, 1, 31),
            )
        )
        await db.commit()


async def _archived_flag(factory, category_id: str) -> bool:
    async with factory() as db:
        return (await db.get(Category, category_id)).archived


# ── Archive / restore (branch cascade, FR-C-005) ──


async def test_archive_parent_cascades_branch(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        sub1 = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"])).json()
        sub2 = client.post("/api/categories", json=_new("Snacks", parent_id=parent["id"])).json()

        resp = client.post(f"/api/categories/{parent['id']}/archive")
        assert resp.status_code == 200  # never 409

        # Whole branch archived; children keep their parent_id (not auto-promoted).
        assert await _archived_flag(factory, parent["id"]) is True
        assert await _archived_flag(factory, sub1["id"]) is True
        assert await _archived_flag(factory, sub2["id"]) is True
        with_archived = client.get("/api/categories?include_archived=true").json()["items"]
        kids = [c for c in with_archived if c["parent_id"] == parent["id"]]
        assert {c["id"] for c in kids} == {sub1["id"], sub2["id"]}
        # Default list now excludes the whole branch.
        assert client.get("/api/categories").json()["items"] == []
    finally:
        await engine.dispose()


async def test_archive_subcategory_only(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        sub = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"])).json()

        assert client.post(f"/api/categories/{sub['id']}/archive").status_code == 200
        assert await _archived_flag(factory, sub["id"]) is True
        assert await _archived_flag(factory, parent["id"]) is False
    finally:
        await engine.dispose()


async def test_archive_idempotent_parent_then_child(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        sub = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"])).json()

        assert client.post(f"/api/categories/{parent['id']}/archive").status_code == 200
        # Child already archived by the cascade — archiving it again is a 200 no-op.
        assert client.post(f"/api/categories/{sub['id']}/archive").status_code == 200
        assert await _archived_flag(factory, sub["id"]) is True
    finally:
        await engine.dispose()


async def test_restore_parent_restores_branch(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        sub = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"])).json()
        client.post(f"/api/categories/{parent['id']}/archive")

        assert client.post(f"/api/categories/{parent['id']}/restore").status_code == 200
        assert await _archived_flag(factory, parent["id"]) is False
        assert await _archived_flag(factory, sub["id"]) is False
    finally:
        await engine.dispose()


# ── Promote / re-parent (move, FR-C-003) ──


async def test_promote_subcategory(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        sub = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"])).json()

        resp = client.post(f"/api/categories/{sub['id']}/move", json={"parent_id": None})
        assert resp.status_code == 200
        body = resp.json()
        assert body["parent_id"] is None
        assert body["depth"] == 0
    finally:
        await engine.dispose()


async def test_reparent_subcategory(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        p1 = client.post("/api/categories", json=_new("Food")).json()
        p2 = client.post("/api/categories", json=_new("Shopping")).json()
        sub = client.post("/api/categories", json=_new("Dining", parent_id=p1["id"])).json()

        resp = client.post(f"/api/categories/{sub['id']}/move", json={"parent_id": p2["id"]})
        assert resp.status_code == 200
        body = resp.json()
        assert body["parent_id"] == p2["id"]
        assert body["depth"] == 1
    finally:
        await engine.dispose()


async def test_reparent_parent_with_children_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        a = client.post("/api/categories", json=_new("Food")).json()
        b = client.post("/api/categories", json=_new("Shopping")).json()
        client.post("/api/categories", json=_new("Dining", parent_id=a["id"]))  # A has a child

        resp = client.post(f"/api/categories/{a['id']}/move", json={"parent_id": b["id"]})
        assert resp.status_code == 400  # a parent-with-children can't become a sub (3rd level)
    finally:
        await engine.dispose()


async def test_move_under_subcategory_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        sub = client.post("/api/categories", json=_new("Dining", parent_id=parent["id"])).json()
        loose = client.post("/api/categories", json=_new("Shopping")).json()

        # Target is a subcategory (depth 1) → 400.
        resp = client.post(f"/api/categories/{loose['id']}/move", json={"parent_id": sub["id"]})
        assert resp.status_code == 400
    finally:
        await engine.dispose()


async def test_move_under_archived_parent_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        target = client.post("/api/categories", json=_new("Food")).json()
        mover = client.post("/api/categories", json=_new("Shopping")).json()
        client.post(f"/api/categories/{target['id']}/archive")  # archive the would-be parent

        resp = client.post(f"/api/categories/{mover['id']}/move", json={"parent_id": target["id"]})
        assert resp.status_code == 400  # can't nest under an archived parent
    finally:
        await engine.dispose()


async def test_move_self_parent_400(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cat = client.post("/api/categories", json=_new("Food")).json()
        resp = client.post(f"/api/categories/{cat['id']}/move", json={"parent_id": cat["id"]})
        assert resp.status_code == 400
    finally:
        await engine.dispose()


# ── Hard-delete + dependency scan (FR-C-006) ──


async def test_delete_empty_204(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cat = client.post("/api/categories", json=_new("Food")).json()
        assert client.delete(f"/api/categories/{cat['id']}").status_code == 204
        assert client.get(f"/api/categories/{cat['id']}").status_code == 404
    finally:
        await engine.dispose()


async def test_delete_with_child_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        client.post("/api/categories", json=_new("Dining", parent_id=parent["id"]))
        assert client.delete(f"/api/categories/{parent['id']}").status_code == 409
    finally:
        await engine.dispose()


async def test_delete_with_event_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cat = client.post("/api/categories", json=_new("Food")).json()
        await _insert_event(factory, hh_id, person_id, cat["id"])
        assert client.delete(f"/api/categories/{cat['id']}").status_code == 409
    finally:
        await engine.dispose()


async def test_delete_with_budget_409(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, hh_id = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        cat = client.post("/api/categories", json=_new("Food")).json()
        await _insert_budget(factory, hh_id, person_id, cat["id"])
        assert client.delete(f"/api/categories/{cat['id']}").status_code == 409
    finally:
        await engine.dispose()


async def test_can_delete_in_list(monkeypatch):
    engine, factory = await _make_factory()
    try:
        person_id, _ = await _seed_household(factory)
        sid, csrf = await _seed_session(factory, person_id)
        client = _client_with_db(factory, monkeypatch)
        _auth(client, sid, csrf)

        parent = client.post("/api/categories", json=_new("Food")).json()
        client.post("/api/categories", json=_new("Dining", parent_id=parent["id"]))
        leaf = client.post("/api/categories", json=_new("Shopping")).json()

        items = {c["id"]: c for c in client.get("/api/categories").json()["items"]}
        assert items[parent["id"]]["can_delete"] is False
        assert items[parent["id"]]["delete_blocked_reason"] == "has subcategories"
        assert items[leaf["id"]]["can_delete"] is True
        assert items[leaf["id"]]["delete_blocked_reason"] is None
    finally:
        await engine.dispose()


# ── Scoping & role on the new mutations ──


async def test_cross_household_archive_move_delete_404(monkeypatch):
    engine, factory = await _make_factory()
    try:
        a_person, _ = await _seed_household(factory)
        b_person, _ = await _seed_household(factory)
        a_sid, a_csrf = await _seed_session(factory, a_person)
        b_sid, b_csrf = await _seed_session(factory, b_person)

        client_a = _client_with_db(factory, monkeypatch)
        _auth(client_a, a_sid, a_csrf)
        cat = client_a.post("/api/categories", json=_new("Secret")).json()

        client_b = _client_with_db(factory, monkeypatch)
        _auth(client_b, b_sid, b_csrf)
        assert client_b.post(f"/api/categories/{cat['id']}/archive").status_code == 404
        assert (
            client_b.post(f"/api/categories/{cat['id']}/move", json={"parent_id": None}).status_code
            == 404
        )
        assert client_b.delete(f"/api/categories/{cat['id']}").status_code == 404
    finally:
        await engine.dispose()


async def test_member_role_cannot_mutate_403(monkeypatch):
    engine, factory = await _make_factory()
    try:
        admin_id, hh_id = await _seed_household(factory)
        # A second person in the same household, role member.
        member_id = str(uuid4())
        async with factory() as db:
            db.add(
                Person(
                    id=member_id,
                    household_id=hh_id,
                    email=f"{uuid4()}@example.com",
                    display_name="Member Person",
                    role="member",
                    google_sub=f"sub-{uuid4()}",
                )
            )
            await db.commit()
        a_sid, a_csrf = await _seed_session(factory, admin_id)
        m_sid, m_csrf = await _seed_session(factory, member_id)

        admin = _client_with_db(factory, monkeypatch)
        _auth(admin, a_sid, a_csrf)
        cat = admin.post("/api/categories", json=_new("Food")).json()

        member = _client_with_db(factory, monkeypatch)
        _auth(member, m_sid, m_csrf)
        assert member.post(f"/api/categories/{cat['id']}/archive").status_code == 403
        assert (
            member.post(f"/api/categories/{cat['id']}/move", json={"parent_id": None}).status_code
            == 403
        )
        assert member.delete(f"/api/categories/{cat['id']}").status_code == 403
    finally:
        await engine.dispose()
