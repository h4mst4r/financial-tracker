"""AuditService — append-only audit trail writer (ARCH §4.7).

Singleton-style module: `audit.log(...)` is the single entry point for all audit
writes. Called inside the service after each mutation, before the request commits
(so the audit row is part of the same atomic transaction).

Writes `flush` but **never** `commit` — the request's `get_db` owns the boundary.
"""

import json
import re
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.system import AuditLog

# Sensitive field patterns for masking
_SENSITIVE_PATTERNS = [
    re.compile(r"secret_ref$", re.IGNORECASE),
    re.compile(r"secret$", re.IGNORECASE),
]


def _mask_value(key: str, value: str | None) -> str | None:
    """Mask sensitive values before audit write."""
    if value is None:
        return value
    # Mask account_number: keep last 4 chars
    if key == "account_number":
        return "****" + value[-4:] if len(value) >= 4 else "****"
    # Mask any *secret_ref* or *secret field
    for pattern in _SENSITIVE_PATTERNS:
        if pattern.search(key):
            return value  # already a reference string, not a raw secret
    return value


def _serialize_scalar(value) -> object | None:
    """Convert scalar ORM values to JSON-safe types.

    Decimal is serialized as string to preserve exact precision (ARCH C5 — never float).
    """
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):  # must precede `date` — datetime subclasses date
        return value.isoformat()
    if isinstance(value, date):  # bare date columns, e.g. account_snapshots.snapshot_date
        return value.isoformat()
    return value


def _remask_snapshot(snapshot: dict | None) -> dict | None:
    """Re-apply masking over an already-built snapshot dict.

    Defensive, idempotent pass at the write point: `_scalar_snapshot` is the sanctioned
    path and already masks, but a hand-built dict could bypass it. `_mask_value` is
    idempotent on already-masked values, so re-running it never double-masks.
    """
    if snapshot is None:
        return None
    return {
        key: _mask_value(key, value) if isinstance(value, str) else value
        for key, value in snapshot.items()
    }


def _scalar_snapshot(row) -> dict | None:
    """Extract scalar columns only (no relationships) as a JSON-serializable dict."""
    if row is None:
        return None
    snapshot = {}
    for col in row.__table__.columns:
        key = col.key
        raw = getattr(row, key, None)
        # Skip relationship attributes (they're not in __table__.columns but
        # defensive check for hybrid/property accessors)
        if raw is not None and hasattr(raw, "__iter__") and not isinstance(raw, (str, bytes)):
            continue
        masked = _mask_value(key, raw) if isinstance(raw, str) else raw
        snapshot[key] = _serialize_scalar(masked)
    return snapshot


class AuditService:
    """Append-only audit trail writer."""

    async def log(
        self,
        db: AsyncSession,
        *,
        household_id: str,
        actor_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        before: dict | None = None,
        after: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Write one audit row inside the request's transaction.

        Args:
            db: The request's AsyncSession (shared transaction).
            household_id: Household UUID.
            actor_id: Person UUID who performed the action.
            action: One of create/update/archive/restore/delete.
            entity_type: Entity type slug (e.g. "category", "account").
            entity_id: Entity UUID.
            before: Pre-mutation scalar snapshot (None for create).
            after: Post-mutation scalar snapshot (None for delete).
            ip_address: Request IP (populated in Epic 2).
            user_agent: Request user agent (populated in Epic 2).
        """
        entry = AuditLog(
            household_id=household_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_state=json.dumps(_remask_snapshot(before)) if before is not None else None,
            after_state=json.dumps(_remask_snapshot(after)) if after is not None else None,
            occurred_at=datetime.now(UTC),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(entry)
        await db.flush()  # Part of request transaction, NO commit


# Module-level singleton
audit = AuditService()
