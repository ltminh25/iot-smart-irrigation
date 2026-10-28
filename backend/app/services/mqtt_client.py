import paho.mqtt.client as mqtt
import json
from datetime import datetime
from app.core.config import settings
from app.models.models import Device, Telemetry
from app.services.rule_engine import rule_engine
from app.core.websocket import manager

VALID_RANGES = {
    "soil": (0.0, 100.0),
    "light": (0.0, 200000.0),
}

DEFAULT_UNITS = {
    "soil": "%",
    "light": "lux",
}

class MQTTClientWrapper:
    def __init__(self):
        self.client = mqtt.Client()
        if settings.MQTT_USERNAME and settings.MQTT_PASSWORD:
            self.client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("Connected to MQTT Broker!")
            client.subscribe("plant/+/telemetry/+")
            client.subscribe("plant/+/status")
            client.subscribe("plant/+/ack")
        else:
            print(f"Failed to connect, return code {rc}")

    def on_message(self, client, userdata, msg):
        from app.core.database import SessionLocal
        db = SessionLocal()
        try:
            topic = msg.topic
            payload = msg.payload.decode()
            parts = topic.split('/')
            
            if len(parts) >= 3 and parts[0] == "plant":
                device_uid = parts[1]
                msg_type = parts[2]
                
                device = db.query(Device).filter(Device.device_uid == device_uid).first()
                if not device:
                    return

                # Luôn xử lý ACK để dừng bộ đếm retry lệnh
                if msg_type == "ack":
                    self.handle_ack(db, device, payload)
                    return

                if device.status in ("decommissioned", "maintenance"):
                    return

                if msg_type == "telemetry" and len(parts) == 4:
                    sensor_type = parts[3]
                    self.handle_telemetry(db, device, sensor_type, payload)
                elif msg_type == "status":
                    self.handle_status(db, device, payload)
        except Exception as e:
            print(f"Error handling message: {e}")
        finally:
            db.close()

    def handle_telemetry(self, db, device, sensor_type, payload):
        try:
            data = json.loads(payload)
            value = float(data.get("value", 0))

            # Nếu bản tin soil có kèm giá trị ADC thô ("raw"), tính lại % theo dải thực tế của mạch 3.3V
            # (Khô ngoài không khí: raw ~ 1020 -> 0%, Ngâm toàn bộ trong nước: raw ~ 820 -> 100%)
            if sensor_type == "soil" and data.get("raw") is not None:
                raw_adc = float(data.get("raw"))
                adc_dry, adc_wet = 1020.0, 820.0
                calc_pct = (adc_dry - raw_adc) * 100.0 / (adc_dry - adc_wet)
                value = round(max(0.0, min(100.0, calc_pct)), 1)

            # Validate khoảng giá trị hợp lệ
            if sensor_type in VALID_RANGES:
                min_v, max_v = VALID_RANGES[sensor_type]
                if value < min_v or value > max_v:
                    print(f"Rejected out-of-range telemetry {sensor_type}={value} from {device.device_uid}")
                    return

            unit = data.get("unit") or DEFAULT_UNITS.get(sensor_type)
            telemetry = Telemetry(
                device_id=device.id,
                sensor_type=sensor_type,
                value=value,
                unit=unit
            )
            db.add(telemetry)
            
            device.last_heartbeat_at = datetime.utcnow()
            if device.status in ["registered", "provisioned", "offline"]:
                from app.services.device_service import change_device_status
                change_device_status(db, device, "active")
            else:
                db.commit()

            db.refresh(telemetry)
            rule_engine.evaluate(db, device.id, telemetry)
            
            # Broadcast realtime qua WebSocket
            manager.broadcast_sync(str(device.id), {
                "type": "telemetry",
                "data": {
                    "id": telemetry.id,
                    "device_id": device.id,
                    "sensor_type": sensor_type,
                    "value": value,
                    "unit": unit,
                    "timestamp": telemetry.timestamp.isoformat()
                }
            })
                
        except (ValueError, TypeError, json.JSONDecodeError) as e:
            print(f"Invalid telemetry payload: {e}")

    def handle_status(self, db, device, payload):
        from app.services.device_service import change_device_status
        try:
            data = json.loads(payload)
        except Exception:
            data = {"status": "online"}

        reported_status = str(data.get("status", "online")).lower()
        fw_version = data.get("firmwareVersion") or data.get("firmware_version")
        if fw_version:
            device.firmware_version = str(fw_version)

        if reported_status == "offline":
            if device.status == "active":
                change_device_status(db, device, "offline")
        else:
            device.last_heartbeat_at = datetime.utcnow()
            if device.status in ["registered", "provisioned", "offline"]:
                change_device_status(db, device, "active")
            else:
                db.commit()

    def handle_ack(self, db, device, payload):
        from app.services.command_service import command_service
        try:
            data = json.loads(payload)
            command_id = data.get("command_id") or data.get("commandId")
            status = data.get("status")
            if command_id and status:
                command_service.handle_ack(db, command_id, status)
        except Exception as e:
            print(f"Error handling ack: {e}")

    def publish_command(self, device_uid: str, command_id: str, action: str, payload_dict: dict):
        norm_action = (action or "").strip().lower()
        if norm_action in ("roof_open", "curtain_open"):
            norm_action = "curtain_open"
        elif norm_action in ("roof_close", "curtain_close"):
            norm_action = "curtain_close"

        base_action = norm_action.split('_')[0]
        topic = f"plant/{device_uid}/cmd/{base_action}"
        msg = {
            "command_id": command_id,
            "commandId": command_id,
            "deviceId": device_uid,
            "action": norm_action,
            **(payload_dict or {})
        }
        self.client.publish(topic, json.dumps(msg), qos=1)

    def start(self):
        try:
            self.client.connect(settings.MQTT_BROKER_URL, settings.MQTT_PORT, 60)
            self.client.loop_start()
        except Exception as e:
            print(f"Failed to start MQTT: {e}")

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()

mqtt_client_instance = MQTTClientWrapper()

def start_mqtt():
    mqtt_client_instance.start()
