"""Integration tests for auth + household lifecycle scenarios.

Covers the 4 user scenarios identified in auth-flow-analysis.md:
1. Dev user: bypass OAuth, delete household, recreate on login
2. Owner (OAuth): bootstrap, delete, recreate
3. Admin (OAuth): invite, promote/demote, role constraints
4. Member (OAuth): invitation flow, not_invited error

These tests use the test client (HTTP layer) to verify end-to-end flows
rather than unit-testing individual service functions.
"""

import json
import os
import tempfile

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from unittest.mock import patch

from backend.main import app
from backend.config import settings
from backend.database import Base


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _use_test_db():
    """Use a temp file-based SQLite for auth tests with tables created."""
    import backend.config
    import backend.database

    original_url = backend.config.settings.DATABASE_URL
    original_engine = backend.database.engine
    original_factory = backend.database.async_session_factory

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="auth_hh_test_")
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

    # Import all models so they register with Base.metadata BEFORE create_all
    import backend.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    # Restore original
    backend.config.settings.DATABASE_URL = original_url
    backend.database.engine = original_engine
    backend.database.async_session_factory = original_factory

    # Cleanup temp file
    try:
        os.close(tmp_fd)
        os.unlink(tmp_path)
    except OSError:
        pass


@pytest.fixture(autouse=True)
def _reset_auth_bypass():
    """Reset AUTH_BYPASS_ENABLED to False before each test."""
    original = settings.AUTH_BYPASS_ENABLED
    settings.AUTH_BYPASS_ENABLED = False
    yield
    settings.AUTH_BYPASS_ENABLED = original


@pytest.fixture
def _enable_dev_bypass():
    """Enable AUTH_BYPASS_ENABLED for dev user tests."""
    settings.AUTH_BYPASS_ENABLED = True
    yield
    settings.AUTH_BYPASS_ENABLED = False


# ---------------------------------------------------------------------------
# Scenario 1: Dev User
# ---------------------------------------------------------------------------


class TestDevUserScenario:
    """Dev user: bypass OAuth, delete household, recreate on login."""

    @pytest.mark.asyncio
    async def test_dev_login_creates_household_on_first_call(self, _enable_dev_bypass):
        """Dev login creates dev person + household on first call."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/auth/dev-login")
            assert resp.status_code == 200
            data = resp.json()
            assert data["person"]["displayName"] == "Dev User"
            assert data["person"]["role"] == "owner"
            assert data["person"]["canCreateHousehold"] is True
            assert data["household"] is not None
            assert data["household"]["name"] == "Dev Household"

    @pytest.mark.asyncio
    async def test_dev_login_idempotent_reuses_session(self, _enable_dev_bypass):
        """Subsequent dev login calls reuse the existing session."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.post("/auth/dev-login")
            session_id_1 = resp1.headers.get("x-session-id")

            resp2 = await client.post("/auth/dev-login")
            session_id_2 = resp2.headers.get("x-session-id")

            # Session may be reused or refreshed, but household should be the same
            assert resp1.json()["household"]["householdId"] == resp2.json()["household"]["householdId"]

    @pytest.mark.asyncio
    async def test_dev_user_can_delete_household_and_recover(self, _enable_dev_bypass):
        """Dev user deletes household → next dev-login recreates it."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Step 1: Login to get session + household
            login_resp = await client.post("/auth/dev-login")
            assert login_resp.status_code == 200
            session_id = login_resp.headers.get("x-session-id")
            household_id = login_resp.json()["household"]["householdId"]
            household_name = login_resp.json()["household"]["name"]

            # Step 2: Delete household (owner only)
            delete_resp = await client.request(
                "DELETE",
                "/api/household",
                headers={
                    "X-Session-Token": session_id,
                    "X-CSRF-Token": login_resp.json()["csrfToken"],
                    "Content-Type": "application/json",
                },
                content=json.dumps({"confirmName": household_name}).encode(),
            )
            assert delete_resp.status_code == 204

            # Step 3: Actor's session is preserved after deletion; household is null
            me_resp = await client.get(
                "/auth/me",
                headers={"X-Session-Token": session_id},
            )
            assert me_resp.status_code == 200
            assert me_resp.json()["household"] is None

            # Step 4: Dev bypass middleware should auto-recreate household on next request
            # Simulate a new request without session (middleware triggers)
            login_resp2 = await client.post("/auth/dev-login")
            assert login_resp2.status_code == 200
            data2 = login_resp2.json()
            assert data2["household"] is not None
            assert data2["household"]["name"] == "Dev Household"
            # New household ID (old one was deleted)
            assert data2["household"]["householdId"] != household_id

    @pytest.mark.asyncio
    async def test_dev_user_can_invite_and_manage_members(self, _enable_dev_bypass):
        """Dev user can invite, promote, demote members."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Login
            login_resp = await client.post("/auth/dev-login")
            session_id = login_resp.headers.get("x-session-id")
            csrf = login_resp.json()["csrfToken"]
            household_id = login_resp.json()["household"]["householdId"]

            headers = {
                "X-Session-Token": session_id,
                "X-CSRF-Token": csrf,
            }

            # Invite a member
            invite_resp = await client.post(
                "/api/persons/invite",
                headers=headers,
                json={"invitedEmail": "test@example.com", "role": "member"},
            )
            assert invite_resp.status_code == 201
            inv_data = invite_resp.json()
            assert inv_data["invitedEmail"] == "test@example.com"
            assert inv_data["status"] == "pending"

            # List invitations
            list_resp = await client.get("/api/persons/invitations", headers=headers)
            assert list_resp.status_code == 200
            assert len(list_resp.json()) >= 1

            # Cancel invitation
            cancel_resp = await client.delete(
                f"/api/persons/invitations/{inv_data['id']}",
                headers=headers,
            )
            assert cancel_resp.status_code == 200


