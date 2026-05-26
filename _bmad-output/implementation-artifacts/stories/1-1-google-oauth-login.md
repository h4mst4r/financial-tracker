---
story_id: "1-1"
story_key: "google-oauth-login"
title: "Google OAuth Login"
epic_id: "epic-1"
epic_title: "Authentication & User Management"
status: done
priority: P0 (Critical)
author: Ben
created: 2026-05-24
updated: 2026-05-24
estimated_effort: 3-5 days
dependencies: []
---

# Story: Google OAuth Login (1-1)

## User Story

**As a** household member,  
**I want to** log in using my Google account,  
**So that** I can access the system without remembering another password.

## Acceptance Criteria

### AC-001: Google OAuth Initiation
- [ ] When user navigates to `/login`, they see a "Sign in with Google" button
- [ ] Clicking the button redirects to Google OAuth 2.0 authorization endpoint
- [ ] Authorization request includes: `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state` (CSRF protection), `prompt=select_account`
- [ ] The `redirect_uri` must be `/auth/google/callback`

### AC-002: OAuth Callback Handling
- [ ] Backend receives authorization code at `/auth/google/callback`
- [ ] Backend exchanges code for ID token and access token via Google token endpoint
- [ ] Backend validates ID token signature, expiration, and audience (`client_id`)
- [ ] Backend extracts user info: email, name, picture from ID token claims
- [ ] If token validation fails, redirect to `/login?error=invalid_token`

### AC-003: User Account Creation/Matching
- [ ] Backend queries database for user with matching email
- [ ] If user exists: load existing account, verify household membership
- [ ] If user is new: create new User record with email, name, picture from Google
- [ ] New users are assigned `role=member` by default
- [ ] User record includes: `id` (UUID), `email`, `name`, `picture_url`, `role`, `created_at`, `updated_at`

### AC-004: Session Management
- [ ] Upon successful authentication, backend creates a server-side session
- [ ] Session stored in database (not client-side JWT for MVP)
- [ ] Session includes: `session_id` (UUID), `user_id`, `expires_at`, `ip_address`, `user_agent`
- [ ] Session cookie set with: `HttpOnly`, `Secure`, `SameSite=Lax`, max-age=1800 (30 min)
- [ ] Session ID rotated on login (prevent session fixation)

### AC-005: Post-Login Redirect
- [ ] After successful login, user is redirected to `/dashboard`
- [ ] If user has no household, redirect to `/household-setup` (handled in Story 1-2)
- [ ] If user is already logged in and visits `/login`, redirect to `/dashboard`
- [ ] Login error page shows user-friendly message, not technical details

## Technical Requirements

### Backend Implementation

#### Files to Create/Modify
1. **`backend/models.py`** — SQLAlchemy models
   - `User` model with fields: `id` (UUID, PK), `email` (unique, indexed), `name`, `picture_url`, `role` (enum: admin/member), `created_at`, `updated_at`
   - `Session` model with fields: `id` (UUID, PK), `user_id` (FK to User), `expires_at`, `ip_address`, `user_agent`

2. **`backend/auth.py`** — Google OAuth 2.0 flow
   - `generate_oauth_url()` — generates Google OAuth authorization URL with state parameter
   - `handle_callback()` — exchanges code for tokens, validates ID token, extracts user info
   - `create_session()` — creates server-side session in database
   - `verify_session()` — validates session cookie, returns user if valid

3. **`backend/routes/auth.py`** — Auth endpoints
   - `GET /login` — returns login page with Google sign-in button
   - `GET /auth/google/callback` — handles OAuth callback
   - `GET /auth/logout` — invalidates session, redirects to login
   - `GET /api/auth/me` — returns current user info (for frontend auth state check)

4. **`backend/database.py`** — SQLite connection
   - SQLAlchemy engine with WAL mode enabled
   - `get_session()` — returns SQLAlchemy session factory
   - `init_db()` — creates all tables

