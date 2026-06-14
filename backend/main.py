"""FastAPI application factory and same-origin SPA serving (ARCH §5.2–§5.3).

Mount order is load-bearing: API routers + /health are registered FIRST, then the
static files + SPA fallback LAST, so unmatched client routes (/login, /accounts,
/join/:token) resolve to the built index.html. No CORS — single origin.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings

# Built frontend bundle copied here by the Docker build (Stage 1 → frontend_dist).
# Absent in local dev, where Vite serves the frontend directly.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Financial Tracker", debug=settings.debug)

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