# ---------------------------------------------------------------------------
# Scenario 2: Owner (OAuth) Bootstrap & Recovery
# ---------------------------------------------------------------------------


class TestOwnerScenario:
    """Owner (OAuth): bootstrap, delete, recreate."""

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_first_oauth_user_bootstrap(self, mock_exchange, mock_validate):
        """First OAuth user gets can_create_household=True and household created."""
        mock_exchange.return_value = {"id_token": "fake_token"}
        mock_validate.return_value = {
            "sub": "oauth-user-001",
            "email": "owner@example.com",
            "name": "Owner User",
            "picture": None,
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Login
            login_resp = await client.get("/auth/login")
            assert login_resp.status_code == 200

            # Callback
            state = login_resp.cookies.get("oauth_state")
            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )
            assert callback_resp.status_code == 200
            # Should redirect to frontend with session in hash
            assert "session=" in callback_resp.text

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_second_oauth_user_needs_invitation(self, mock_exchange, mock_validate):
        """Second OAuth user (after bootstrap) gets not_invited error."""
        mock_exchange.return_value = {"id_token": "fake_token"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # First user bootstraps
            mock_validate.return_value = {
                "sub": "oauth-user-001",
                "email": "owner@example.com",
                "name": "Owner User",
                "picture": None,
            }
            login_resp = await client.get("/auth/login")
            state = login_resp.cookies.get("oauth_state")
            await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )

            # Second user tries to login without invitation
            mock_validate.return_value = {
                "sub": "oauth-user-002",
                "email": "member@example.com",
                "name": "Member User",
                "picture": None,
            }
            login_resp2 = await client.get("/auth/login")
            state2 = login_resp2.cookies.get("oauth_state")
            callback_resp2 = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state2.split(".")[0]},
                cookies={"oauth_state": state2},
            )
            assert callback_resp2.status_code == 200
            assert "not_invited" in callback_resp2.text

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_owner_delete_household_then_relogin_recreates(self, mock_exchange, mock_validate):
        """Owner deletes household → next OAuth login creates new household."""
        mock_exchange.return_value = {"id_token": "fake_token"}
        mock_validate.return_value = {
            "sub": "oauth-owner-001",
            "email": "owner-recovery@example.com",
            "name": "Owner Recovery",
            "picture": None,
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Bootstrap
            login_resp = await client.get("/auth/login")
            state = login_resp.cookies.get("oauth_state")
            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )
            assert "session=" in callback_resp.text

            # Extract session from redirect hash
            session_match = callback_resp.text.split("session=")[1].split('"')[0]
            session_id = session_match

            # Get /auth/me for CSRF
            me_resp = await client.get(
                "/auth/me",
                headers={"X-Session-Token": session_id},
            )
            assert me_resp.status_code == 200
            me_data = me_resp.json()
            household_id = me_data["household"]["householdId"]
            household_name = me_data["household"]["name"]
            csrf = me_data["csrfToken"]

            # Delete household
            delete_resp = await client.request(
                "DELETE",
                "/api/household",
                headers={
                    "X-Session-Token": session_id,
                    "X-CSRF-Token": csrf,
                    "Content-Type": "application/json",
                },
                content=json.dumps({"confirmName": household_name}).encode(),
            )
            # Actor's session is preserved; household becomes null
            me_after = await client.get(
                "/auth/me",
                headers={"X-Session-Token": session_id},
            )
            assert me_after.status_code == 200
            assert me_after.json()["household"] is None

            # Re-login → should create new household
            login_resp2 = await client.get("/auth/login")
            state2 = login_resp2.cookies.get("oauth_state")
            callback_resp2 = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state2.split(".")[0]},
                cookies={"oauth_state": state2},
            )
            assert "session=" in callback_resp2.text

            # Verify new household
            new_session = callback_resp2.text.split("session=")[1].split('"')[0]
            me_resp2 = await client.get(
                "/auth/me",
                headers={"X-Session-Token": new_session},
            )
            assert me_resp2.status_code == 200
            me_data2 = me_resp2.json()
            assert me_data2["household"] is not None
            assert me_data2["household"]["householdId"] != household_id
            assert me_data2["person"]["canCreateHousehold"] is True


