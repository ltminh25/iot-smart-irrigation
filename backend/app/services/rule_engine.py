from sqlalchemy.orm import Session
from app.models.models import Telemetry, Alert, Command
from datetime import datetime, timedelta, timezone
import json
from app.core.websocket import manager

PUMP_REST_SECONDS = 1
MAX_PUMP_DURATION_MS = 10000  # Same limit as the ESP8266 firmware.
CURTAIN_ACTIONS = ("curtain_open", "curtain_close")

class RuleEngine:
    """
    Rule Engine đánh giá dữ liệu thời gian thực từ phần cứng ESP8266:
      - Cảm biến độ ẩm đất (soil, %)
      - Cảm biến ánh sáng BH1750 (light, lux)
    Điều khiển tự động:
      - Máy bơm nước qua Relay D5 (pump_on / pump_off)
      - Mái che qua Servo D6 (curtain_open 60° / curtain_close 120°)
    """

    def evaluate(self, db: Session, device_id: int, new_telemetry: Telemetry):
        from app.services.command_service import DEFAULT_PUMP_DURATION_MS, command_service
        sensor_type = new_telemetry.sensor_type
        value = new_telemetry.value

        def get_latest(stype: str):
            if stype == sensor_type:
                return value
            latest = db.query(Telemetry).filter(
                Telemetry.device_id == device_id,
                Telemetry.sensor_type == stype
            ).order_by(Telemetry.timestamp.desc()).first()
            return latest.value if latest and isinstance(latest.value, (int, float)) else None

        # Luật 1: Cường độ ánh sáng cao (> 7500 lux) -> Đóng mái che (góc 120°) + Cảnh báo
        if sensor_type == "light" and value > 7500:
            command_service.create_and_send_command(db, device_id, "curtain_close", None, None)
            self._create_alert_if_not_recent(
                db,
                device_id,
                "Cường độ ánh sáng cao (> 7500 lux), hệ thống tự động đóng mái che",
                "warning",
                minutes=15
            )

        # Luật 2: Ánh sáng dịu trở lại (< 2000 lux) -> Chỉ tự mở mái che nếu lần đóng gần nhất là TỰ ĐỘNG (issued_by=None)
        # Không tự mở đè lên lệnh đóng thủ công của người dùng khi test trong phòng (< 2000 lux)
        elif sensor_type == "light" and value < 2000:
            last_curtain_action = self._get_last_curtain_action(db, device_id)
            if last_curtain_action == "curtain_close":
                command_service.create_and_send_command(db, device_id, "curtain_open", None, None)

        # Luật 3 & 4: Độ ẩm đất thấp (< 30%) -> Xét điều kiện ánh sáng để tự động bật bơm 5 giây
        if sensor_type == "soil" and value < 30:
            latest_light = get_latest("light")

            # Luật 4: Đất quá khô (< 15%) -> Cảnh báo khẩn cấp kiểm tra nguồn nước/bơm
            if value < 15:
                self._create_alert_if_not_recent(
                    db,
                    device_id,
                    "Độ ẩm đất quá thấp (< 15%)! Vui lòng kiểm tra máy bơm và nguồn nước",
                    "critical",
                    minutes=15
                )

            # Nếu trời đang quá nắng gắt (> 15000 lux) -> Hoãn tưới để tránh sốc nhiệt cho rễ
            if latest_light is not None and latest_light > 15000:
                self._create_alert_if_not_recent(
                    db,
                    device_id,
                    "Đất khô (< 30%) nhưng ánh sáng quá gắt (> 15000 lux), tạm chờ tưới để tránh sốc nhiệt",
                    "warning",
                    minutes=15
                )
            else:
                # Tự động bật bơm 5 giây nếu đã qua khoảng chờ giữa các lần tưới.
                if self._can_start_pump(db, device_id):
                    payload = json.dumps({"duration": DEFAULT_PUMP_DURATION_MS})
                    command_service.create_and_send_command(db, device_id, "pump_on", payload, None)

    def _can_start_pump(self, db: Session, device_id: int) -> bool:
        from app.services.command_service import (
            COMMAND_RETRY_INTERVAL_SECONDS, DEFAULT_PUMP_DURATION_MS, parse_payload_dict,
        )

        last_start = db.query(Command).filter(
            Command.device_id == device_id, Command.action == "pump_on",
        ).order_by(Command.issued_at.desc(), Command.id.desc()).first()
        if last_start is None:
            return True
        if last_start.status == "pending":
            return False

        duration = parse_payload_dict(last_start.payload).get("duration", DEFAULT_PUMP_DURATION_MS)
        try:
            duration_ms = int(duration) if not isinstance(duration, bool) else DEFAULT_PUMP_DURATION_MS
        except (TypeError, ValueError, OverflowError):
            duration_ms = DEFAULT_PUMP_DURATION_MS
        if duration_ms <= 0:
            duration_ms = DEFAULT_PUMP_DURATION_MS
        duration_ms = min(duration_ms, MAX_PUMP_DURATION_MS)

        last_retry_seconds = (last_start.retry_count or 0) * COMMAND_RETRY_INTERVAL_SECONDS
        started_at = last_start.executed_at or (
            last_start.issued_at + timedelta(seconds=last_retry_seconds)
        )
        next_start = started_at + timedelta(milliseconds=duration_ms, seconds=PUMP_REST_SECONDS)
        return datetime.utcnow() >= next_start

    def _get_last_curtain_action(self, db: Session, device_id: int):
        try:
            last_cmd = db.query(Command).filter(
                Command.device_id == device_id,
                Command.action.in_(CURTAIN_ACTIONS)
            ).order_by(Command.issued_at.desc()).first()
            # Chỉ trả về "curtain_close" nếu lệnh đóng đó là lệnh tự động (issued_by is None)
            if last_cmd and getattr(last_cmd, "issued_by", None) is None and isinstance(getattr(last_cmd, "action", None), str):
                return last_cmd.action
        except Exception:
            pass
        return None

    def _create_alert_if_not_recent(self, db: Session, device_id: int, message: str, severity: str, minutes: int = 15):
        try:
            cutoff = datetime.utcnow() - timedelta(minutes=minutes)
            recent_alert = db.query(Alert).filter(
                Alert.device_id == device_id,
                Alert.message == message,
                Alert.status == "open",
                Alert.created_at >= cutoff
            ).first()
            if recent_alert and getattr(recent_alert, "id", None) is not None:
                return
        except Exception:
            pass
        self._create_alert(db, device_id, message, severity)

    def _create_alert(self, db: Session, device_id: int, message: str, severity: str):
        alert = Alert(device_id=device_id, message=message, severity=severity)
        db.add(alert)
        db.commit()
        db.refresh(alert)

        manager.broadcast_sync(str(device_id), {
            "type": "alert",
            "data": {
                "id": alert.id,
                "message": alert.message,
                "severity": alert.severity,
                "created_at": (alert.created_at.replace(tzinfo=timezone.utc) if alert.created_at and alert.created_at.tzinfo is None else alert.created_at).isoformat() if alert.created_at else None
            }
        })

rule_engine = RuleEngine()
