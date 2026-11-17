from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Alert, Device, User
from app.schemas.schemas import AlertResponse
from typing import List, Optional

router = APIRouter(prefix="/alerts", tags=["alerts"])

def verify_alert_update_access(db: Session, current_user: User, device_id: int):
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    is_admin = current_user.role is not None and current_user.role.name == "admin"
    if not is_admin and device.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

@router.get("", response_model=List[AlertResponse])
def get_alerts(
    device_id: Optional[int] = None, 
    status: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    can_view_all = current_user.role is not None and current_user.role.name in ("admin", "viewer")

    query = db.query(Alert)
    if device_id is not None:
        device = db.get(Device, device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        if not can_view_all and device.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        query = query.filter(Alert.device_id == device_id)
    elif not can_view_all:
        owned_devices = select(Device.id).where(Device.owner_id == current_user.id)
        query = query.filter(Alert.device_id.in_(owned_devices))

    if status:
        query = query.filter(Alert.status == status)
    return query.order_by(Alert.created_at.desc()).limit(150).all()

@router.put("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    verify_alert_update_access(db, current_user, alert.device_id)
    
    alert.status = "acknowledged"
    db.commit()
    db.refresh(alert)
    return alert

@router.put("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    verify_alert_update_access(db, current_user, alert.device_id)
    
    alert.status = "resolved"
    db.commit()
    db.refresh(alert)
    return alert
