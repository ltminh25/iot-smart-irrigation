from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime
from typing import Optional, List, Dict, Any

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None

class UserResponse(UserBase):
    id: int
    role_id: int
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    username: str
    password: str

class DeviceBase(BaseModel):
    name: str
    location: Optional[str] = None

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    firmware_version: Optional[str] = None

class DeviceStatusUpdate(BaseModel):
    status: str

class DeviceResponse(DeviceBase):
    id: int
    device_uid: str
    owner_id: int
    status: str
    firmware_version: Optional[str] = None
    last_heartbeat_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TelemetryCreate(BaseModel):
    sensor_type: str
    value: float
    unit: Optional[str] = None

class TelemetryResponse(TelemetryCreate):
    id: int
    device_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class CommandCreate(BaseModel):
    device_id: int
    action: str
    payload: Optional[str] = None

class CommandResponse(BaseModel):
    id: int
    command_id: str
    device_id: int
    action: str
    payload: Optional[str] = None
    issued_by: Optional[int] = None
    status: str
    issued_at: datetime
    executed_at: Optional[datetime] = None
    retry_count: int
    model_config = ConfigDict(from_attributes=True)

class AlertCreate(BaseModel):
    device_id: int
    rule_id: Optional[int] = None
    message: str
    severity: str = "warning"

class AlertResponse(BaseModel):
    id: int
    device_id: int
    rule_id: Optional[int] = None
    message: str
    severity: str
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AlertRuleCreate(BaseModel):
    sensor_type: str
    condition: str
    threshold: float
    action: str
    enabled: bool = True

class AlertRuleResponse(AlertRuleCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    target: Optional[str] = None
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class DeviceLifecycleLogResponse(BaseModel):
    id: int
    device_id: int
    from_state: Optional[str] = None
    to_state: str
    changed_by: Optional[int] = None
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)
