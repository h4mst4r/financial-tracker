"""Dashboard routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Household, HouseholdMember, User
from ..auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_dashboard_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get dashboard summary data for the authenticated user."""
    # Find the user's household
    household_member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()

    if not household_member:
        return {
            "user": {
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
            },
            "household": None,
            "transactions": [],
            "summary": {
                "total_income": 0,
                "total_expenses": 0,
                "balance": 0,
            },
        }

    household = db.query(Household).filter(
        Household.id == household_member.household_id
    ).first()

    # TODO: Transaction model not yet implemented - return empty transactions
    transactions = []

    return {
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
        },
        "household": {
            "id": str(household.id),
            "name": household.name,
        },
        "transactions": transactions,
        "summary": {
            "total_income": 0,
            "total_expenses": 0,
            "balance": 0,
        },
    }
