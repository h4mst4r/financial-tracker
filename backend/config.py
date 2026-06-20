"""Application configuration — resolved from environment per ARCH §5.4.

Secrets (GOOGLE_CLIENT_SECRET, SESSION_SECRET, EXCHANGERATE_API_KEY,
SERVICE_ACCOUNT_KEY) are read as plain environment variables: Cloud Run surfaces
Secret Manager values as env vars, so no Secret Manager SDK is needed here.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database (engine/migrations wired in Story 1.2 — this is config only)
    database_url: str = "sqlite+aiosqlite:///./financial_tracker.db"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""  # secret
    google_redirect_uri: str = ""

    # Sessions
    session_secret: str = ""  # secret

    # FX provider
    exchangerate_api_key: str = ""  # secret

    # Storage / URLs
    gcs_bucket: str = ""
    frontend_url: str = ""

    # Household bootstrap
    bootstrap_owner_emails: str = ""

    # Jobs
    service_account_key: str = ""  # secret; local/manual fallback only
    job_invoker_sa: str = ""
    service_url: str = ""  # the service's own URL — OIDC audience verified by get_job_auth (§5.6)

    # Operational toggles
    maintenance_mode: bool = False
    auth_bypass_enabled: bool = False  # dev only
    env: str = "development"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
