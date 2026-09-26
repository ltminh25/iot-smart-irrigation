import paho.mqtt.client as mqtt
import json
from datetime import datetime
from app.core.config import settings
from app.models.models import Device, Telemetry
from app.services.rule_engine import rule_engine
import asyncio
from app.core.websocket import manager

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
            print("Failed to connect, return code %d\n", rc)

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
                if not device or device.status == "decommissioned":
                    return

                if msg_type == "telemetry" and len(parts) == 4:
                    sensor_type = parts[3]
                    self.handle_telemetry(db, device, sensor_type, payload)
                elif msg_type == "status":
                    self.handle_status(db, device, payload)
                elif msg_type == "ack":
                    self.handle_ack(db, device, payload)
        except Exception as e:
            print(f"Error handling message: {e}")
        finally:
            db.close()

    def handle_telemetry(self, db, device, sensor_type, payload):
        try:
            data = json.loads(payload)
            value = float(data.get("value", 0))
            
            telemetry = Telemetry(
                device_id=device.id,
                sensor_type=sensor_type,
                value=value,
                unit=data.get("unit")
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
            
            # Broadcast
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(manager.broadcast(str(device.id), {
                    "type": "telemetry",
                    "data": {
                        "sensor_type": sensor_type,
                        "value": value,
                        "timestamp": telemetry.timestamp.isoformat()
                    }
                }))
            except RuntimeError:
                pass
                
        except (ValueError, TypeError, json.JSONDecodeError) as e:
            print(f"Invalid telemetry payload: {e}")

    def handle_status(self, db, device, payload):
        device.last_heartbeat_at = datetime.utcnow()
        db.commit()

    def handle_ack(self, db, device, payload):
        from app.services.command_service import command_service
        try:
            data = json.loads(payload)
            command_id = data.get("command_id")
            status = data.get("status")
            if command_id and status:
                command_service.handle_ack(db, command_id, status)
        except Exception as e:
            print(f"Error handling ack: {e}")

    def publish_command(self, device_uid: str, command_id: str, action: str, payload_dict: dict):
        base_action = action.split('_')[0]
        topic = f"plant/{device_uid}/cmd/{base_action}"
        msg = {
            "command_id": command_id,
            "action": action,
            **payload_dict
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
