# Implementation Delta Report

**Date:** 2026-05-24
**Purpose:** Comprehensive comparison of actual implementation vs planning artifacts, to drive documentation synchronization.
**Status:** Epic 1 (3/3 done), Epic 2 (2/5 done)

---

## 1. Data Models

### Implemented Models (models.py)

| Model | Fields | Purpose |
|-------|--------|---------|
| `OAuthState` | id, state, expires_at, created_at | OAuth CSRF protection |
| `CsrfToken` | id, user_id, token, expires_at, used, created_at | State-changing request CSRF tokens (single-use) |
| `Household` | id, name, created_by, created_at, updated_at | Household container |
| `HouseholdMember` | id, household_id, user_id, role (owner/admin/member), joined_at | User-household membership |
| `HouseholdInvitation` | id, household_id, email, invited_by, status (pending/accepted/expired/revoked), expires_at, created_at | Invitation system |
| `User` | id, email, name, picture_url, role (admin/member), created_at, updated_at | User profile from Google OAuth |
| `Category` | id, household_id (nullable), parent_id, name, type, color, icon, is_default, is_archived, created_by, created_at, updated_at | Household-specific categories with hierarchy |
| `Transaction` | id, household_id, category_id, user_id, amount, currency, type, description, date, is_recurring, recurring_frequency, next_due_date, is_archived, created_at, updated_at | Financial transactions |
| `Budget` | id, household_id, category_id, amount, period, start_date, end_date, is_archived, created_by, created_at, updated_at | Category-based budgets |
| `RecurringTransaction` | id, household_id, category_id, user_id, amount, currency, type, description, frequency, next_due_date, is_archived, created_at, updated_at | Recurring transaction templates |
| `Session` | id, user_id, expires_at, last_activity_at, ip_address, user_agent | Server-side session management |

### Deltas vs Architecture Docs

| Area | Documented | Implemented | Delta |
|------|-----------|-------------|-------|
| Database | SQLite WAL mode mentioned | SQLite (no WAL explicitly configured) | **MINOR** - WAL mode not in connection string |
| Category Model | System-wide defaults with optional household override | Household-specific categories ONLY, nullable household_id | **SIGNIFICANT** - fundamental architecture change |
| Invitation Model | Not detailed in architecture | Full model with status enum, expiry, email matching | **MISSING** from architecture docs |
| Session Model | Mentioned as "server-side sessions" | Full model with activity tracking, IP, user-agent | **PARTIAL** - needs more detail in docs |
| CsrfToken Model | Not mentioned | Database-stored single-use tokens | **MISSING** from architecture docs |
| OAuthState Model | Not mentioned | Database-stored state tokens for OAuth CSRF | **MISSING** from architecture docs |
| UserRole Enum | admin/member only | admin/member (no owner role at user level) | **MATCH** |
| HouseholdRole Enum | Not detailed | owner/admin/member hierarchy | **MISSING** from architecture docs |
| Transaction Model | Basic fields mentioned | Full model with recurring, currency, archiving | **EXCEEDS** - more features than documented |
| Budget Model | Mentioned in PRD | Full model implemented | **MATCH** |
| RecurringTransaction Model | Mentioned in PRD | Separate model (not just Transaction flag) | **EXCEEDS** - separate model is cleaner |

---

## 2. API Endpoints

### Auth Routes (`/auth/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/auth/login` | Public | Login page with Google button |
| GET | `/auth/google` | Public | OAuth redirect |
| GET | `/auth/google/callback` | Public | OAuth callback handler |
| GET | `/auth/logout` | Public | Logout (clears session) |
| GET | `/auth/me` | Session | Current user info |
| GET | `/auth/csrf-token` | Session | Generate CSRF token |
| POST | `/auth/csrf-token/validate` | Session | Validate and consume CSRF token |

