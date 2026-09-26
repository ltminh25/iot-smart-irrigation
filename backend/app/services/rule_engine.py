from sqlalchemy.orm import Session
from app.models.models import Telemetry, Alert, Command, Device
from datetime import datetime, timedelta
import asyncio
import json
from app.core.websocket import manager

class RuleEngine:
    def evaluate(self, db: Session, device_id: int, new_telemetry: Telemetry):
        from app.services.command_service import command_service
        sensor_type = new_telemetry.sensor_type
        value = new_telemetry.value

        def get_latest(stype):
            if stype == sensor_type:
                return value
            latest = db.query(Telemetry).filter(
                Telemetry.device_id == device_id, Telemetry.sensor_type == stype
            ).order_by(Telemetry.timestamp.desc()).first()
            return latest.value if latest else None

        # Rule 1
        if sensor_type == 'light' and value > 10000:
            command_service.create_and_send_command(db, device_id, 'curtain_close', None, None)

        # Rule 2
        if sensor_type == 'rain' and value == 1:
            command_service.create_and_send_command(db, device_id, 'curtain_open', None, None)
            pending_pumps = db.query(Command).filter(
                Command.device_id == device_id, 
                Command.action == 'pump_on',
                Command.status == 'pending'
            ).all()
            for p in pending_pumps:
                p.status = 'failed'
            db.commit()

        # Rule 3
        if sensor_type == 'soil' and value < 30:
            air_temp = get_latest('air_temp')
            rain = get_latest('rain')
            waterlevel = get_latest('waterlevel')
            
            if air_temp is not None and rain is not None and waterlevel is not None:
                if air_temp < 35 and rain == 0 and waterlevel > 0:
                    payload = json.dumps({"duration": 5000})
                    command_service.create_and_send_command(db, device_id, 'pump_on', payload, None)
                elif air_temp >= 35:
                    self._create_alert(db, device_id, "Chờ tưới do nhiệt độ cao", "warning")

        # Rule 4
        if sensor_type == 'waterlevel' and value == 0:
            self._create_alert(db, device_id, "Cần châm nước vào bình chứa", "critical")

        # Rule 5
        if sensor_type in ('air_temp', 'air_humidity'):
            air_temp = get_latest('air_temp')
            air_humidity = get_latest('air_humidity')
            if air_temp is not None and air_humidity is not None:
                if air_temp > 30 and air_humidity > 80:
                    recent_alert = db.query(Alert).filter(
                        Alert.device_id == device_id,
                        Alert.message == "Nguy cơ nấm mốc do nhiệt độ và độ ẩm cao",
                        Alert.status == "open",
                        Alert.created_at >= datetime.utcnow() - timedelta(minutes=30)
                    ).first()
                    if not recent_alert:
                        self._create_alert(db, device_id, "Nguy cơ nấm mốc do nhiệt độ và độ ẩm cao", "warning")

    def _create_alert(self, db: Session, device_id: int, message: str, severity: str):
        alert = Alert(device_id=device_id, message=message, severity=severity)
        db.add(alert)
        db.commit()
        db.refresh(alert)
        
        # Broadcast
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(manager.broadcast(str(device_id), {
                "type": "alert",
                "data": {
                    "id": alert.id,
                    "message": alert.message,
                    "severity": alert.severity,
                    "created_at": alert.created_at.isoformat()
                }
            }))
        except RuntimeError:
            # no running loop
            pass

rule_engine = RuleEngine()