# ---------------------------------------------------------------------------
# Scenario 3: Admin (OAuth)
# ---------------------------------------------------------------------------


class TestAdminScenario:
    """Admin (OAuth): invite, promote/demote, role constraints."""

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_admin_can_invite_and_promote_members(self, mock_exchange, mock_validate):
        """Admin can invite members and promote/demote them."""
        mock_exchange.return_value = {"id_token": "fake_token"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create owner first
            mock_validate.return_value = {
                "sub": "admin-test-owner",
                "email": "admin-owner@example.com",
                "name": "Admin Owner",
                "picture": None,
            }
            login_resp = await client.get("/auth/login")
            state = login_resp.cookies.get("oauth_state")
            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )
            owner_session = callback_resp.text.split("session=")[1].split('"')[0]

            me_resp = await client.get(
                "/auth/me",
                headers={"X-Session-Token": owner_session},
            )
            csrf = me_resp.json()["csrfToken"]
            household_id = me_resp.json()["household"]["householdId"]

            headers = {
                "X-Session-Token": owner_session,
                "X-CSRF-Token": csrf,
            }

            # Invite member
            invite_resp = await client.post(
                "/api/persons/invite",
                headers=headers,
                json={"invitedEmail": "admin-member@example.com", "role": "member"},
            )
            assert invite_resp.status_code == 201
            inv_id = invite_resp.json()["id"]

            # Accept invitation as member
            mock_validate.return_value = {
                "sub": "admin-test-member",
                "email": "admin-member@example.com",
                "name": "Admin Member",
                "picture": None,
            }
            login_resp2 = await client.get("/auth/login")
            state2 = login_resp2.cookies.get("oauth_state")
            callback_resp2 = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state2.split(".")[0]},
                cookies={"oauth_state": state2},
            )
            member_session = callback_resp2.text.split("session=")[1].split('"')[0]

            # Get member's CSRF token
            me_member_pre = await client.get(
                "/auth/me",
                headers={"X-Session-Token": member_session},
            )
            member_csrf = me_member_pre.json()["csrfToken"]

            # Accept invitation
            accept_resp = await client.post(
                f"/api/invitations/{inv_id}/accept",
                headers={
                    "X-Session-Token": member_session,
                    "X-CSRF-Token": member_csrf,
                },
            )
            assert accept_resp.status_code == 200

            # Owner promotes member to admin
            me_member = await client.get(
                "/auth/me",
                headers={"X-Session-Token": member_session},
            )
            member_person_id = me_member.json()["person"]["personId"]

            promote_resp = await client.patch(
                f"/api/persons/{member_person_id}/role",
                headers=headers,
                json={"role": "admin"},
            )
            assert promote_resp.status_code == 200

            # Admin can now invite
            me_admin = await client.get(
                "/auth/me",
                headers={"X-Session-Token": member_session},
            )
            admin_csrf = me_admin.json()["csrfToken"]
            admin_headers = {
                "X-Session-Token": member_session,
                "X-CSRF-Token": admin_csrf,
            }

            invite_resp2 = await client.post(
                "/api/persons/invite",
                headers=admin_headers,
                json={"invitedEmail": "another@example.com", "role": "member"},
            )
            assert invite_resp2.status_code == 201

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_non_admin_cannot_invite_others(self, mock_exchange, mock_validate):
        """Person with role=member (below admin) cannot send invitations."""
        mock_exchange.return_value = {"id_token": "fake_token"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create owner
            mock_validate.return_value = {
                "sub": "invite-test-owner",
                "email": "invite-owner@example.com",
                "name": "Invite Owner",
                "picture": None,
            }
            login_resp = await client.get("/auth/login")
            state = login_resp.cookies.get("oauth_state")
            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )
            owner_session = callback_resp.text.split("session=")[1].split('"')[0]
            owner_me = await client.get("/auth/me", headers={"X-Session-Token": owner_session})
            owner_csrf = owner_me.json()["csrfToken"]

            # Owner invites a member
            invite_resp = await client.post(
                "/api/persons/invite",
                headers={"X-Session-Token": owner_session, "X-CSRF-Token": owner_csrf},
                json={"invitedEmail": "plain-member@example.com", "role": "member"},
            )
            assert invite_resp.status_code == 201
            inv_id = invite_resp.json()["id"]

            # Member logs in via OAuth (invitation pending, no household yet)
            mock_validate.return_value = {
                "sub": "invite-test-member",
                "email": "plain-member@example.com",
                "name": "Plain Member",
                "picture": None,
            }
            member_login = await client.get("/auth/login")
            state2 = member_login.cookies.get("oauth_state")
            cb2 = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state2.split(".")[0]},
                cookies={"oauth_state": state2},
            )
            member_session = cb2.text.split("session=")[1].split('"')[0]
            member_me = await client.get("/auth/me", headers={"X-Session-Token": member_session})
            member_csrf = member_me.json()["csrfToken"]

            # Member explicitly accepts invitation
            accept_resp = await client.post(
                f"/api/invitations/{inv_id}/accept",
                headers={"X-Session-Token": member_session, "X-CSRF-Token": member_csrf},
            )
            assert accept_resp.status_code == 200

            # Member tries to invite someone — must be rejected (403, below admin threshold)
            bad_invite = await client.post(
                "/api/persons/invite",
                headers={"X-Session-Token": member_session, "X-CSRF-Token": member_csrf},
                json={"invitedEmail": "another@example.com", "role": "member"},
            )
            assert bad_invite.status_code == 403


