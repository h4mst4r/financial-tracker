"""FastAPI application factory and same-origin SPA serving (ARCH §5.2–§5.3).

Mount order is load-bearing: API routers + /health are registered FIRST, then the
static files + SPA fallback LAST, so unmatched client routes (/login, /accounts,
/join/:token) resolve to the built index.html. No CORS — single origin.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from backend.config import get_settings
from backend.database import async_session_factory
from backend.errors import problem
from backend.middleware import CSRFMiddleware, DevBypassMiddleware, SecurityHeadersMiddleware
from backend.rate_limit import limiter
from backend.routers import auth as auth_router
from backend.routers import household as household_router
from backend.routers import invitations as invitations_router
from backend.services.auth import seed_bootstrap_owners

logger = logging.getLogger(__name__)

# Built frontend bundle copied here by the Docker build (Stage 1 → frontend_dist).
# Absent in local dev, where Vite serves the frontend directly.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: idempotently seed `BOOTSTRAP_OWNER_EMAILS` into `approved_owners` (ARCH §2.7)."""
    async with async_session_factory() as db:
        await seed_bootstrap_owners(db)
        await db.commit()
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    # Production guard (ARCH §2.5/§5.1): alarm — never a hard stop — if bypass is on outside dev.
    if settings.auth_bypass_enabled and settings.env != "development":
        logger.critical("auth_bypass_enabled_in_non_dev_environment", extra={"env": settings.env})

    app = FastAPI(title="Financial Tracker", debug=settings.debug, lifespan=lifespan)

    # ── Rate limiter (ARCH §2.10) ──
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content=problem(
                type_="rate_limited",
                title="Too many requests",
                status=429,
                detail="Rate limit exceeded",
                instance=request.url.path,
            ),
        )

    # ── Middleware stack (ARCH §2.1) — Starlette runs LIFO, so the LAST add_middleware
    # is the OUTERMOST. Add in reverse to get runtime order:
    #   SecurityHeaders → DevBypass → CSRF → SlowAPI → handler.
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(DevBypassMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    # ── Global exception handlers (RFC 7807, ARCH §4.6) ──

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        """Pass dict detail through unchanged; wrap plain strings into §4.6 shape."""
        if isinstance(exc.detail, dict):
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        # Defensive: wrap plain-string detail into 7807 shape
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "type": "http_error",
                "title": exc.detail,
                "status": exc.status_code,
                "detail": exc.detail,
                "instance": request.url.path,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Wrap Pydantic 422 into RFC 7807 shape with field-error array."""
        errors = []
        for error in exc.errors():
            errors.append(
                {
                    "field": ".".join(str(loc) for loc in error["loc"]),
                    "message": error["msg"],
                    "type": error["type"],
                }
            )
        return JSONResponse(
            status_code=422,
            content={
                "type": "validation_error",
                "title": "Validation failed",
                "status": 422,
                "detail": errors,
                "instance": request.url.path,
            },
        )

    # ── Routers + liveness FIRST ──
    # Liveness only: never guarded by auth/CSRF/maintenance — it must always serve
    # (ARCH §5.1, FR-SYS-012 exemption).
    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router.router)
    app.include_router(household_router.router)
    app.include_router(invitations_router.router)

    # ── Static + SPA fallback LAST ──
    if FRONTEND_DIST.is_dir() and (FRONTEND_DIST / "assets").is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=FRONTEND_DIST / "assets"),
            name="assets",
        )

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str) -> FileResponse:
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