5. **`backend/main.py`** — FastAPI app
   - Mount auth routes
   - Add session middleware
   - Configure CORS for frontend origin

#### Google OAuth Configuration
- Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in environment variables
- Store `GOOGLE_REDIRECT_URI` (e.g., `http://localhost:8000/auth/google/callback` for dev)
- Use `google-auth` library for token validation
- Use `requests` library for token exchange

#### Database Schema (User Model)
```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    picture_url = Column(String, nullable=True)
    role = Column(Enum(Role), nullable=False, default=Role.member)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
```

#### Database Schema (Session Model)
```python
class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    last_activity_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    
    user = relationship("User")
```

#### Cross-Port Authentication (X-Session-Id Header)
- Backend runs on port 8000, frontend Vite dev server runs on port 5173
- Session cookies are set by backend and read by browser
- For cross-port communication, backend sets `X-Session-Id` header in responses
- Frontend reads `X-Session-Id` from response headers and includes it in subsequent API requests
- This pattern ensures session works correctly during development when frontend and backend are on different ports

### Frontend Implementation

#### Files to Create/Modify
1. **`frontend/src/components/LoginPage.tsx`** — Login page component
   - Display "Sign in with Google" button
   - Handle error query parameter display
   - Use existing shadcn/ui Button component

2. **`frontend/src/hooks/useAuth.tsx`** — Auth context provider
   - `checkAuth()` — calls `/api/auth/me` to verify session
   - `login()` — redirects to `/login`
   - `logout()` — calls `/auth/logout` and clears auth state
   - Provide `user` (User | null) and `isLoading` (boolean) to consumers

3. **`frontend/src/lib/api.ts`** — API client
   - Add `get('/api/auth/me')` method
   - Configure with `withCredentials: true` for cookie-based auth

#### API Endpoints (Frontend Calls)
- `GET /api/auth/me` → `{ "user": { "id": "...", "email": "...", "name": "...", "role": "member" } }`
- `GET /api/auth/me` (unauthenticated) → `401 Unauthorized`

### Security Requirements

- **CSRF Protection**: State parameter in OAuth flow prevents CSRF on authorization request
- **Session Fixation Prevention**: Session ID rotated on login
- **HttpOnly Cookies**: Session cookie not accessible via JavaScript
- **SameSite=Lax**: Prevents cross-site request forgery
- **Secure Flag**: Cookie only sent over HTTPS in production
- **Token Validation**: ID token signature, expiration, and audience verified
- **No Password Storage**: OAuth handles password security

### Error Handling

| Error | User Message | Technical Detail |
|-------|--------------|------------------|
| Invalid OAuth state | "Login attempt expired. Please try again." | State parameter mismatch |
| Invalid authorization code | "Authentication failed. Please try again." | Token exchange failed |
| Invalid ID token | "Authentication failed. Please try again." | Token validation failed |
| Email already registered | "Account exists. Logging you in..." | User found by email |
| Database error | "Service temporarily unavailable. Try again later." | Database exception |

## UX Requirements

