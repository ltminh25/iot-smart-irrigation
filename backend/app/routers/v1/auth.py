from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, hash_password, create_access_token, create_refresh_token, decode_token
from app.core.config import settings
from app.models.models import User, Role, AuditLog
from app.schemas.schemas import UserCreate, UserResponse, UserLogin, Token
from pydantic import BaseModel
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["auth"])

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if user_in.email and db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
        
    role = db.query(Role).filter(Role.name == "owner").first()
    new_user = User(
        username=user_in.username,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        role_id=role.id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    audit = AuditLog(user_id=new_user.id, action="register")
    db.add(audit)
    db.commit()
    return new_user

@router.post("/login", response_model=Token)
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_in.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    if user.status == "locked":
        raise HTTPException(status_code=403, detail="Account locked")
        
    if not verify_password(user_in.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.MAX_LOGIN_ATTEMPTS:
            user.status = "locked"
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    user.failed_login_count = 0
    db.commit()
    
    audit = AuditLog(user_id=user.id, action="login")
    db.add(audit)
    db.commit()
    
    access_token = create_access_token({"sub": user.username})
    refresh_token = create_refresh_token({"sub": user.username})
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@router.post("/refresh")
def refresh(token_req: RefreshTokenRequest, db: Session = Depends(get_db)):
    payload = decode_token(token_req.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    username = payload.get("sub")
    user = db.query(User).filter(User.username == username).first()
    if not user or user.status == "locked":
        raise HTTPException(status_code=401, detail="Invalid user")
    
    access_token = create_access_token({"sub": user.username})
    return {"access_token": access_token}
