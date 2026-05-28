"""Audit logging service — append-only audit trail writer.

Provides a singleton ``AuditService`` that writes ``AuditLog`` records
with JSON-serialized before/after snapshots.  This service is the single
entry point for all audit writes across the application.

Usage:
    audit = AuditService()
    await audit.log(
        db=session,
        household_id=hh_id,
        actor_id=person.id,
        action="create",
        entity_type="transaction",
        entity_id=new_tx.id,
        after={"description": "Grocery shopping", "amount": 52.30},
    )

References: EDP §13.2, ARCH §4.4
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.audit import AuditLog


def _to_json(obj: Optional[Dict[str, Any]]) -> Optional[str]:
    """Serialize a dict to a JSON string for storage.

    Args:
        obj: Dictionary to serialize (or None).

    Returns:
        JSON string, or None if input was None.
    """
    import json

    return json.dumps(obj) if obj is not None else None


class AuditService:
    """Append-only audit trail writer.

    Singleton-style service — create once and reuse across the application.
    Each call to ``log()`` creates a new ``AuditLog`` row; existing rows
    are never modified or deleted.
    """

    async def log(
        self,
        db: AsyncSession,
        *,
        household_id: UUID,
        actor_id: UUID,
        action: str,
        entity_type: str,
        entity_id: UUID,
        before: Optional[Dict[str, Any]] = None,
        after: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Write a new audit log record.

        Args:
            db: Active async database session.
            household_id: Which household this event belongs to.
            actor_id: Who performed the action.
            action: Action type (create/update/archive/restore/delete).
            entity_type: Type of entity affected (e.g., "transaction").
            entity_id: Primary key of the affected entity.
            before: JSON-serializable snapshot before the change.
            after: JSON-serializable snapshot after the change.
            ip_address: Actor's IP address.
            user_agent: Actor's user agent string.

        Returns:
            The newly created ``AuditLog`` instance (after flush).
        """
        audit_record = AuditLog(
            household_id=household_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_state=_to_json(before),
            after_state=_to_json(after),
            occurred_at=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=user_agent,
        )

        db.add(audit_record)
        await db.flush()  # makes audit_record.id available

        return audit_record


# Module-level singleton for convenient imports.
audit_service = AuditService()
