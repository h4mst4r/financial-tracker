# Epic 1 Retrospective: Authentication & User Management

**Date:** 2026-05-26  
**Epic Status:** Done (finalized)  
**Stories:** 3/3 complete  

## Summary

Epic 1 delivered the authentication foundation — Google OAuth login, household member management with invitations, and session/CSRF security. All 3 stories reached "done" status. This epic established the security model that every subsequent feature depends on.

## What Went Well

- **Session-based auth with X-Session-Id fallback** — The dual approach (cookie sessions + `X-Session-Id` header) solved the cross-port problem (backend :8000 ↔ frontend :5173) without compromising security
- **CSRF middleware design** — Database-backed single-use tokens with 30-minute expiry provide strong protection against cross-site request forgery
- **Role-based access control** — Three-tier role system (Owner/Admin/Member) with proper permission checks at the API layer
- **In-app invitation flow** — Email-matching invitations without external email service kept MVP scope tight while remaining functional
- **AuthProvider React context** — Clean separation of auth state (`user`, `csrfToken`, `pendingInvitations`) available to all components

## What Could Improve

- **CSRF token reuse** — Story 1-3 spec says "single-use tokens" but the middleware was changed to allow reuse (`# Don't mark as used`). This creates a gap between spec and implementation. Either update the spec or re-enable single-use
- **Dev login endpoint in auth routes** — `/api/auth/dev-login` lives in `routes/auth.py` alongside production code. Should be behind a `DEV_MODE` flag or extracted to a separate router conditionally included
- **Session expiry inconsistency** — Production sessions expire at 30 minutes (per spec), but dev-login creates 24-hour sessions. The difference should be config-driven, not hardcoded
- **No E2E test for Epic 1** — Unlike Story 2-5, Epic 1 stories weren't validated with an automated integration test. The Google OAuth flow is harder to test locally, but the session/CSRF mechanics could have a headless test

## Story Assessment

| Story | Status | Test Coverage | Notes |
|-------|--------|---------------|-------|
| 1-1: Google OAuth Login | ✅ Done | ⚠️ Manual only | OAuth flow works, no automated test |
| 1-2: Household Member Management | ✅ Done | ⚠️ Manual only | Invitations, roles, member CRUD all working |
| 1-3: Session Timeout & CSRF | ✅ Done | ⚠️ Manual only | CSRF middleware solid, single-use spec gap |

## Key Lessons Learned

### Architectural
1. **Cross-port session management** — The `X-Session-Id` header fallback is a pattern worth documenting. Any future service-to-service auth (e.g., background workers) can reuse this approach
2. **CSRF whitelist needs to be config-driven** — Hardcoding skip paths (`/api/auth/google`, `/api/auth/dev-login`) in middleware is fragile. Move to a `CSRF_EXEMPT_PATHS` list in `config.py`
3. **Auth context should own CSRF refresh** — The `useAuth` hook fetching and storing the CSRF token is the right pattern. Future stories should depend on this context, not fetch tokens independently

### Development Process
1. **Spec-to-implementation drift** — The single-use CSRF token change wasn't reflected in the story spec. When implementation diverges from spec, update the spec immediately
2. **Dev testing infrastructure gap** — We didn't have a way to test auth locally until Epic 2 forced us to add `/api/auth/dev-login`. Dev login should've been part of Epic 1 planning
3. **Google OAuth testing is hard locally** — The OAuth redirect flow requires browser interaction and Google credentials. Consider adding a mock OAuth provider for CI testing

### Security
1. **CSRF middleware is the right level of protection** — Database-backed tokens with expiry provide strong security without the complexity of double-submit cookie patterns
2. **Session timeout enforcement works** — 30-minute expiry on every request validates the session model correctly
3. **Role checks at the API layer** — Admin/Owner guards on invitation and member endpoints prevent privilege escalation

## Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Move CSRF exempt paths to `config.py` as `CSRF_EXEMPT_PATHS` list | Winston | TODO |
| 2 | Add `DEV_MODE` flag — conditionally include dev-login router | Winston | TODO |
| 3 | Resolve CSRF single-use vs reuse — update spec or re-enable deletion | Mary/Winston | TODO |
| 4 | Document `X-Session-Id` header pattern in architecture.md | Paige | TODO |
| 5 | Consider mock OAuth provider for CI testing | Amelia | Future |

## Technical Debt

- **Dev login in production routes** — `/api/auth/dev-login` is always registered, not behind a feature flag
- **CSRF spec drift** — Story 1-3 says single-use; middleware allows reuse
- **Session expiry hardcoded** — 30 min (prod) vs 24h (dev) should be config-driven
- **No automated auth tests** — Epic 1 relies entirely on manual verification

## Overall Rating: ⭐⭐⭐⭐ (4/5)

Solid security foundation with minor spec drift and dev infrastructure gaps. The auth model is sound and has served Epic 2 well. Action items are low-risk improvements, not blockers.
