from sqlalchemy.orm import Session
from app.models.models import Command, AuditLog, Device
from uuid import uuid4
import threading
from datetime import datetime
from app.services.mqtt_client import mqtt_client_instance

class CommandService:
    def __init__(self):
        self._pending_acks = {}

    def create_and_send_command(self, db: Session, device_id: int, action: str, payload: str = None, issued_by_user_id: int = None) -> Command:
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            raise Exception("Device not found")

        command_id = f"cmd-{uuid4().hex[:8]}"
        command = Command(
            command_id=command_id,
            device_id=device_id,
            action=action,
            payload=payload,
            issued_by=issued_by_user_id,
            status="pending"
        )
        db.add(command)
        
        if issued_by_user_id:
            audit = AuditLog(
                user_id=issued_by_user_id,
                action="send_command",
                target=f"device_id:{device_id}, action:{action}"
            )
            db.add(audit)
            
        db.commit()
        db.refresh(command)

        # Publish
        payload_dict = {"payload": payload} if payload else {}
        if mqtt_client_instance:
            mqtt_client_instance.publish_command(device.device_uid, command_id, action, payload_dict)

        # Schedule retry
        timer = threading.Timer(5.0, self._retry_task, args=(device_id, command_id, 1))
        timer.start()

        return command

    def handle_ack(self, db: Session, command_id: str, status: str):
        command = db.query(Command).filter(Command.command_id == command_id).first()
        if command and command.status == "pending":
            command.status = status
            command.executed_at = datetime.utcnow()
            db.commit()

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
                return

            command.retry_count = attempt
            db.commit()

            device = db.query(Device).filter(Device.id == device_id).first()
            if device and mqtt_client_instance:
                payload_dict = {"payload": command.payload} if command.payload else {}
                mqtt_client_instance.publish_command(device.device_uid, command_id, command.action, payload_dict)

            # Schedule next retry
            timer = threading.Timer(5.0, self._retry_task, args=(device_id, command_id, attempt + 1))
            timer.start()
        finally:
            db.close()

command_service = CommandService()