### Category Routes (`/api/categories/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/categories` | Session | List categories (filters: archived, parent_id, top_level) |
| POST | `/api/categories` | Session | Create category |
| PUT | `/api/categories/{id}` | Session | Update category |
| DELETE | `/api/categories/{id}` | Session | Soft-delete (archive) |
| PATCH | `/api/categories/{id}/restore` | Session | Restore archived |
| DELETE | `/api/categories/{id}/permanent` | Session | Permanent delete |
| GET | `/api/categories/seed-status` | Public | Check seeding status |
| GET | `/api/categories/tree` | Session | Nested tree structure |
| GET | `/api/categories/{id}/spending-summary` | Session | Spending rollup with children |
| PATCH | `/api/categories/{id}/reassign-children` | Session | Bulk reassign subcategories |
| POST | `/api/categories/create-defaults` | Session | Create default categories for household |

### Household Routes (`/api/households/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/households` | Session | Create new household |
| GET | `/api/households/my-household` | Session | Current user's household |
| GET | `/api/households/my-invitations` | Session | Pending invitations for user's email |
| GET | `/api/households/invitations/{id}` | Public | Get invitation details |
| POST | `/api/households/invitations/{id}/accept` | Session | Accept invitation |
| DELETE | `/api/households/invitations/{id}/decline` | Session | Decline invitation |
| POST | `/api/households/invitations/{id}/resend` | Session (Admin/Owner) | Resend invitation |
| GET | `/api/households/{household_id}` | Session | Get household details |
| GET | `/api/households/{household_id}/members` | Session | List members |
| POST | `/api/households/{household_id}/members/invite` | Session (Admin/Owner) | Invite member |
| PATCH | `/api/households/{household_id}/members/{member_id}` | Session (Owner) | Update member role |

### Invitation Routes (`/api/invitations/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/invitations/{id}/accept` | Session | Accept invitation (duplicate of households route) |

### Deltas vs PRD API List

| Area | Documented in PRD | Implemented | Delta |
|------|------------------|-------------|-------|
| Auth endpoints | Google OAuth, login, logout, me | Full implementation + CSRF token endpoints | **EXCEEDS** - CSRF endpoints not in PRD |
| Category endpoints | Basic CRUD listed | Full CRUD + tree, spending, reassign, seed | **EXCEEDS** - many more endpoints than PRD lists |
| Household endpoints | Create, list members, invite | Full implementation with role hierarchy | **MATCH** |
| Invitation endpoints | Not detailed | Full lifecycle (create, accept, decline, resend) | **MISSING** from PRD API list |
| Dashboard routes | `/api/dashboard` exists | Routes file exists but not examined in detail | **UNKNOWN** |
| Admin routes | `/api/admin` exists | Routes file exists but not examined in detail | **UNKNOWN** |
| Transaction endpoints | Listed in PRD | Model exists, NO route file yet | **MISSING** - not implemented yet |
| Budget endpoints | Listed in PRD | Model exists, NO route file yet | **MISSING** - not implemented yet |

---

## 3. Category System (Critical Architecture Change)

### Documented (PRD Section 2.12)
- "On-demand defaults" - categories created when household is created or user clicks "Create Default Categories"
- Household-specific with on-demand creation
- Merge support for duplicate categories
- CSV import with auto-create

### Implemented
- **NO auto-seeding** - categories are NEVER created automatically
- Templates defined in `database.py` as reference data only (12 expense + 5 income = 17 templates)
- Categories created via `/api/categories/create-defaults` endpoint (user clicks button in UI)
- Created as regular household-specific categories (`is_default=False`, not system defaults)
- Full parent-child hierarchy with 2-level max depth
- Soft delete (archive) + permanent delete with child promotion
- Name uniqueness per household (case-insensitive)
- Color validation (hex format), icon as unicode emoji
- Spending rollup across subcategories
- Tree structure API for nested display

### Delta Assessment
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

---

## 4. Invitation Flow

### Documented (Brief)
- "Email notifications" assumed
- Email-based invitations

### Implemented
- **NO emails sent** - purely in-app invitation system
- Invitations stored in DB with 7-day expiry
- Email-matching flow: invitee must be logged in with matching Google email
- Invitation link format: `http://localhost:5173/invite/{invitation_id}`
- Admin/Owner can invite, only Owner can change roles
- Pending invitations visible to invitee when they log in (via `/my-invitations`)
- Accept deletes invitation, decline deletes invitation
- Resend extends expiry by 7 days (Admin/Owner only)
- Status enum: pending, accepted, expired, revoked

