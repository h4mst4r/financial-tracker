"""Admin routes for database management."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db, init_db
from ..models import HouseholdRole, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.delete("/clear-data")
async def clear_all_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all data from the database and reset it.
    
    WARNING: This will delete all households, users, sessions, etc.
    Only available for owner/admin users.
    """
    # Verify user is an owner or admin
    from ..models import HouseholdMember, HouseholdInvitation, Session as SessionModel, \
        Household, User
    
    # Check if user is owner/admin of any household
    user_households = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == current_user.id
    ).all()
    
    is_owner_or_admin = any(
        m.role in (HouseholdRole.owner, HouseholdRole.admin)
        for m in user_households
    )
    
    if not is_owner_or_admin:
        raise HTTPException(
            status_code=403,
            detail="Only household owners or admins can clear data"
        )
    
    # Capture user info before deleting data
    user_email = current_user.email
    
    # Delete all data in correct order (respecting foreign keys)
    tables_to_clear = [
        SessionModel.__tablename__,
        HouseholdMember.__tablename__,
        "oauth_states",
        "csrf_tokens",
        HouseholdInvitation.__tablename__,
        Household.__tablename__,
        User.__tablename__,
    ]
    
    for table_name in tables_to_clear:
        try:
            db.execute(text(f"DELETE FROM {table_name}"))
        except Exception as e:
            logger.warning(f"Failed to clear table {table_name}: {e}")
    
    db.commit()
    
    # Recreate tables
    init_db()
    
    logger.info(f"Database cleared by user {user_email}")
    
    return {
        "message": "All data has been cleared successfully",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
