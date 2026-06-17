"""Shared per-IP rate limiter (ARCH §2.10).

A module-level `Limiter` is required because `@limiter.limit(...)` decorators are applied
at import time, before `create_app()` runs. `create_app()` binds this same instance to
`app.state.limiter` and registers the `RateLimitExceeded` handler; the full middleware
stack (SecurityHeaders → DevBypass → CSRF → SlowAPI) is wired in Story 2.2.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

AUTH_RATE_LIMIT = "20/minute"