### Delta Assessment
| Aspect | Status | Notes |
|--------|--------|-------|
| Email sending | **CONFLICT** | Brief assumes emails, implementation has none |
| In-app discovery | **EXCEEDS** | `/my-invitations` endpoint for email-matching |
| 7-day expiry | **MATCH** | Both agree |
| Role-based permissions | **EXCEEDS** | Admin/Owner hierarchy not detailed in brief |
| Revocation | **NOT IMPLEMENTED** | Status enum has "revoked" but no revoke endpoint |

---

## 5. Authentication & Security

### Documented (Architecture)
- Google OAuth 2.0
- Server-side sessions
- HTTP-only cookies
- 30-minute session expiry
- CSRF protection

### Implemented
- **OAuth**: Full flow with state token verification, ID token validation via google-auth library
- **Sessions**: Database-stored with expires_at, last_activity_at, IP, user-agent
- **Cookies**: HTTP-only, SameSite=lax, domain=localhost, 30-minute max-age
- **Session refresh**: last_activity_at updated on each request (sliding window)
- **Inactivity timeout**: 30-minute inactivity kills session
- **CSRF OAuth**: Database-stored state tokens, 5-minute expiry, single-use
- **CSRF API**: Database-stored single-use tokens, 1-hour expiry, validated via header
- **User creation**: Auto-created on first Google login (get_or_create pattern)

### Delta Assessment
| Aspect | Status | Notes |
|--------|--------|-------|
| OAuth flow | **MATCH** | Implementation matches architecture |
| Session management | **MATCH** | Server-side, HTTP-only cookies |
| 30-min expiry | **MATCH** | ACCESS_TOKEN_EXPIRE_MINUTES = 30 |
| CSRF protection | **EXCEEDS** | Two layers (OAuth state + API tokens) more detailed than docs |
| Clock skew handling | **EXCEEDS** | 30-second clock skew for ID token validation |

---

## 6. Household Management

### Documented (PRD Section 2.1)
- Create household
- Invite members
- Role system

### Implemented
- **Role hierarchy**: Owner > Admin > Member (HouseholdRole enum)
- **Owner**: Can change member roles, delete household, all admin permissions
- **Admin**: Can invite members, resend invitations, manage categories
- **Member**: Read-only access to household data
- **Single household per user**: User can only belong to one household
- **Auto-create on login**: Household created via API call (not automatic)
- **Role enforcement**: `require_role()` helper checks hierarchy

### Delta Assessment
| Aspect | Status | Notes |
|--------|--------|-------|
| Role system | **EXCEEDS** | 3-tier hierarchy (owner/admin/member) more detailed than docs |
| Single household | **MATCH** | Both agree |
| Admin operations | **PARTIAL** | Delete household endpoint exists but not examined |

---

## 7. Service Layer Pattern

### Documented (Architecture)
- Not explicitly mentioned in architecture docs

### Implemented
- `services/category_service.py` - All category business logic separated from routes
- Functions: create_category, update_category, archive_category, delete_category_permanently, restore_category, get_category_tree, calculate_spending_rollup, reassign_children, promote_children
- Validation helpers: validate_color, check_circular_relationship, get_user_household_id, belongs_to_household
- Routes import from services, keeping controllers thin

### Delta Assessment
| Aspect | Status | Notes |
|--------|--------|-------|
| Service layer | **MISSING** from docs | Pattern exists but not documented in architecture |
| Separation of concerns | **EXCEEDS** | Clean separation between routes and business logic |

---

## 8. Frontend Components

### Documented (UX Spec)
- CategoryManager: Custom categories, color picker, emoji icons
- HouseholdSettingsPage: Member management, invitations
- LoginPage: Google OAuth button
- DashboardPage: Overview with charts

### Implemented
| Component | Status | Key Features |
|-----------|--------|-------------|
| CategoryManager.tsx | **MATCH** | Full CRUD, emoji picker (70+ emojis), color presets (20 colors), tree view, archived panel |
| CategoryTree.tsx | **EXCEEDS** | Nested tree rendering with expand/collapse |
| HouseholdSettingsPage.tsx | **MATCH** | Members list, invite dialog, pending invitations, create household modal, delete household |
| LoginPage.tsx | **PARTIAL** | Redirects to backend HTML login page (not React component) |
| DashboardPage.tsx | **UNKNOWN** | Exists but not examined in detail |
| AcceptInvitationPage.tsx | **EXCEEDS** | Handles invitation acceptance flow |
| InviteMemberDialog.tsx | **MATCH** | Email input, invitation creation |
| MembersList.tsx | **MATCH** | Member display with roles |
| PendingInvitations.tsx | **EXCEEDS** | Shows pending invitations for current user |
| CreateHouseholdModal.tsx | **MATCH** | Household name input, creation |
| TestPage.tsx | **EXTRA** | Testing utility, not in specs |

