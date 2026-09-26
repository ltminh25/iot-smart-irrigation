from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from app.core.database import SessionLocal
from app.models.models import Device, Alert
from app.services.device_service import change_device_status
from app.core.config import settings
from app.core.websocket import manager
import asyncio

scheduler = BackgroundScheduler()

def check_heartbeats():
    db = SessionLocal()
    try:
        timeout_threshold = datetime.utcnow() - timedelta(seconds=settings.HEARTBEAT_TIMEOUT_SECONDS)
        active_devices = db.query(Device).filter(Device.status == 'active').all()
        for device in active_devices:
            if device.last_heartbeat_at is None or device.last_heartbeat_at < timeout_threshold:
                change_device_status(db, device, 'offline')
                alert = Alert(
                    device_id=device.id,
                    message=f"Thiết bị {device.name} mất kết nối",
                    severity="critical"
                )
                db.add(alert)
                db.commit()
                
                # Broadcast
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(manager.broadcast(str(device.id), {
                        "type": "alert",
                        "data": {
                            "message": alert.message,
                            "severity": alert.severity
                        }
                    }))
                except RuntimeError:
                    pass
    finally:
        db.close()

def start_heartbeat_checker():
    scheduler.add_job(check_heartbeats, 'interval', seconds=settings.HEARTBEAT_CHECK_INTERVAL)
    scheduler.start()

def stop_heartbeat_checker():
    scheduler.shutdown()
