# Implementation Tracker

**Purpose:** Single source for implementation deltas (spec vs reality) and chronological changelog.
**Canonical Progress:** See `sprint-status.yaml` for story-by-story completion status.

---

## Executive Summary

This document tracks two things:
1. **Thematic Delta Analysis** — Where implementation diverged from planning artifacts (organized by domain)
2. **Changelog** — Chronological log of significant implementation decisions and updates

### Current Epic Status

| Epic | Stories | Status |
|------|---------|--------|
| Epic 1: Foundation | 3/3 | ✅ COMPLETE |
| Epic 2: Categories | 5/5 | ✅ COMPLETE |
| Epic 3: Transactions | 2/7 | 🔄 IN PROGRESS (3-0, 3-3 done) |
| Epic 4-12 | — | ⏳ PLANNED |

> **Full story detail:** See `sprint-status.yaml` for canonical implementation progress.

---

## Thematic Delta Analysis

*Last updated: 2026-05-24 (Epic 1 complete, Epic 2 partial)*

### 1. Data Models

#### Implemented Models (`models.py`)

| Model | Purpose |
|-------|---------|
| `OAuthState` | OAuth CSRF protection |
| `CsrfToken` | State-changing request CSRF tokens (single-use) |
| `Household` | Household container |
| `HouseholdMember` | User-household membership with role hierarchy |
| `HouseholdInvitation` | Invitation system with status enum + expiry |
| `User` | User profile from Google OAuth |
| `Category` | Household-specific categories with hierarchy |
| `Transaction` | Financial transactions with recurring support |
| `Budget` | Category-based budgets |
| `RecurringTransaction` | Recurring transaction templates |
| `Session` | Server-side session management |

#### Deltas vs Architecture Docs

| Area | Delta | Notes |
|------|-------|-------|
| Database | **MINOR** | SQLite (WAL mode not explicitly in connection string) |
| Category Model | **SIGNIFICANT** | Household-specific ONLY, nullable household_id (not system-wide defaults) |
| Invitation Model | **MISSING** from docs | Full model with status enum, expiry, email matching |
| Session Model | **PARTIAL** | Needs more detail in architecture docs |
| CsrfToken Model | **MISSING** from docs | Database-stored single-use tokens |
| OAuthState Model | **MISSING** from docs | Database-stored state tokens for OAuth CSRF |
| HouseholdRole Enum | **MISSING** from docs | owner/admin/member hierarchy |
| Transaction Model | **EXCEEDS** | More features than documented (recurring, currency, archiving) |
| RecurringTransaction Model | **EXCEEDS** | Separate model is cleaner than Transaction flag |

---

### 2. API Endpoints

#### Auth Routes (`/auth/*`) — 7 endpoints
`GET /auth/login`, `GET /auth/google`, `GET /auth/google/callback`, `GET /auth/logout`, `GET /auth/me`, `GET /auth/csrf-token`, `POST /auth/csrf-token/validate`

#### Category Routes (`/api/categories/*`) — 12 endpoints
`GET /api/categories`, `POST /api/categories`, `PUT /api/categories/{id}`, `DELETE /api/categories/{id}`, `PATCH /api/categories/{id}/restore`, `DELETE /api/categories/{id}/permanent`, `GET /api/categories/seed-status`, `GET /api/categories/tree`, `GET /api/categories/{id}/spending-summary`, `PATCH /api/categories/{id}/reassign-children`, `POST /api/categories/create-defaults`

#### Household Routes (`/api/households/*`) — 12 endpoints
`POST /api/households`, `GET /api/households/my-household`, `GET /api/households/my-invitations`, `GET /api/households/invitations/{id}`, `POST /api/households/invitations/{id}/accept`, `DELETE /api/households/invitations/{id}/decline`, `POST /api/households/invitations/{id}/resend`, `GET /api/households/{household_id}`, `GET /api/households/{household_id}/members`, `POST /api/households/{household_id}/members/invite`, `PATCH /api/households/{household_id}/members/{member_id}`

#### Invitation Routes (`/api/invitations/*`) — 1 endpoint
`POST /api/invitations/{id}/accept` (duplicate of households route)

#### Deltas vs PRD API List

