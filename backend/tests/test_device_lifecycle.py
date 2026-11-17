from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import database
from app.main import app
from app.models.models import Command, Device, User
from app.services.command_service import command_service, mqtt_client_instance
from app.services.device_service import change_device_status


@pytest.fixture
def sessions(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'lifecycle.db').as_posix()}")
    factory = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", factory)
    database.init_db()
    yield factory
    engine.dispose()


def admin_headers(client):
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_admin_profile_works_on_fresh_and_upgraded_databases(sessions):
    client = TestClient(app)
    headers = admin_headers(client)
    profile = client.get("/api/v1/users/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["email"] is None

    with sessions.begin() as db:
        db.query(User).filter_by(username="admin").one().email = "admin@iot.local"
    database.init_db()

    profile = client.get("/api/v1/users/me", headers=admin_headers(client))
    assert profile.status_code == 200
    assert profile.json()["role"] == "admin"
    assert profile.json()["email"] is None
    assert client.get("/api/v1/users", headers=headers).status_code == 200


def test_decommission_stops_commands_and_survives_restart(sessions, monkeypatch):
    client = TestClient(app)
    headers = admin_headers(client)
    publish = Mock()
    monkeypatch.setattr(mqtt_client_instance, "publish_command", publish)

    with sessions.begin() as db:
        device_id = db.query(Device).filter_by(device_uid="esp8266-plant-01").one().id
        db.add(Command(command_id="pending-pump", device_id=device_id, action="pump_on", status="pending"))

    response = client.put(f"/api/v1/devices/{device_id}/status", headers=headers, json={"status": "decommissioned"})
    assert response.status_code == 200
    assert response.json()["status"] == "decommissioned"

    database.init_db()
    response = client.post("/api/v1/commands", headers=headers, json={"device_id": device_id, "action": "pump_on"})
    assert response.status_code == 409
    command_service._retry_task(device_id, "pending-pump", 1)

    with sessions() as db:
        assert db.get(Device, device_id).status == "decommissioned"
        command = db.query(Command).one()
        assert command.status == "failed"
        assert command.retry_count == 0
    publish.assert_not_called()


def test_stale_device_status_cannot_undo_decommission(sessions):
    with sessions() as mqtt_db, sessions() as api_db:
        mqtt_device = mqtt_db.query(Device).filter_by(device_uid="esp8266-plant-01").one()
        device = api_db.get(Device, mqtt_device.id)
        change_device_status(api_db, device, "decommissioned")

        result = change_device_status(mqtt_db, mqtt_device, "offline")
        assert result.status == "decommissioned"
