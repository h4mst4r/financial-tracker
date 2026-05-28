"""FastAPI application factory and entry-point.

Creates the FastAPI app, registers middleware (Auth → Household → CSRF),
error handlers, and security headers.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from backend.dependencies import get_db
from backend.middleware.auth_middleware import AuthMiddleware
from backend.middleware.csrf_middleware import CSRFMiddleware
from backend.middleware.household_middleware import HouseholdMiddleware


# ---------------------------------------------------------------------------
# Security Headers Middleware
# ---------------------------------------------------------------------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security-focused HTTP response headers to every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


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

    # --- Security headers (runs on every response) ---
    app.add_middleware(SecurityHeadersMiddleware)

    # --- Middleware stack order: Auth → Household → CSRF ---
    # Outer middleware runs first, so Auth validates session before
    # Household can access request.state.person, and CSRF runs innermost.
    app.add_middleware(AuthMiddleware)
    app.add_middleware(HouseholdMiddleware)
    app.add_middleware(CSRFMiddleware)

    # --- Exception handlers ---
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    # --- Health check ---
    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


# Module-level app for uvicorn compatibility (uvicorn backend.main:app)
app = create_app()