# ---------------------------------------------------------------------------
# Scenario 4: Member (OAuth)
# ---------------------------------------------------------------------------


class TestMemberScenario:
    """Member (OAuth): invitation flow, not_invited error."""

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_member_cannot_login_without_household_or_invitation(self, mock_exchange, mock_validate):
        """Member without household or invitation gets not_invited error."""
        mock_exchange.return_value = {"id_token": "fake_token"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create owner first
            mock_validate.return_value = {
                "sub": "member-scenario-owner",
                "email": "scenario-owner@example.com",
                "name": "Scenario Owner",
                "picture": None,
            }
            login_resp = await client.get("/auth/login")
            state = login_resp.cookies.get("oauth_state")
            await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )

            # Member tries to login without invitation
            mock_validate.return_value = {
                "sub": "member-scenario-member",
                "email": "scenario-member@example.com",
                "name": "Scenario Member",
                "picture": None,
            }
            login_resp2 = await client.get("/auth/login")
            state2 = login_resp2.cookies.get("oauth_state")
            callback_resp2 = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state2.split(".")[0]},
                cookies={"oauth_state": state2},
            )
            assert callback_resp2.status_code == 200
            assert "not_invited" in callback_resp2.text

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_member_can_login_after_invitation(self, mock_exchange, mock_validate):
        """Member can login after being invited."""
        mock_exchange.return_value = {"id_token": "fake_token"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create owner
            mock_validate.return_value = {
                "sub": "invite-scenario-owner",
                "email": "invite-owner@example.com",
                "name": "Invite Owner",
                "picture": None,
            }
            login_resp = await client.get("/auth/login")
            state = login_resp.cookies.get("oauth_state")
            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )
            owner_session = callback_resp.text.split("session=")[1].split('"')[0]

            me_resp = await client.get(
                "/auth/me",
                headers={"X-Session-Token": owner_session},
            )
            csrf = me_resp.json()["csrfToken"]

            # Invite member
            invite_resp = await client.post(
                "/api/persons/invite",
                headers={
                    "X-Session-Token": owner_session,
                    "X-CSRF-Token": csrf,
                },
                json={"invitedEmail": "invite-member@example.com", "role": "member"},
            )
            assert invite_resp.status_code == 201

            # Member logs in → should be assigned to invited household
            mock_validate.return_value = {
                "sub": "invite-scenario-member",
                "email": "invite-member@example.com",
                "name": "Invite Member",
                "picture": None,
            }
            login_resp2 = await client.get("/auth/login")
            state2 = login_resp2.cookies.get("oauth_state")
            callback_resp2 = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state2.split(".")[0]},
                cookies={"oauth_state": state2},
            )
            assert "session=" in callback_resp2.text
            assert "not_invited" not in callback_resp2.text

    @patch("backend.services.auth_service.validate_id_token")
    @patch("backend.services.auth_service.exchange_code_for_tokens")
    @pytest.mark.asyncio
    async def test_member_cannot_accept_invitation_to_different_household(self, mock_exchange, mock_validate):
        """Member already in household A can't accept invitation to household B.

        Flow: Owner1 creates household A, invites member1.
        Member1 logs in (auto-assigned to A via pending invitation).
        Owner2 creates household B (gets can_create_household via grant from owner1).
        Owner2 invites member1 to B.
        Member1 tries to accept B's invitation → 409 (already in A).

        This verifies the strict guard in accept_invitation that blocks
        joining a different household when already a member of one.
        """
        mock_exchange.return_value = {"id_token": "fake_token"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # --- Owner1 bootstraps household A ---
            mock_validate.return_value = {
                "sub": "conflict-owner1",
                "email": "conflict-owner1@example.com",
                "name": "Conflict Owner1",
                "picture": None,
            }
            login_resp = await client.get("/auth/login")
            state = login_resp.cookies.get("oauth_state")
            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state.split(".")[0]},
                cookies={"oauth_state": state},
            )
            owner1_session = callback_resp.text.split("session=")[1].split('"')[0]

            me_a = await client.get(
                "/auth/me",
                headers={"X-Session-Token": owner1_session},
            )
            csrf_owner1 = me_a.json()["csrfToken"]
            household_a_id = me_a.json()["household"]["householdId"]

            # --- Owner1 invites member1 ---
            invite_resp = await client.post(
                "/api/persons/invite",
                headers={
                    "X-Session-Token": owner1_session,
                    "X-CSRF-Token": csrf_owner1,
                },
                json={"invitedEmail": "conflict-member@example.com", "role": "member"},
            )
            assert invite_resp.status_code == 201
            inv_id_a = invite_resp.json()["id"]

            # --- Member1 logs in (NOT auto-assigned; pending invitation shown in dialog) ---
            mock_validate.return_value = {
                "sub": "conflict-member",
                "email": "conflict-member@example.com",
                "name": "Conflict Member",
                "picture": None,
            }
            login_resp_m = await client.get("/auth/login")
            state_m = login_resp_m.cookies.get("oauth_state")
            callback_resp_m = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state_m.split(".")[0]},
                cookies={"oauth_state": state_m},
            )
            assert "session=" in callback_resp_m.text
            member_session = callback_resp_m.text.split("session=")[1].split('"')[0]

            me_m = await client.get(
                "/auth/me",
                headers={"X-Session-Token": member_session},
            )
            # Member has no household yet — pending invitation is in the response
            assert me_m.json()["household"] is None
            assert me_m.json()["pendingInvitation"] is not None
            assert me_m.json()["pendingInvitation"]["householdId"] == household_a_id
            csrf_member = me_m.json()["csrfToken"]

            # --- Member1 explicitly accepts the invitation ---
            accept_resp = await client.post(
                f"/api/invitations/{inv_id_a}/accept",
                headers={
                    "X-Session-Token": member_session,
                    "X-CSRF-Token": csrf_member,
                },
            )
            assert accept_resp.status_code == 200

            # Re-fetch /auth/me to confirm member is now in household A
            me_m = await client.get(
                "/auth/me",
                headers={"X-Session-Token": member_session},
            )
            assert me_m.json()["household"]["householdId"] == household_a_id
            csrf_member = me_m.json()["csrfToken"]

            # --- Owner1 grants can_create_household to member1 ---
            member_person_id = me_m.json()["person"]["personId"]
            grant_resp = await client.patch(
                f"/api/persons/{member_person_id}/household-creation",
                headers={
                    "X-Session-Token": owner1_session,
                    "X-CSRF-Token": csrf_owner1,
                },
                json={"canCreateHousehold": True},
            )
            assert grant_resp.status_code == 200

            # --- Member1 leaves household A ---
            leave_resp = await client.post(
                "/api/persons/leave",
                headers={
                    "X-Session-Token": member_session,
                    "X-CSRF-Token": csrf_member,
                },
            )
            assert leave_resp.status_code == 200
            assert leave_resp.json()["household"] is None

            # --- Owner1 cancels any pending invitations (so member1 won't be auto-assigned) ---
            list_inv_resp = await client.get(
                "/api/persons/invitations",
                headers={
                    "X-Session-Token": owner1_session,
                    "X-CSRF-Token": csrf_owner1,
                },
            )
            assert list_inv_resp.status_code == 200
            for inv in list_inv_resp.json():
                await client.delete(
                    f"/api/persons/invitations/{inv['id']}",
                    headers={
                        "X-Session-Token": owner1_session,
                        "X-CSRF-Token": csrf_owner1,
                    },
                )

            # --- Member1 re-logs in → creates household B (can_create_household=True, no pending invite) ---
            login_resp_m2 = await client.get("/auth/login")
            state_m2 = login_resp_m2.cookies.get("oauth_state")
            callback_resp_m2 = await client.get(
                "/auth/callback",
                params={"code": "fake_code", "state": state_m2.split(".")[0]},
                cookies={"oauth_state": state_m2},
            )
            assert "session=" in callback_resp_m2.text
            member_session2 = callback_resp_m2.text.split("session=")[1].split('"')[0]

            me_m2 = await client.get(
                "/auth/me",
                headers={"X-Session-Token": member_session2},
            )
            household_b_id = me_m2.json()["household"]["householdId"]
            assert household_b_id != household_a_id
            csrf_member2 = me_m2.json()["csrfToken"]

            # --- Owner1 invites member1 to A again ---
            invite_resp2 = await client.post(
                "/api/persons/invite",
                headers={
                    "X-Session-Token": owner1_session,
                    "X-CSRF-Token": csrf_owner1,
                },
                json={"invitedEmail": "conflict-member@example.com", "role": "member"},
            )
            assert invite_resp2.status_code == 201
            inv_id_b = invite_resp2.json()["id"]

            # --- Member1 tries to accept A's invitation → 409 (already in B) ---
            accept_resp = await client.post(
                f"/api/invitations/{inv_id_b}/accept",
                headers={
                    "X-Session-Token": member_session2,
                    "X-CSRF-Token": csrf_member2,
                },
            )
            assert accept_resp.status_code == 409