### Design System Alignment
- **Dark futuristic aesthetic**: Login page uses dark background (#0a0a0f) with bright accent colors
- **Minimalist design**: Single centered card with Google sign-in button
- **Clean typography**: Inter font, clear hierarchy
- **Responsive**: Works on mobile, tablet, and desktop

### Login Page Layout
```
[App Logo/Title]

Sign in to Financial Tracker

[Sign in with Google Button]
[Google icon + "Sign in with Google" text]

© 2026 Financial Tracker
```

### Button Styling
- Google brand colors for sign-in button (blue #4285F4)
- Hover state: slightly darker blue
- Full width on mobile, auto width on desktop
- Minimum 44px height for touch targets

## Testing Requirements

### Backend Tests
- [ ] Test OAuth URL generation includes correct parameters
- [ ] Test callback handling with valid authorization code
- [ ] Test callback handling with invalid state parameter
- [ ] Test user creation for new email
- [ ] Test user lookup for existing email
- [ ] Test session creation and validation
- [ ] Test session expiration
- [ ] Test logout invalidates session

### Frontend Tests
- [ ] Test login page renders Google sign-in button
- [ ] Test button click redirects to `/login`
- [ ] Test error message displays when `?error` query param present
- [ ] Test auth context returns user when authenticated
- [ ] Test auth context returns null when unauthenticated

## Dependencies

### External Services
- Google OAuth 2.0 (requires Google Cloud Console project and OAuth credentials)
- ExchangeRate-API (not needed for this story)

### Related Stories
- **Story 1-2** (Household Member Management): Creates household and assigns members after first login
- **Story 1-3** (Session Timeout and CSRF Protection): Extends session management with timeout and CSRF tokens

### API Dependencies
- Google OAuth 2.0 Authorization Endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
- Google OAuth 2.0 Token Endpoint: `https://oauth2.googleapis.com/token`
- Google UserInfo Endpoint: `https://www.googleapis.com/oauth2/v3/tokeninfo` (ID token validation)

## Implementation Notes

### Phase 1: Setup
1. Create Google Cloud Console project
2. Configure OAuth 2.0 consent screen
3. Create OAuth 2.0 client ID/secret
4. Add redirect URIs (localhost for dev, production URL for prod)

### Phase 2: Backend
1. Create database models (User, Session)
2. Implement OAuth flow in `auth.py`
3. Create auth routes in `routes/auth.py`
4. Set up database connection in `database.py`
5. Mount routes in `main.py`

### Phase 3: Frontend
1. Create LoginPage component
2. Create useAuth hook
3. Update API client
4. Add route guards for protected routes

### Phase 4: Testing
1. Write backend tests
2. Write frontend tests
3. Manual testing of full OAuth flow
4. Test error scenarios

## Definition of Done

- [ ] All acceptance criteria (AC-001 through AC-005) met
- [ ] Backend tests pass
- [ ] Frontend tests pass
- [ ] Code review completed
- [ ] Manual testing of full OAuth flow successful
- [ ] Security review: CSRF, session fixation, token validation verified
- [ ] Documentation updated (API docs, setup instructions)
- [ ] Deployed to development environment
- [ ] Google OAuth credentials configured in dev environment

## Notes for Developer

- This is the **first story** in the project — it gates all other functionality
- Start with backend implementation (models, auth flow, routes) before frontend
- Use `python-dotenv` for environment variable management
- SQLite WAL mode must be enabled for concurrent read/write support
- Google OAuth library: `google-auth` and `google-auth-oauthlib`
- For local development, use `http://localhost:8000` as redirect URI

---

## Validation Notes (2026-05-24)

**Final validation against implementation — All ACs passing ✅**

| AC | Status | Notes |
|---|---|---|
| AC-001: OAuth initiation + state generation | ✅ PASS | `generate_oauth_state()` stores in DB with 5-min expiry |
| AC-002: Callback handling + token exchange | ✅ PASS | `_exchange_code_for_tokens()`, `_validate_id_token()` |
| AC-003: User creation/matching by email | ✅ PASS | `_get_or_create_user()` matches on email |
| AC-004: Server-side session in DB | ✅ PASS | `Session` model, cookie + X-Session-Id header fallback |
| AC-005: Post-login redirect to dashboard | ✅ PASS | Redirects to frontend with `session_id` URL param |

**Minor Discrepancy:**
- Story mentions "shadcn/ui Button component" — implementation uses **pure Tailwind CSS utilities** (no shadcn/ui). Documented in UX Spec. No code impact.
- The frontend already has a `LoginPage.tsx` component skeleton — update it, don't replace it
- Use existing shadcn/ui components (Button, Input, etc.) for consistency
- Follow the existing Tailwind CSS theme configuration
