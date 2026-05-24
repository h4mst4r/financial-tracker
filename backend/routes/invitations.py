"""Invitation management API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_db
from ..models import HouseholdInvitation, HouseholdMember, HouseholdRole, InvitationStatus, User

router = APIRouter(prefix="/api/invitations", tags=["invitations"])


class InvitationAcceptResponse(BaseModel):
    message: str
    household_id: str
    role: str


@router.post("/{invitation_id}/accept", response_model=InvitationAcceptResponse)
async def accept_invitation(
    invitation_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Accept a household invitation."""
    # Find invitation
    invitation = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.id == invitation_id
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Check if expired
    if invitation.is_expired():
        invitation.status = InvitationStatus.expired
        db.commit()
        raise HTTPException(status_code=400, detail="This invitation has expired")
    
    # Check if already accepted/revoked
    if invitation.status != InvitationStatus.pending:
        raise HTTPException(status_code=400, detail=f"This invitation has already been {invitation.status.value}")
    
    # Verify user email matches invitation email
    if user.email != invitation.email:
        raise HTTPException(status_code=403, detail="This invitation was sent to a different email")
    
    # Check if user is already a member of this household
    existing_member = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == invitation.household_id,
        HouseholdMember.user_id == user.id
    ).first()
    
    if existing_member:
        raise HTTPException(status_code=400, detail="You are already a member of this household")
    
    # Add user to household as Member
    member = HouseholdMember(
        household_id=invitation.household_id,
        user_id=user.id,
        role=HouseholdRole.member,
    )
    db.add(member)
    
    # Update invitation status
    invitation.status = InvitationStatus.accepted
    db.commit()
    
    return {
        "message": "Successfully joined the household!",
        "household_id": str(invitation.household_id),
        "role": "member",
    }
