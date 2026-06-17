"""Shared per-IP rate limiter (ARCH §2.10).

A module-level `Limiter` is required because `@limiter.limit(...)` decorators are applied
at import time, before `create_app()` runs. `create_app()` binds this same instance to
`app.state.limiter`, registers the `RateLimitExceeded` handler, and (Story 2.2) wires
`SlowAPIMiddleware` as the innermost layer of the SecurityHeaders → DevBypass → CSRF →
SlowAPI stack.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

AUTH_RATE_LIMIT = "20/minute"
