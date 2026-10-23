from sqlalchemy.orm import Session
from app.models.models import Command, AuditLog, Device
from app.core.websocket import manager
from uuid import uuid4
import threading
import json
from datetime import datetime
from app.services.mqtt_client import mqtt_client_instance

ACTION_ALIASES = {
    "roof_open": "curtain_open",
    "roof_close": "curtain_close",
}

def normalize_action(action: str) -> str:
    act = (action or "").strip().lower()
    return ACTION_ALIASES.get(act, act)

def parse_payload_dict(payload: str = None) -> dict:
    if not payload:
        return {}
    try:
        parsed = json.loads(payload)
        if isinstance(parsed, dict):
            return parsed
        return {"payload": payload}
    except Exception:
        return {"payload": payload}

class CommandService:
    def __init__(self):
        self._pending_acks = {}

    def create_and_send_command(self, db: Session, device_id: int, action: str, payload: str = None, issued_by_user_id: int = None) -> Command:
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise Exception("Device not found")

        normalized_action = normalize_action(action)
        if normalized_action == "pump_on" and not payload:
            payload = json.dumps({"duration": 5000})

        # Huỷ các lệnh đang pending cùng nhóm cơ cấu chấp hành (pump hoặc curtain)
        # để tránh retry lệnh cũ đè lên lệnh mới (gây hiện tượng đóng-mở lặp lại)
        base_group = normalized_action.split("_")[0]  # "pump" hoặc "curtain"
        old_pending = db.query(Command).filter(
            Command.device_id == device_id,
            Command.status == "pending",
            Command.action.like(f"{base_group}_%")
        ).all()
        for old_cmd in old_pending:
            old_cmd.status = "failed"

        command_id = f"cmd-{uuid4().hex[:8]}"
        command = Command(
            command_id=command_id,
            device_id=device_id,
            action=normalized_action,
            payload=payload,
            issued_by=issued_by_user_id,
            status="pending"
        )
        db.add(command)
        
        if issued_by_user_id:
            audit = AuditLog(
                user_id=issued_by_user_id,
                action="send_command",
                target=f"device_id:{device_id}, action:{normalized_action}"
            )
            db.add(audit)
            
        db.commit()
        db.refresh(command)

        # Publish
        payload_dict = parse_payload_dict(payload)
        if mqtt_client_instance:
            mqtt_client_instance.publish_command(device.device_uid, command_id, normalized_action, payload_dict)

        # Schedule retry
        timer = threading.Timer(5.0, self._retry_task, args=(device_id, command_id, 1))
        timer.daemon = True
        timer.start()

        return command

    def handle_ack(self, db: Session, command_id: str, status: str):
        command = db.query(Command).filter(Command.command_id == command_id).first()
        if command and command.status == "pending":
            command.status = status
            command.executed_at = datetime.utcnow()
            db.commit()
            db.refresh(command)

            manager.broadcast_sync(str(command.device_id), {
                "type": "command_ack",
                "data": {
                    "command_id": command.command_id,
                    "action": command.action,
                    "status": command.status,
                    "executed_at": command.executed_at.isoformat() if command.executed_at else None
                }
            })

    def _retry_task(self, device_id: int, command_id: str, attempt: int):
        from app.core.database import SessionLocal
        db = SessionLocal()
        try:
            command = db.query(Command).filter(Command.command_id == command_id).first()
            if not command or command.status != "pending":
                return

            if attempt >= 3:
                command.status = "failed"
                db.commit()
                manager.broadcast_sync(str(device_id), {
                    "type": "command_ack",
                    "data": {
                        "command_id": command.command_id,
                        "action": command.action,
                        "status": "failed"
                    }
                })
                return

            command.retry_count = attempt
            db.commit()

            device = db.query(Device).filter(Device.id == device_id).first()
            if device and mqtt_client_instance:
                payload_dict = parse_payload_dict(command.payload)
                mqtt_client_instance.publish_command(device.device_uid, command_id, command.action, payload_dict)

            # Schedule next retry
            timer = threading.Timer(5.0, self._retry_task, args=(device_id, command_id, attempt + 1))
            timer.daemon = True
            timer.start()
        finally:
            db.close()

command_service = CommandService()
