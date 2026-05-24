"""Household management API routes."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_serializer, model_validator
from sqlalchemy import func

from ..auth import get_current_user
from ..database import SessionLocal, get_db
from ..models import Household, HouseholdMember, HouseholdInvitation, HouseholdRole, InvitationStatus, User

router = APIRouter(prefix="/api/households", tags=["households"])


# --- Pydantic Models ---

class HouseholdCreate(BaseModel):
    name: str


class HouseholdResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_at: str | None = None
    updated_at: str | None = None

    @model_validator(mode="before")
    @classmethod
    def convert_from_orm(cls, value: any) -> any:
        """Convert SQLAlchemy objects to dicts before validation."""
        if isinstance(value, dict):
            return {
                "id": str(value.get("id")) if value.get("id") else "",
                "name": value.get("name", ""),
                "created_by": str(value.get("created_by")) if value.get("created_by") else "",
                "created_at": value.get("created_at").isoformat() if value.get("created_at") and hasattr(value.get("created_at"), "isoformat") else value.get("created_at"),
                "updated_at": value.get("updated_at").isoformat() if value.get("updated_at") and hasattr(value.get("updated_at"), "isoformat") else value.get("updated_at"),
            }
        # Handle SQLAlchemy objects
        return {
            "id": str(value.id) if value.id else "",
            "name": value.name,
            "created_by": str(value.created_by) if value.created_by else "",
            "created_at": value.created_at.isoformat() if value.created_at and hasattr(value.created_at, "isoformat") else value.created_at,
            "updated_at": value.updated_at.isoformat() if value.updated_at and hasattr(value.updated_at, "isoformat") else value.updated_at,
        }


class MemberResponse(BaseModel):
    id: str
    household_id: str
    user_id: str
    email: str | None = None
    name: str | None = None
    role: str
    joined_at: str | None = None

    @model_validator(mode="before")
    @classmethod
    def convert_from_orm(cls, value: any) -> any:
        """Convert SQLAlchemy objects to dicts before validation."""
        if isinstance(value, dict):
            return {
                "id": str(value.get("id")) if value.get("id") else "",
                "household_id": str(value.get("household_id")) if value.get("household_id") else "",
                "user_id": str(value.get("user_id")) if value.get("user_id") else "",
                "email": value.get("email"),
                "name": value.get("name"),
                "role": value.get("role", ""),
                "joined_at": value.get("joined_at").isoformat() if value.get("joined_at") and hasattr(value.get("joined_at"), "isoformat") else value.get("joined_at"),
            }
        # Handle SQLAlchemy objects
        return {
            "id": str(value.id) if value.id else "",
            "household_id": str(value.household_id) if value.household_id else "",
            "user_id": str(value.user_id) if value.user_id else "",
            "email": value.email,
            "name": value.name,
            "role": value.role,
            "joined_at": value.joined_at.isoformat() if value.joined_at and hasattr(value.joined_at, "isoformat") else value.joined_at,
        }


class MyHouseholdResponse(BaseModel):
    household: HouseholdResponse | None = None
    member: MemberResponse | None = None


class InviteRequest(BaseModel):
    email: EmailStr


class RoleUpdateRequest(BaseModel):
    role: str  # "admin" or "member"


class InvitationResponse(BaseModel):
    id: str
    household_id: str
    email: str
    invited_by: str
    status: str
    expires_at: str | None = None
    created_at: str | None = None
    is_expired: bool = False

    @model_validator(mode="before")
    @classmethod
    def convert_from_orm(cls, value: any) -> any:
        """Convert SQLAlchemy objects to dicts before validation."""
        if isinstance(value, dict):
            return {
                "id": str(value.get("id")) if value.get("id") else "",
                "household_id": str(value.get("household_id")) if value.get("household_id") else "",
                "email": value.get("email", ""),
                "invited_by": str(value.get("invited_by")) if value.get("invited_by") else "",
                "status": value.get("status", ""),
                "expires_at": value.get("expires_at").isoformat() if value.get("expires_at") and hasattr(value.get("expires_at"), "isoformat") else value.get("expires_at"),
                "created_at": value.get("created_at").isoformat() if value.get("created_at") and hasattr(value.get("created_at"), "isoformat") else value.get("created_at"),
                "is_expired": value.get("is_expired", False),
            }
        # Handle SQLAlchemy objects
        return {
            "id": str(value.id) if value.id else "",
            "household_id": str(value.household_id) if value.household_id else "",
            "email": value.email,
            "invited_by": str(value.invited_by) if value.invited_by else "",
            "status": value.status,
            "expires_at": value.expires_at.isoformat() if value.expires_at and hasattr(value.expires_at, "isoformat") else value.expires_at,
            "created_at": value.created_at.isoformat() if value.created_at and hasattr(value.created_at, "isoformat") else value.created_at,
            "is_expired": value.is_expired,
        }


# --- Helper Functions ---

def get_household_or_404(db, household_id: uuid.UUID) -> Household:
    """Fetch household or raise 404."""
    household = db.query(Household).filter(Household.id == household_id).first()
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    return household


def get_member_or_404(db, household_id: uuid.UUID, member_id: uuid.UUID) -> HouseholdMember:
    """Fetch household member or raise 404."""
    member = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id,
        HouseholdMember.id == member_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this household")
    return member


def require_household_member(db, user: User, household_id: uuid.UUID) -> HouseholdMember:
    """Check if user is a member of the household, raise 403 if not."""
    member = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id,
        HouseholdMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this household")
    return member


def require_role(db, user: User, household_id: uuid.UUID, required_role: HouseholdRole) -> HouseholdMember:
    """Check if user has at least the required role in the household."""
    member = require_household_member(db, user, household_id)
    role_hierarchy = {HouseholdRole.owner: 2, HouseholdRole.admin: 1, HouseholdRole.member: 0}
    if role_hierarchy.get(member.role, 0) < role_hierarchy.get(required_role, 0):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
    return member


# --- Routes ---

@router.post("/", response_model=HouseholdResponse)
async def create_household(
    household_data: HouseholdCreate,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new household (auto-created on first login)."""
    # Check if user already has a household
    existing = db.query(HouseholdMember).filter(HouseholdMember.user_id == user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="You are already part of a household")

    household = Household(
        name=household_data.name,
        created_by=user.id,
    )
    db.add(household)
    db.flush()

    # Create creator as owner
    owner_member = HouseholdMember(
        household_id=household.id,
        user_id=user.id,
        role=HouseholdRole.owner,
    )
    db.add(owner_member)
    db.commit()
    db.refresh(household)

    return household


