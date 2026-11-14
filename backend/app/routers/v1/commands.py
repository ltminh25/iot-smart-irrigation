from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.models import Command, Device, Role, User
from app.schemas.schemas import CommandCreate, CommandResponse
from typing import List, Optional
from app.services.command_service import command_service

router = APIRouter(prefix="/commands", tags=["commands"])

@router.post("", response_model=CommandResponse)
def create_command(
    cmd_in: CommandCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role("admin", "owner", "viewer"))
):
    device = db.query(Device).filter(Device.id == cmd_in.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    role_name = role.name if role else "viewer"

    # Nếu thiết bị đang ở chế độ bảo trì, chỉ admin mới có thể điều khiển
    if device.status == "maintenance" and role_name != "admin":
        raise HTTPException(status_code=403, detail="Thiết bị đang trong chế độ bảo trì. Không thể điều khiển.")

    # Kiểm tra phân quyền truy cập thiết bị
    if role_name not in ("admin", "viewer") and device.owner_id != current_user.id and device.device_uid != "esp8266-plant-01":
        raise HTTPException(status_code=403, detail="Forbidden")

    # Kiểm tra khóa thiết bị cho vai trò nhân viên / staff (viewer)
    action_lower = (cmd_in.action or "").lower()
    if role_name == "viewer":
        if "pump" in action_lower and device.pump_locked:
            raise HTTPException(
                status_code=403,
                detail="Máy bơm hiện đang bị Admin khóa đối với nhân viên (Staff). Vui lòng liên hệ Admin mở khóa."
            )
        if ("curtain" in action_lower or "roof" in action_lower) and device.curtain_locked:
            raise HTTPException(
                status_code=403,
                detail="Mái che hiện đang bị Admin khóa đối với nhân viên (Staff). Vui lòng liên hệ Admin mở khóa."
            )

    return command_service.create_and_send_command(
        db=db, 
        device_id=cmd_in.device_id, 
        action=cmd_in.action, 
        payload=cmd_in.payload, 
        issued_by_user_id=current_user.id
    )

@router.get("", response_model=List[CommandResponse])
def get_commands(
    device_id: Optional[int] = None, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    role_name = role.name if role else "viewer"

    query = db.query(Command)
    if device_id:
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
            
        if role_name not in ("admin", "viewer") and device.owner_id != current_user.id and device.device_uid != "esp8266-plant-01":
            raise HTTPException(status_code=403, detail="Forbidden")
        query = query.filter(Command.device_id == device_id)
    else:
        # Nếu không truyền device_id: lấy danh sách lệnh theo quyền
        if role_name not in ("admin", "viewer"):
            user_device_ids = [d.id for d in db.query(Device).filter(Device.owner_id == current_user.id).all()]
            query = query.filter(Command.device_id.in_(user_device_ids))

    return query.order_by(Command.issued_at.desc()).limit(100).all()
