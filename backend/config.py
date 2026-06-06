"""Application settings loaded from environment variables / .env file."""

import logging
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Global application settings.

    All values are read from environment variables or a .env file in the
    project root.  See `.env.example` for the full list of keys.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # ignore VITE_* and other frontend-only vars in .env
    )

    # --- Database ---
    DATABASE_URL: str = "sqlite+aiosqlite:///./financial_tracker.db"

    # --- Google OAuth ---
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/callback"

    # --- Session / Security ---
    SESSION_SECRET: str = "dev-secret-change-me"
    SECRET_KEY: str = ""

    # --- Frontend ---
    FRONTEND_URL: str = "http://localhost:5173"

    # --- Token Expiry ---
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # --- External APIs ---
    EXCHANGERATE_API_KEY: str = ""

    # --- Google Cloud Storage (optional for local dev) ---
    GCS_BUCKET: str = ""

    # --- Debug ---
    DEBUG: bool = False

    # --- Developer tooling ---
    # NEVER set AUTH_BYPASS_ENABLED=true in production.
    # When true, localhost requests are auto-authenticated as a fixed dev user.
    AUTH_BYPASS_ENABLED: bool = False
    ENV: str = "development"

    def __post_init__(self) -> None:
        """Warn when default secrets are used."""
        if self.SESSION_SECRET == "dev-secret-change-me" and not self.DEBUG:
            logging.warning(
                "SESSION_SECRET is still set to the development default. "
                "Generate a real secret for production."
            )


settings = Settings()
