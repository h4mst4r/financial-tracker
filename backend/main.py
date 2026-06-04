"""FastAPI application factory and entry-point.

Creates the FastAPI app, registers middleware (Auth → Household → CSRF),
error handlers, and security headers.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status  # Request kept for exception handlers
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.responses import Response

from backend.dependencies import get_db
from backend.middleware.csrf_middleware import CSRFMiddleware
from backend.routes import auth as auth_routes
from backend.routes import household as household_routes


# ---------------------------------------------------------------------------
# Security Headers Middleware
# ---------------------------------------------------------------------------

class SecurityHeadersMiddleware:
    """Add security-focused HTTP response headers to every response.

    Implemented as a pure ASGI middleware (not BaseHTTPMiddleware) so that
    scope["state"] set by inner ASGI middlewares (e.g. AuthMiddleware) is
    visible to FastAPI route handlers without isolation issues.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers[b"strict-transport-security"] = b"max-age=31536000; includeSubDomains"
                headers[b"x-frame-options"] = b"DENY"
                headers[b"x-content-type-options"] = b"nosniff"
                headers[b"referrer-policy"] = b"strict-origin-when-cross-origin"
                message = {**message, "headers": list(headers.items())}
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ---------------------------------------------------------------------------
# Exception Handlers
# ---------------------------------------------------------------------------

async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Convert Pydantic validation errors to a consistent JSON response."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "detail": exc.errors(),
        },
    )


async def http_exception_handler(
    request: Request, exc: Exception  # FastAPI HTTPException
) -> JSONResponse:
    """Wrap FastAPI HTTPExceptions in our standard error envelope."""
    return JSONResponse(
        status_code=exc.status_code,  # type: ignore[attr-defined]
        content={
            "error": getattr(exc, "detail", "Unknown error"),
            "code": "HTTP_ERROR",
            "detail": {},
        },
    )


# ---------------------------------------------------------------------------
# App Factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title="Financial Tracker API",
        version="0.1.0",
    )

    # --- Middleware stack (Starlette LIFO: last registered = outermost = runs first) ---
    # Execution order: SecurityHeaders → CSRF → Route
    # Auth and household context are resolved by FastAPI dependencies, not middleware.
    app.add_middleware(CSRFMiddleware)           # innermost — runs last
    app.add_middleware(SecurityHeadersMiddleware)  # outermost — runs first, wraps all responses

    # --- Exception handlers ---
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    # --- Auth routes (public + protected) ---
    app.include_router(auth_routes.router)

    # --- Household and member management routes ---
    app.include_router(household_routes.router, prefix="/api")

    # --- Health check ---
    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


# Module-level app for uvicorn compatibility (uvicorn backend.main:app)
app = create_app()
