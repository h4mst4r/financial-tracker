"""Financial Tracker — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .database import get_db, init_db
from .routes import admin, auth, dashboard, households, invitations
from .models import CsrfToken


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    yield


app = FastAPI(
    title="Financial Tracker",
    description="Personal finance tracking for households",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# CSRF validation middleware
@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    """Validate CSRF tokens for state-changing requests."""
    # Skip CSRF validation for GET, HEAD, OPTIONS requests
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return await call_next(request)
    
    # Skip CSRF validation for auth endpoints (login, callback, logout)
    if "/api/auth/google" in str(request.url.path):
        return await call_next(request)
    
    # Get CSRF token from header
    csrf_token = request.headers.get("x-csrf-token")
    
    if not csrf_token:
        return JSONResponse(
            status_code=403,
            content={"detail": "CSRF token missing"}
        )
    
    # Get database session
    db = next(get_db())
    
    try:
        # Find the token in database
        csrf_record = db.query(CsrfToken).filter(
            CsrfToken.token == csrf_token,
            CsrfToken.used == False
        ).first()
        
        if not csrf_record:
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid CSRF token"}
            )
        
        # Check expiration
        from datetime import datetime
        if csrf_record.expires_at < datetime.now():
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token expired"}
            )
        
        # Don't mark as used - allow token reuse until expiration
        
    finally:
        db.close()
    
    return await call_next(request)


# Mount routes
app.include_router(admin.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(dashboard.router)
app.include_router(households.router)
app.include_router(invitations.router)

# Static files for frontend
import os

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
