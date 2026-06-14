"""RFC 7807 Problem Details builder and typed HTTPException raisers (ARCH §4.6).

Every error response uses the canonical 7807 shape. Services raise via the typed
helpers here; `main.py`'s global handler passes dict `detail` through unchanged.
"""

from fastapi import HTTPException


def problem(
    type_: str,
    title: str,
    status: int,
    detail: str,
    instance: str | None = None,
) -> dict:
    """Build an RFC 7807 Problem Details dict."""
    return {
        "type": type_,
        "title": title,
        "status": status,
        "detail": detail,
        **({"instance": instance} if instance is not None else {}),
    }


def not_found(
    entity_type: str = "resource",
    entity_id: str | None = None,
    instance: str | None = None,
) -> None:
    """Raise 404 Not Found."""
    eid = f" ({entity_id})" if entity_id else ""
    raise HTTPException(
        status_code=404,
        detail=problem(
            type_="not_found",
            title=f"{entity_type} not found",
            status=404,
            detail=f"{entity_type}{eid} does not exist or is not accessible",
            instance=instance,
        ),
    )


def has_dependencies(
    entity_type: str,
    entity_id: str | None = None,
    referrers: list[str] | None = None,
    instance: str | None = None,
) -> None:
    """Raise 409 Conflict — entity has downstream references."""
    detail = f"{entity_type} cannot be deleted"
    if entity_id:
        detail += f" ({entity_id})"
    if referrers:
        detail += f"; referenced by: {', '.join(referrers)}"
    raise HTTPException(
        status_code=409,
        detail=problem(
            type_="has_dependencies",
            title="Entity has dependencies",
            status=409,
            detail=detail,
            instance=instance,
        ),
    )


def duplicate_name(
    entity_type: str,
    name: str,
    instance: str | None = None,
) -> None:
    """Raise 409 Conflict — duplicate name."""
    raise HTTPException(
        status_code=409,
        detail=problem(
            type_="duplicate_name",
            title=f"{entity_type} already exists",
            status=409,
            detail=f"{entity_type} '{name}' already exists",
            instance=instance,
        ),
    )


def bad_request(
    title: str,
    detail: str,
    instance: str | None = None,
) -> None:
    """Raise 400 Bad Request."""
    raise HTTPException(
        status_code=400,
        detail=problem(
            type_="bad_request",
            title=title,
            status=400,
            detail=detail,
            instance=instance,
        ),
    )


def forbidden(
    detail: str,
    instance: str | None = None,
) -> None:
    """Raise 403 Forbidden."""
    raise HTTPException(
        status_code=403,
        detail=problem(
            type_="forbidden",
            title="Permission denied",
            status=403,
            detail=detail,
            instance=instance,
        ),
    )