| Area | Delta | Notes |
|------|-------|-------|
| Auth endpoints | **EXCEEDS** | CSRF token endpoints not in PRD |
| Category endpoints | **EXCEEDS** | Many more endpoints than PRD lists |
| Household endpoints | **MATCH** | Full implementation with role hierarchy |
| Invitation endpoints | **MISSING** from PRD | Full lifecycle (create, accept, decline, resend) |
| Transaction endpoints | **MISSING** | Model exists, NO route file yet |
| Budget endpoints | **MISSING** | Model exists, NO route file yet |

---

### 3. Category System (Critical Architecture Change)

#### Documented vs Implemented

| Aspect | Status | Notes |
|--------|--------|-------|
| On-demand creation | **MATCH** | Both docs and code use on-demand |
| Household-specific | **MATCH** | Both agree |
| 17 templates | **MATCH** | 12 expense + 5 income matches UX spec |
| Merge support | **NOT IMPLEMENTED** | Story 2-4 not yet done |
| CSV import auto-create | **NOT IMPLEMENTED** | Part of transaction import (Epic 3) |
| Subcategory hierarchy | **EXCEEDS** | Implemented, but docs don't emphasize this feature |
| Spending rollup | **EXCEEDS** | Implemented, but not in PRD category section |
| Archive + permanent delete | **EXCEEDS** | Two-stage deletion not detailed in docs |

**Key Decision:** Categories are NEVER auto-seeded. Templates defined in `database.py` as reference data only. Created via `/api/categories/create-defaults` endpoint (user clicks button in UI).

---

### 4. Invitation Flow

| Aspect | Status | Notes |
|--------|--------|-------|
| Email sending | **CONFLICT** | Brief assumes emails, implementation has none |
| In-app discovery | **EXCEEDS** | `/my-invitations` endpoint for email-matching |
| 7-day expiry | **MATCH** | Both agree |
| Role-based permissions | **EXCEEDS** | Admin/Owner hierarchy not detailed in brief |
| Revocation | **NOT IMPLEMENTED** | Status enum has "revoked" but no revoke endpoint |

**Key Decision:** NO emails sent. Purely in-app invitation system. Invitations stored in DB with 7-day expiry. Email-matching flow: invitee must be logged in with matching Google email.

---

### 5. Authentication & Security

| Aspect | Status | Notes |
|--------|--------|-------|
| OAuth flow | **MATCH** | Implementation matches architecture |
| Session management | **MATCH** | Server-side, HTTP-only cookies |
| 30-min expiry | **MATCH** | ACCESS_TOKEN_EXPIRE_MINUTES = 30 |
| CSRF protection | **EXCEEDS** | Two layers (OAuth state + API tokens) more detailed than docs |
| Clock skew handling | **EXCEEDS** | 30-second clock skew for ID token validation |

---

### 6. Household Management

| Aspect | Status | Notes |
|--------|--------|-------|
| Role system | **EXCEEDS** | 3-tier hierarchy (owner/admin/member) more detailed than docs |
| Single household | **MATCH** | Both agree |
| Admin operations | **PARTIAL** | Delete household endpoint exists but not examined |

---

### 7. Service Layer Pattern

| Aspect | Status | Notes |
|--------|--------|-------|
| Service layer | **MISSING** from docs | Pattern exists but not documented in architecture |
| Separation of concerns | **EXCEEDS** | Clean separation between routes and business logic |

**Key Decision:** `services/` subdirectory with business logic separation. Routes import from services, keeping controllers thin.

---

### 8. Frontend Components

| Component | Status | Key Features |
|-----------|--------|-------------|
| CategoryManager.tsx | **MATCH** | Full CRUD, emoji picker (70+), color presets (20), tree view, archived panel |
| CategoryTree.tsx | **EXCEEDS** | Nested tree rendering with expand/collapse |
| HouseholdSettingsPage.tsx | **MATCH** | Members list, invite dialog, pending invitations, create household modal, delete household |
| LoginPage.tsx | **PARTIAL** | Redirects to backend HTML login page (not React component) |
| AcceptInvitationPage.tsx | **EXCEEDS** | Handles invitation acceptance flow |
| InviteMemberDialog.tsx | **MATCH** | Email input, invitation creation |
| MembersList.tsx | **MATCH** | Member display with roles |
| PendingInvitations.tsx | **EXCEEDS** | Shows pending invitations for current user |
| CreateHouseholdModal.tsx | **MATCH** | Household name input, creation |

