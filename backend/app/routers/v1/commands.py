from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.models import Command, Device, Role, User
from app.schemas.schemas import CommandCreate, CommandResponse
from typing import List
from app.services.command_service import command_service

router = APIRouter(prefix="/commands", tags=["commands"])

@router.post("", response_model=CommandResponse)
def create_command(
    cmd_in: CommandCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role("admin", "owner"))
):
    device = db.query(Device).filter(Device.id == cmd_in.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    if role.name != "admin" and device.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    return command_service.create_and_send_command(
        db=db, 
        device_id=cmd_in.device_id, 
        action=cmd_in.action, 
        payload=cmd_in.payload, 
        issued_by_user_id=current_user.id
    )

@router.get("", response_model=List[CommandResponse])
def get_commands(
    device_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    if role.name != "admin" and device.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    return db.query(Command).filter(Command.device_id == device_id).order_by(Command.issued_at.desc()).all()