### Delta Assessment
| Aspect | Status | Notes |
|--------|--------|-------|
| Component count | **MATCH** | All specified components exist |
| CategoryManager features | **MATCH** | Color picker, emoji icons, CRUD all present |
| Tree view | **EXCEEDS** | Nested category display not emphasized in UX spec |
| Login flow | **DIFFERENT** | Uses backend HTML page, not React component |

---

## 9. Design System (CSS)

### Documented (UX Spec)
- Dark futuristic aesthetic
- Inter + JetBrains Mono typography
- Tailwind CSS + shadcn/ui
- Color palette with CSS custom properties

### Implemented (index.css)
- **10 organized sections**: Base resets, component classes, layout, typography, feedback, forms, data display, navigation, overlays, utilities
- **50+ component classes**: btn-*, card-*, input-*, badge-*, toast-*, modal-*, dialog-*, dropdown-*, tooltip-*, sidebar-*, nav-*, table-*, chart-*, etc.
- **Theme tokens**: @theme {} with colors, fonts, shadows, radii
- **Dark theme**: Background #0a0a0f, surfaces #12121a, borders #1e1e2e

### Delta Assessment
| Aspect | Status | Notes |
|--------|--------|-------|
| Dark theme | **MATCH** | Colors match UX spec |
| Typography | **MATCH** | Inter + JetBrains Mono |
| Component classes | **EXCEEDS** | 50+ classes provide more patterns than UX spec defines |
| shadcn/ui | **UNKNOWN** | Not verified if shadcn components are actually used |

---

## 10. Configuration & Deployment

### Documented (Brief)
- PostgreSQL database
- APScheduler for recurring tasks
- Google Cloud Storage for file storage

### Implemented
- SQLite with SQLAlchemy ORM
- No APScheduler configured yet
- No GCS integration yet
- Environment config via `config.py` with Pydantic BaseSettings

### Delta Assessment
| Aspect | Status | Notes |
|--------|--------|-------|
| Database | **CONFLICT** | Brief says PostgreSQL, implementation uses SQLite |
| APScheduler | **NOT IMPLEMENTED** | Scheduled for later epics |
| GCS | **NOT IMPLEMENTED** | Scheduled for later epics |

---

## Summary of Required Documentation Updates

### Critical Conflicts (Must Fix)
1. **Brief Assumption 9**: PostgreSQL → SQLite (implementation reality)
2. **Brief "email notifications"**: No emails sent, in-app invitations only
3. **Category architecture**: Household-specific on-demand (not system-wide defaults) - partially documented but needs stronger emphasis

### Missing Documentation (Should Add)
1. **Service layer pattern**: `services/` subdirectory with business logic separation
2. **CSRF token system**: Two-layer CSRF (OAuth state + API tokens)
3. **Household role hierarchy**: Owner > Admin > Member with permission matrix
4. **Invitation lifecycle**: Full status enum, email-matching flow, 7-day expiry
5. **Category subcategory features**: Spending rollup, child promotion on delete, max 2-level depth
6. **API endpoint inventory**: Many more endpoints than PRD lists

### Exceeded Expectations (Should Document)
1. **Session management**: Sliding window with inactivity timeout
2. **Category archive + permanent delete**: Two-stage deletion pattern
3. **Frontend component richness**: Tree views, emoji picker, color presets exceed spec
4. **CSS component library**: 50+ reusable classes

### Not Yet Implemented (Expected)
1. Merge duplicate categories (Story 2-4 - backlog)
2. CSV import with auto-create (Epic 3 - backlog)
3. Transaction CRUD routes (Epic 3 - backlog)
4. Budget routes (Epic 4 - backlog)
5. Invitation revocation endpoint (status enum exists but no route)
