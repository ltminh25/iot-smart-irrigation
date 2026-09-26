from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.models import User, Role, AuditLog
from app.schemas.schemas import UserResponse
from app.core.security import hash_password
from typing import List
from pydantic import BaseModel
from app.core.security import verify_password

router = APIRouter(prefix="/users", tags=["users"])

class AdminUserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None
    role: str = "owner"

class UserRoleUpdate(BaseModel):
    role: str

class UserStatusUpdate(BaseModel):
    status: str

class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str

@router.post("", response_model=UserResponse)
def create_user(user_in: AdminUserCreate, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    role = db.query(Role).filter(Role.name == user_in.role).first()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role name")
    new_user = User(
        username=user_in.username,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        role_id=role.id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/me/password")
def change_password(req: PasswordUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(req.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"msg": "Password updated successfully"}

@router.get("", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    return db.query(User).all()

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/{user_id}/role")
def update_role(user_id: int, req: UserRoleUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role("admin"))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role = db.query(Role).filter(Role.name == req.role).first()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role")
    user.role_id = role.id
    
    audit = AuditLog(user_id=current_user.id, action="update_role", target=f"user_id:{user.id}")
    db.add(audit)
    db.commit()
    return {"msg": "Role updated successfully"}

@router.put("/{user_id}/status")
def update_status(user_id: int, req: UserStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role("admin"))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if req.status not in ["active", "locked"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    user.status = req.status
    if req.status == "active":
        user.failed_login_count = 0
        
    audit = AuditLog(user_id=current_user.id, action="update_status", target=f"user_id:{user.id}")
    db.add(audit)
    db.commit()
    return {"msg": "Status updated successfully"}
