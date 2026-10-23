from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings
from passlib.context import CryptContext
import secrets

engine = create_engine(
    settings.DB_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    # Nhập models tại đây để SQLAlchemy Base thu thập meta
    from app.models.models import Role, User, Device, DeviceLifecycleLog, AlertRule
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Seed roles
        roles = ["admin", "owner", "viewer"]
        for role_name in roles:
            existing = db.query(Role).filter(Role.name == role_name).first()
            if not existing:
                db.add(Role(name=role_name))
        db.commit()

        # 2. Seed admin user
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        admin_user = db.query(User).filter(User.username == "admin").first()
        if admin_role and not admin_user:
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            hashed_pw = pwd_context.hash("admin123")
            admin_user = User(
                username="admin", 
                password_hash=hashed_pw, 
                email="admin@iot.local", 
                role_id=admin_role.id
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)

        # 3. Seed thiết bị phần cứng mặc định esp8266-plant-01
        if admin_user:
            default_device = db.query(Device).filter(Device.device_uid == "esp8266-plant-01").first()
            if not default_device:
                default_device = Device(
                    device_uid="esp8266-plant-01",
                    name="Node Chăm Sóc Cây ESP8266",
                    owner_id=admin_user.id,
                    location="Vườn cây / Ban công",
                    status="active",
                    firmware_version="1.0.0",
                    api_key=secrets.token_urlsafe(32)
                )
                db.add(default_device)
                db.commit()
                db.refresh(default_device)

                db.add(DeviceLifecycleLog(
                    device_id=default_device.id,
                    from_state="registered",
                    to_state="active",
                    changed_by=admin_user.id
                ))
                db.commit()
            elif default_device.status == "decommissioned":
                default_device.status = "active"
                db.commit()

        # 4. Seed cấu hình luật cảnh báo/tự động mặc định cho Độ ẩm đất & Ánh sáng BH1750
        if db.query(AlertRule).count() == 0:
            default_rules = [
                AlertRule(sensor_type="soil", condition="lt", threshold=30.0, action="auto_pump_on", enabled=True),
                AlertRule(sensor_type="soil", condition="lt", threshold=15.0, action="trigger_alert", enabled=True),
                AlertRule(sensor_type="light", condition="gt", threshold=7500.0, action="curtain_close", enabled=True),
                AlertRule(sensor_type="light", condition="lt", threshold=2000.0, action="curtain_open", enabled=True),
            ]
            db.add_all(default_rules)
            db.commit()
    finally:
        db.close()
