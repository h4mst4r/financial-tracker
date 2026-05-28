"""HouseholdMiddleware — propagate household_id from authenticated person.

Zero database queries — purely reads ``scope["state"].person.household_id``
and sets ``scope["state"].household_id``.

Skips the same path prefixes as AuthMiddleware.
"""

from typing import Callable

from starlette.responses import JSONResponse

from .auth_middleware import _should_skip


class HouseholdMiddleware:
    """Scope every request to the authenticated person's household."""

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope["path"]

        # Skip auth / static / docs paths
        if _should_skip(path):
            await self.app(scope, receive, send)
            return

        person = getattr(scope.get("state"), "person", None)

        if person is None:
            response = JSONResponse(
                status_code=401,
                content={
                    "error": "Authentication required",
                    "code": "UNAUTHORIZED",
                    "detail": {},
                },
            )
            await response(scope, receive, send)
            return

        scope["state"].household_id = person.household_id

        await self.app(scope, receive, send)
