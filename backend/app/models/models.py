from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    email = Column(String, unique=True, index=True, nullable=True)
    role_id = Column(Integer, ForeignKey("roles.id"))
    status = Column(String, default="active")
    failed_login_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    role = relationship("Role")

class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, index=True)
    device_uid = Column(String, unique=True, index=True)
    name = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    location = Column(String, nullable=True)
    status = Column(String, default="registered")
    firmware_version = Column(String, nullable=True)
    api_key = Column(String, unique=True, index=True)
    last_heartbeat_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class DeviceLifecycleLog(Base):
    __tablename__ = "device_lifecycle_log"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    from_state = Column(String, nullable=True)
    to_state = Column(String)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Telemetry(Base):
    __tablename__ = "telemetry"
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    sensor_type = Column(String)
    value = Column(Float)
    unit = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Command(Base):
    __tablename__ = "commands"
    id = Column(Integer, primary_key=True, index=True)
    command_id = Column(String, unique=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    action = Column(String)
    payload = Column(String, nullable=True)
    issued_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="pending")
    issued_at = Column(DateTime, default=datetime.utcnow)
    executed_at = Column(DateTime, nullable=True)
    retry_count = Column(Integer, default=0)

class AlertRule(Base):
    __tablename__ = "alert_rules"
    id = Column(Integer, primary_key=True, index=True)
    sensor_type = Column(String)
    condition = Column(String)
    threshold = Column(Float)
    action = Column(String)
    enabled = Column(Boolean, default=True)

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    rule_id = Column(Integer, ForeignKey("alert_rules.id"), nullable=True)
    message = Column(String)
    severity = Column(String, default="warning")
    status = Column(String, default="open")
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String)
    target = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
