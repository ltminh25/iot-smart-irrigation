from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, field_serializer
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserBase(BaseModel):
    username: str
    email: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[str] = None

class UserResponse(UserBase):
    id: int
    role_id: int
    role: Optional[str] = None
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

    @field_validator("role", mode="before")
    @classmethod
    def extract_role_name(cls, v):
        if hasattr(v, "name"):
            return v.name
        return v

class UserLogin(BaseModel):
    username: str
    password: str

class DeviceBase(BaseModel):
    name: str
    location: Optional[str] = None

class DeviceCreate(DeviceBase):
    device_uid: Optional[str] = None

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    firmware_version: Optional[str] = None
    pump_locked: Optional[bool] = None
    curtain_locked: Optional[bool] = None

class DeviceStatusUpdate(BaseModel):
    status: str

class DeviceLockUpdate(BaseModel):
    pump_locked: Optional[bool] = None
    curtain_locked: Optional[bool] = None

class DeviceResponse(DeviceBase):
    id: int
    device_uid: str
    owner_id: int
    status: str
    firmware_version: Optional[str] = None
    api_key: Optional[str] = None
    pump_locked: Optional[bool] = False
    curtain_locked: Optional[bool] = False
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

    @field_serializer("timestamp")
    def serialize_timestamp(self, dt: datetime, _info):
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat() if dt else None

class CommandCreate(BaseModel):
    device_id: int
    action: str
    payload: Optional[str] = None

class CommandResponse(BaseModel):
    id: int
    command_id: str
    device_id: int
    action: str
    action_name: Optional[str] = None
    payload: Optional[str] = None
    issued_by: Optional[int] = None
    username: Optional[str] = None
    status: str
    issued_at: datetime
    executed_at: Optional[datetime] = None
    retry_count: int
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("issued_at", "executed_at")
    def serialize_cmd_times(self, dt: Optional[datetime], _info):
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat() if dt else None

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

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime, _info):
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat() if dt else None

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

    @field_serializer("timestamp")
    def serialize_timestamp(self, dt: datetime, _info):
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat() if dt else None

class DeviceLifecycleLogResponse(BaseModel):
    id: int
    device_id: int
    from_state: Optional[str] = None
    to_state: str
    changed_by: Optional[int] = None
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("timestamp")
    def serialize_timestamp(self, dt: datetime, _info):
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat() if dt else None
