"""Application configuration."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment or .env file."""

    # Development mode — enables dev-login endpoint and longer session expiry
    DEV_MODE: bool = True

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"

    # Session expiry (minutes)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30     # Production session timeout
    DEV_SESSION_EXPIRE_MINUTES: int = 1440    # Dev session timeout (24h)

    # CSRF — paths that skip token validation (auth endpoints, health checks)
    CSRF_EXEMPT_PATHS: list[str] = [
        "/api/auth/google",
        "/api/auth/dev-login",
    ]

    # CORS
    ALLOWED_HOSTS: str = "localhost,127.0.0.1"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