---

### 9. Design System (CSS)

| Aspect | Status | Notes |
|--------|--------|-------|
| Dark theme | **MATCH** | Colors match UX spec |
| Typography | **MATCH** | Inter + JetBrains Mono |
| Component classes | **EXCEEDS** | 50+ classes provide more patterns than UX spec defines |
| shadcn/ui | **UNKNOWN** | Not verified if shadcn components are actually used |

---

### 10. Configuration & Deployment

| Aspect | Status | Notes |
|--------|--------|-------|
| Database | **CONFLICT** | Brief says PostgreSQL, implementation uses SQLite |
| APScheduler | **NOT IMPLEMENTED** | Scheduled for later epics |
| GCS | **NOT IMPLEMENTED** | Scheduled for later epics |

---

## Required Documentation Updates

### Critical Conflicts (Must Fix)
1. **Brief Assumption 9:** PostgreSQL → SQLite (implementation reality) ✅ FIXED
2. **Brief "email notifications":** No emails sent, in-app invitations only ✅ FIXED
3. **Category architecture:** Household-specific on-demand (not system-wide defaults) — partially documented but needs stronger emphasis

### Missing Documentation (Should Add)
1. **Service layer pattern:** `services/` subdirectory with business logic separation
2. **CSRF token system:** Two-layer CSRF (OAuth state + API tokens)
3. **Household role hierarchy:** Owner > Admin > Member with permission matrix
4. **Invitation lifecycle:** Full status enum, email-matching flow, 7-day expiry
5. **Category subcategory features:** Spending rollup, child promotion on delete, max 2-level depth
6. **API endpoint inventory:** Many more endpoints than PRD lists

### Exceeded Expectations (Should Document)
1. **Session management:** Sliding window with inactivity timeout
2. **Category archive + permanent delete:** Two-stage deletion pattern
3. **Frontend component richness:** Tree views, emoji picker, color presets exceed spec
4. **CSS component library:** 50+ reusable classes

### Not Yet Implemented (Expected)
1. Merge duplicate categories (Story 2-4 — backlog)
2. CSV import with auto-create (Epic 3 — backlog)
3. Transaction CRUD routes (Epic 3 — backlog)
4. Budget routes (Epic 4 — backlog)
5. Invitation revocation endpoint (status enum exists but no route)

---

## Changelog

*Chronological log of significant implementation decisions and updates.*

### 2026-05-25
- **Story 3-0 complete:** Shared Component Architecture (14/14 deliverables)
  - `useEntityManager<T>` hook with generic CRUD + lifecycle logic
  - `EntityCard<T>` and `EntityPage<T>` shared components
  - `EmojiPicker` (70+ emojis), `ColorPicker` (20 presets), `Modal`, `ConfirmationDialog`
  - Refactored CategoryManager and AccountManager to use shared systems
  - Updated architecture.md and ux-design-specification.md

### 2026-05-24
- **Epic 1 complete:** Google OAuth, Household Management, Session/CSRF Security (3/3 stories)
- **Story 2-1 complete:** Default category seeding (17 templates, on-demand creation)
- **Story 2-2 complete:** Category CRUD operations (create, update, archive, restore, permanent delete)
- **Brief.md synchronized:** Fixed PostgreSQL→SQLite conflict, replaced "email notifications" with in-app invitation system
- **PRD synchronized:** Updated API endpoint inventory to 40+ endpoints across auth, categories, households, invitations

### 2026-05-23
- **Project initialized:** BMad framework v6.7.1
- **Brief created:** Problem statement, product vision, core requirements
- **PRD created:** Feature requirements, user stories, technical specifications
- **Architecture created:** System design, data models, API contracts
- **UX Design created:** Dark futuristic aesthetic, component specifications

---

*This document merges the previous `update-tracking.md` (chronological changelog) and `implementation-delta-report.md` (thematic analysis). Original files archived in `planning-artifacts/archive/`.*
