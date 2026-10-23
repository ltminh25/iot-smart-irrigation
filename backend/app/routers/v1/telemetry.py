from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Telemetry, Device, Role, User
from app.schemas.schemas import TelemetryResponse
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

def verify_device_access(db: Session, current_user: User, device_id: int):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    role = db.query(Role).filter(Role.id == current_user.role_id).first()
    if role.name not in ("admin", "viewer") and device.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

@router.get("/latest")
def get_latest_telemetry(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    verify_device_access(db, current_user, device_id)
    # 2 cảm biến phần cứng thực tế trên ESP8266: Độ ẩm đất (soil) và Ánh sáng BH1750 (light)
    sensor_types = ["soil", "light"]
    result = {}
    for stype in sensor_types:
        latest = (
            db.query(Telemetry)
            .filter(Telemetry.device_id == device_id, Telemetry.sensor_type == stype)
            .order_by(Telemetry.timestamp.desc())
            .first()
        )
        if latest:
            result[stype] = {
                "id": latest.id,
                "device_id": latest.device_id,
                "sensor_type": latest.sensor_type,
                "value": latest.value,
                "timestamp": latest.timestamp,
                "unit": latest.unit
            }
    return result

@router.get("/export", response_class=PlainTextResponse)
def export_telemetry(
    device_id: int,
    from_date: Optional[datetime] = Query(None, alias="from"),
    to_date: Optional[datetime] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    verify_device_access(db, current_user, device_id)
    query = db.query(Telemetry).filter(
        Telemetry.device_id == device_id,
        Telemetry.sensor_type.in_(["soil", "light"])
    )
    if from_date:
        query = query.filter(Telemetry.timestamp >= from_date)
    if to_date:
        query = query.filter(Telemetry.timestamp <= to_date)
    records = query.order_by(Telemetry.timestamp.asc()).all()

    csv_str = "id,sensor_type,value,unit,timestamp\n"
    for r in records:
        csv_str += f"{r.id},{r.sensor_type},{r.value},{r.unit or ''},{r.timestamp.isoformat()}\n"
    return csv_str

@router.get("", response_model=List[TelemetryResponse])
def get_telemetry(
    device_id: int,
    from_date: Optional[datetime] = Query(None, alias="from"),
    to_date: Optional[datetime] = Query(None, alias="to"),
    sensor_type: Optional[str] = Query(None, alias="type"),
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    verify_device_access(db, current_user, device_id)
    query = db.query(Telemetry).filter(Telemetry.device_id == device_id)
    if from_date:
        query = query.filter(Telemetry.timestamp >= from_date)
    if to_date:
        query = query.filter(Telemetry.timestamp <= to_date)
    if sensor_type:
        query = query.filter(Telemetry.sensor_type == sensor_type)
    else:
        query = query.filter(Telemetry.sensor_type.in_(["soil", "light"]))
    rows = query.order_by(Telemetry.timestamp.desc()).limit(limit).all()
    return list(reversed(rows))
