from sqlalchemy.orm import Session
from app.models.models import Device, DeviceLifecycleLog
import secrets
import random
import string
from fastapi import HTTPException, status

VALID_TRANSITIONS = {
    'registered': ['provisioned', 'decommissioned'],
    'provisioned': ['active', 'decommissioned'],
    'active': ['offline', 'fault', 'maintenance', 'decommissioned'],
    'offline': ['active', 'maintenance', 'decommissioned'],
    'fault': ['maintenance', 'decommissioned'],
    'maintenance': ['active', 'decommissioned'],
}

def change_device_status(db: Session, device: Device, new_status: str, changed_by_user_id: int = None) -> Device:
    current_status = device.status
    if current_status not in VALID_TRANSITIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid current status: {current_status}")
    if new_status not in VALID_TRANSITIONS[current_status]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid transition from {current_status} to {new_status}")
    
    device.status = new_status
    log = DeviceLifecycleLog(
        device_id=device.id,
        from_state=current_status,
        to_state=new_status,
        changed_by=changed_by_user_id
    )
    db.add(log)
    db.commit()
    db.refresh(device)
    return device

def generate_device_uid() -> str:
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"esp32-plant-{random_str}"

def generate_api_key() -> str:
    return secrets.token_urlsafe(32)
