# Epic 2 Retrospective: Core Infrastructure & Categories

**Date:** 2026-05-26  
**Epic Status:** Done (with technical debt)  
**Stories:** 5/5 complete  

## Summary

Epic 2 delivered a complete category system with on-demand defaults, CRUD operations, subcategory support, merge functionality, and import category mapping. All 5 stories reached "done" status with working backend services and most frontend components.

## What Went Well

- **On-demand default creation** — User-triggered (not auto-seeded) gives households control
- **Service layer pattern** — Clean separation of business logic from HTTP handlers
- **Category matching algorithm** — Exact → trimmed → fuzzy (SequenceMatcher ≥ 0.85) is robust
- **Integration test for 2-5** — Full E2E coverage caught real bugs (Pydantic/dict mismatch)
- **Dark futuristic theme** — UI components follow the established visual style

## What Could Improve

- **CSRF middleware planning** — Dev endpoints needed patching twice; should be planned during design
- **Type contracts at service boundaries** — Pydantic vs dict handling was unclear between layers
- **Definition of Done** — Story 2-4 marked "done" but lacks frontend UI and E2E tests
- **Auto-reload reliability** — uvicorn `--reload` missed middleware changes; manual restarts needed

## Story Assessment

| Story | Status | Test Coverage | Notes |
|-------|--------|---------------|-------|
| 2-1: Default Category Seeding | ✅ Done | ✅ Verified | Button-driven, 17 templates |
| 2-2: Category CRUD | ✅ Done | ✅ Verified | Create/edit/delete with validation |
| 2-3: Subcategory Support | ✅ Done | ⚠️ Backend only | Tree view UI exists |
| 2-4: Merge Duplicate Categories | ⚠️ Partial | ❌ No E2E test | Backend logic exists, frontend UI missing |
| 2-5: Import Category Mapping | ✅ Done | ✅ Full E2E | Preview, overrides, auto-create tested |

## Key Lessons Learned

### Architectural
1. **Service layer type contracts** — Define whether functions accept dicts, dataclasses, or Pydantic models explicitly
2. **CSRF whitelist planning** — New auth endpoints need CSRF skip list entries during design
3. **Dev testing infrastructure** — Formalize `/api/auth/dev-login` as `DEV_MODE` flag

### Development Process
1. **Integration tests catch layer-boundary bugs** — Write E2E tests for stories crossing multiple layers
2. **PowerShell background jobs** — `Start-Job -ScriptBlock` pattern reliable for Windows dev servers
3. **Session + CSRF management in tests** — Clean reusable pattern for authenticated API testing

### Requirements
1. **"Done" needs clearer definition** — Backend done ≠ story done; frontend and tests required
2. **Story ordering was effective** — CRUD → subcategories → merge created solid dependency chain

## Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Document service layer type contract convention | Winston/Amelia | TODO |
| 2 | Add E2E test for Story 2-4 (merge duplicates) | Amelia | TODO |
| 3 | Build merge duplicates frontend UI component | Sally | TODO |
| 4 | Add `DEV_MODE` config flag for simplified auth | Winston | TODO |
| 5 | Apply 2-5 integration test pattern to Epic 3 stories | All | TODO |

## Technical Debt

- **Story 2-4 merge UI** — Backend logic exists but frontend component not built
- **Story 2-4 E2E test** — No automated test for merge functionality
- **CSRF whitelist maintenance** — Ad-hoc patching instead of config-driven approach

## Overall Rating: ⭐⭐⭐⭐ (4/5)

Strong foundation with minor process improvements needed. Epic 3 can proceed without blocking on Epic 2 debt items.
