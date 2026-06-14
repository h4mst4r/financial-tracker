"""FastAPI application factory and same-origin SPA serving (ARCH §5.2–§5.3).

Mount order is load-bearing: API routers + /health are registered FIRST, then the
static files + SPA fallback LAST, so unmatched client routes (/login, /accounts,
/join/:token) resolve to the built index.html. No CORS — single origin.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings

# Built frontend bundle copied here by the Docker build (Stage 1 → frontend_dist).
# Absent in local dev, where Vite serves the frontend directly.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Financial Tracker", debug=settings.debug)

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
