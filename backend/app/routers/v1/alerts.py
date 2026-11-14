from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Alert, Device, Role, User
from app.schemas.schemas import AlertResponse
from typing import List, Optional

router = APIRouter(prefix="/alerts", tags=["alerts"])

def verify_device_access(db: Session, current_user: User, device_id: int):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    if role.name != "admin" and device.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

@router.get("", response_model=List[AlertResponse])
def get_alerts(
    device_id: Optional[int] = None, 
    status: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    role_name = role.name if role else "viewer"

    query = db.query(Alert)
    if device_id:
        verify_device_access(db, current_user, device_id)
        query = query.filter(Alert.device_id == device_id)
    else:
        if role_name not in ("admin", "viewer"):
            user_device_ids = [d.id for d in db.query(Device).filter(Device.owner_id == current_user.id).all()]
            query = query.filter(Alert.device_id.in_(user_device_ids))

    if status:
        query = query.filter(Alert.status == status)
    return query.order_by(Alert.created_at.desc()).limit(150).all()

@router.put("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    verify_device_access(db, current_user, alert.device_id)
    
    alert.status = "acknowledged"
    db.commit()
    db.refresh(alert)
    return alert

@router.put("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    verify_device_access(db, current_user, alert.device_id)
    
    alert.status = "resolved"
    db.commit()
    db.refresh(alert)
    return alert
