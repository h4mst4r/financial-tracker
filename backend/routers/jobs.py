"""Scheduled-job endpoints (ARCH §5.6) — the shared `/jobs/*` harness (Story 3.7).

Every route is guarded by `get_job_auth` (OIDC primary, shared-bearer fallback) at the router
level — NOT session/CSRF (the CSRF middleware already skip-lists `/jobs/*`, §2.4). Triggered by
Cloud Scheduler (prod) or a local `curl` (shared bearer); never publicly callable.

Story 3.7 ships `/jobs/fx-refresh`. The harness is reused by `/jobs/recurring` (E6),
`/jobs/rollover-snapshots` (E8), `/jobs/alerts` + `/jobs/backup` (E10).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_job_auth
from backend.services import fx_fetch

router = APIRouter(prefix="/jobs", tags=["jobs"], dependencies=[Depends(get_job_auth)])


@router.post("/fx-refresh")
async def fx_refresh(db: AsyncSession = Depends(get_db)) -> dict:
    """Daily FX refresh across all households (FR-CU-006, §5.7). Idempotent + safe to re-run."""
    return await fx_fetch.refresh_fx(db)
