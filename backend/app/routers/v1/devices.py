from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.core.database import get_db
from app.core.deps import get_current_user, require_role, get_device_or_403
from app.models.models import Device, Role, DeviceLifecycleLog, User
from app.schemas.schemas import DeviceCreate, DeviceResponse, DeviceUpdate, DeviceStatusUpdate, DeviceLifecycleLogResponse
from typing import List
from app.services.device_service import generate_device_uid, generate_api_key, change_device_status

router = APIRouter(prefix="/devices", tags=["devices"])

def can_view_device(db: Session, current_user: User, device: Device) -> bool:
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    if role and role.name in ("admin", "viewer"):
        return True
    return device.owner_id == current_user.id or device.device_uid == "esp8266-plant-01"

@router.get("", response_model=List[DeviceResponse])
def get_devices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_role = db.query(Role).filter(Role.id == current_user.role_id).first()
    if user_role.name in ("admin", "viewer"):
        return db.query(Device).all()
    return db.query(Device).filter(
        or_(Device.owner_id == current_user.id, Device.device_uid == "esp8266-plant-01")
    ).all()

@router.post("", response_model=DeviceResponse)
def create_device(device_in: DeviceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role("admin", "owner"))):
    uid = device_in.device_uid.strip() if device_in.device_uid and device_in.device_uid.strip() else generate_device_uid()
    existing = db.query(Device).filter(Device.device_uid == uid).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã thiết bị '{uid}' đã tồn tại trong hệ thống. Vui lòng chọn mã khác."
        )
    new_device = Device(
        device_uid=uid,
        name=device_in.name,
        location=device_in.location,
        owner_id=current_user.id,
        api_key=generate_api_key(),
        status="registered"
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    return new_device

@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(device_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not can_view_device(db, current_user, device):
        raise HTTPException(status_code=403, detail="Forbidden")
    return device

@router.put("/{device_id}/status", response_model=DeviceResponse)
def update_device_status(device_id: int, req: DeviceStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role("admin", "owner"))):
    device = get_device_or_403(device_id, current_user, db)
    return change_device_status(db, device, req.status, current_user.id)

@router.put("/{device_id}/config", response_model=DeviceResponse)
def update_device_config(device_id: int, req: DeviceUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role("admin", "owner"))):
    device = get_device_or_403(device_id, current_user, db)
    if req.name is not None:
        device.name = req.name
    if req.location is not None:
        device.location = req.location
    if req.firmware_version is not None:
        device.firmware_version = req.firmware_version
    db.commit()
    db.refresh(device)
    return device

@router.get("/{device_id}/lifecycle", response_model=List[DeviceLifecycleLogResponse])
def get_device_lifecycle(device_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not can_view_device(db, current_user, device):
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.query(DeviceLifecycleLog).filter(DeviceLifecycleLog.device_id == device_id).order_by(DeviceLifecycleLog.timestamp.desc()).all()