@router.get("/my-household", response_model=MyHouseholdResponse)
async def get_my_household(
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Get the current user's household."""
    member = db.query(HouseholdMember).filter(HouseholdMember.user_id == user.id).first()
    if not member:
        return MyHouseholdResponse(household=None, member=None)

    household = db.query(Household).filter(Household.id == member.household_id).first()
    return MyHouseholdResponse(
        household=HouseholdResponse(**household.to_dict()) if household else None,
        member=MemberResponse(**member.to_dict()) if member else None,
    )


@router.get("/my-invitations", response_model=List[InvitationResponse])
async def get_my_invitations(
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Get all pending invitations for the current user's email."""
    import logging
    logger = logging.getLogger(__name__)
    
    # Use func.lower() for SQLite case-insensitive comparison (Annotated columns don't support .lower())
    invitations = db.query(HouseholdInvitation).filter(
        func.lower(HouseholdInvitation.email) == user.email.lower(),
        HouseholdInvitation.status == InvitationStatus.pending
    ).all()
    
    logger.warning(f"[DEBUG] Matching invitations for {user.email}: {len(invitations)}")
    return [i.to_dict() for i in invitations]


@router.get("/invitations/{invitation_id}", response_model=InvitationResponse)
async def get_invitation(
    invitation_id: uuid.UUID,
    db=Depends(get_db),
):
    """Fetch a single invitation by ID (public endpoint, no auth required)."""
    invitation = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.id == invitation_id
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    return invitation.to_dict()


@router.post("/invitations/{invitation_id}/accept")
async def accept_invitation(
    invitation_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Accept an invitation and join the household."""
    invitation = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.id == invitation_id,
        func.lower(HouseholdInvitation.email) == user.email.lower(),
        HouseholdInvitation.status == InvitationStatus.pending
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Pending invitation not found or already used")

    # Check if invitation has expired
    if invitation.is_expired():
        db.delete(invitation)
        db.commit()
        raise HTTPException(status_code=400, detail="This invitation has expired")

    # Check if user is already a member of this household
    existing_member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id,
        HouseholdMember.household_id == invitation.household_id
    ).first()

    if existing_member:
        raise HTTPException(status_code=400, detail="You are already a member of this household")

    # Create the member record
    member = HouseholdMember(
        household_id=invitation.household_id,
        user_id=user.id,
        role=HouseholdRole.member,
    )
    db.add(member)

    # Delete the invitation after successful acceptance (consistent with decline behavior)
    db.delete(invitation)
    db.commit()

    return {"message": "Successfully joined the household"}


@router.delete("/invitations/{invitation_id}/decline")
async def decline_invitation(
    invitation_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Decline an invitation (removes it from the database)."""
    invitation = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.id == invitation_id,
        func.lower(HouseholdInvitation.email) == user.email.lower(),
        HouseholdInvitation.status == InvitationStatus.pending
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Pending invitation not found")

    db.delete(invitation)
    db.commit()

    return {"message": "Invitation declined successfully"}


@router.post("/invitations/{invitation_id}/resend")
async def resend_invitation(
    invitation_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Resend an invitation email (Admin/Owner only)."""
    invitation = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.id == invitation_id,
        HouseholdInvitation.status == InvitationStatus.pending
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Pending invitation not found")

    # Verify user is admin/owner of the household
    household_member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id,
        HouseholdMember.household_id == invitation.household_id
    ).first()

    if not household_member or household_member.role not in [HouseholdRole.owner, HouseholdRole.admin]:
        raise HTTPException(status_code=403, detail="You do not have permission to resend this invitation")

    # Reset expiration to 7 days from now
    invitation.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.commit()

    invitation_link = f"http://localhost:5173/invite/{invitation.id}"

    # NOTE: In production, send email here with invitation_link
    return {
        "message": "Invitation resent successfully",
        "invitation_link": invitation_link,
    }


@router.get("/{household_id}", response_model=HouseholdResponse)
async def get_household(
    household_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Get household details (user must be a member)."""
    require_household_member(db, user, household_id)
    household = get_household_or_404(db, household_id)
    return household


@router.get("/{household_id}/members", response_model=List[MemberResponse])
async def list_members(
    household_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """List all household members."""
    require_household_member(db, user, household_id)
    household = get_household_or_404(db, household_id)

    members = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id
    ).all()

    return [m.to_dict() for m in members]


@router.post("/{household_id}/members/invite")
async def invite_member(
    household_id: uuid.UUID,
    invite_data: InviteRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Invite a member to the household (Admin/Owner only)."""
    require_role(db, user, household_id, HouseholdRole.admin)
    household = get_household_or_404(db, household_id)

    # Check if email already in household
    existing_member = db.query(HouseholdMember).join(User).filter(
        HouseholdMember.household_id == household_id,
        User.email == invite_data.email
    ).first()
    if existing_member:
        raise HTTPException(status_code=400, detail="This email is already a member of the household")

    # Check for existing pending invitation
    existing_invitation = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.household_id == household_id,
        HouseholdInvitation.email == invite_data.email,
        HouseholdInvitation.status == InvitationStatus.pending
    ).first()
    if existing_invitation:
        raise HTTPException(status_code=400, detail="A pending invitation already exists for this email")

    # Create invitation (expires in 7 days)
    invitation = HouseholdInvitation(
        household_id=household_id,
        email=invite_data.email,
        invited_by=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invitation)
    db.commit()

    # NOTE: In production, send email here
    # For now, return the invitation data with a mock link
    invitation_link = f"http://localhost:5173/invite/{invitation.id}"

    return {
        "message": "Invitation sent successfully",
        "invitation": invitation.to_dict(),
        "invitation_link": invitation_link,
    }


@router.patch("/{household_id}/members/{member_id}")
async def update_member_role(
    household_id: uuid.UUID,
    member_id: uuid.UUID,
    role_data: RoleUpdateRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Update a member's role (Owner only)."""
    # Validate role
    if role_data.role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin' or 'member'")

    # Require owner role
    require_role(db, user, household_id, HouseholdRole.owner)

    member = get_member_or_404(db, household_id, member_id)

    # Cannot change own role
    if member.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    # Update role
    member.role = HouseholdRole(role_data.role)
    db.commit()
    db.refresh(member)

    return {"message": "Role updated successfully", "member": member.to_dict()}


@router.delete("/{household_id}/members/{member_id}")
async def remove_member(
    household_id: uuid.UUID,
    member_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Remove a member from the household (Owner only)."""
    # Require owner role
    require_role(db, user, household_id, HouseholdRole.owner)

    member = get_member_or_404(db, household_id, member_id)

    # Cannot remove self
    if member.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself from the household")

    # Delete the member record
    db.delete(member)
    db.commit()

    return {"message": "Member removed successfully"}


@router.get("/{household_id}/invitations", response_model=List[InvitationResponse])
async def list_invitations(
    household_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """List pending invitations for a household (Admin/Owner only)."""
    require_role(db, user, household_id, HouseholdRole.admin)
    household = get_household_or_404(db, household_id)

    invitations = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.household_id == household_id,
        HouseholdInvitation.status == InvitationStatus.pending
    ).all()

    return [i.to_dict() for i in invitations]


@router.delete("/{household_id}/invitations/{invitation_id}")
async def revoke_invitation(
    household_id: uuid.UUID,
    invitation_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Revoke a pending invitation (Admin/Owner only)."""
    require_role(db, user, household_id, HouseholdRole.admin)
    household = get_household_or_404(db, household_id)

    invitation = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.id == invitation_id,
        HouseholdInvitation.household_id == household_id,
        HouseholdInvitation.status == InvitationStatus.pending
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Pending invitation not found")

    db.delete(invitation)
    db.commit()

    return {"message": "Invitation revoked successfully"}


@router.delete("/{household_id}")
async def delete_household(
    household_id: uuid.UUID,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    """Delete an entire household and all associated data (Owner only)."""
    # Require owner role
    member = require_role(db, user, household_id, HouseholdRole.owner)
    household = get_household_or_404(db, household_id)

    # Delete all pending invitations first
    invitations = db.query(HouseholdInvitation).filter(
        HouseholdInvitation.household_id == household_id
    ).all()
    for invitation in invitations:
        db.delete(invitation)

    # Get all members before deleting them
    members = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id
    ).all()

    # Delete all member records
    for m in members:
        db.delete(m)

    # Delete the household itself
    db.delete(household)
    db.commit()

    return {"message": "Household deleted successfully"}
