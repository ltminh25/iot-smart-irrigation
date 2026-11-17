import csv
from io import StringIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import database
from app.core.security import create_access_token
from app.main import app
from app.models.models import Device, Role, Telemetry, User


@pytest.fixture
def telemetry_api(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'telemetry-access.db').as_posix()}")
    database.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(database, "SessionLocal", sessions)

    with sessions.begin() as db:
        admin = User(username="admin", role=Role(name="admin"))
        owner = User(username="owner", role=Role(name="owner"))
        db.add_all([admin, owner])
        db.flush()
        shared = Device(device_uid="esp8266-plant-01", name="ESP8266", owner_id=admin.id)
        private = Device(device_uid="admin-private", name="Private device", owner_id=admin.id)
        db.add_all([shared, private])
        db.flush()
        shared_id, private_id = shared.id, private.id
        db.add_all([
            Telemetry(device_id=shared_id, sensor_type="soil", value=60, unit="%"),
            Telemetry(device_id=private_id, sensor_type="soil", value=80, unit="%"),
        ])

    token = create_access_token({"sub": "owner"})
    yield TestClient(app, headers={"Authorization": f"Bearer {token}"}), shared_id, private_id
    engine.dispose()


@pytest.mark.parametrize("suffix", ["/latest", "", "/export"])
def test_owner_can_read_shared_device_telemetry_only(telemetry_api, suffix):
    client, shared_id, private_id = telemetry_api
    devices = client.get("/api/v1/devices")
    assert devices.status_code == 200
    assert [device["id"] for device in devices.json()] == [shared_id]

    endpoint = f"/api/v1/telemetry{suffix}"
    response = client.get(endpoint, params={"device_id": shared_id})
    assert response.status_code == 200
    if suffix == "/latest":
        assert response.json()["soil"]["value"] == 60
    elif suffix == "/export":
        rows = list(csv.DictReader(StringIO(response.text)))
        assert [float(row["value"]) for row in rows] == [60]
    else:
        assert [row["value"] for row in response.json()] == [60]

    assert client.get(endpoint, params={"device_id": private_id}).status_code == 403
    assert client.get(endpoint, params={"device_id": 999}).status_code == 404
