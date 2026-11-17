import json
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import database
from app.models.models import Device, Telemetry
from app.services.mqtt_client import manager, mqtt_client_instance, rule_engine


@pytest.fixture
def receiver(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'telemetry.db'}")
    database.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(database, "SessionLocal", sessions)
    with sessions.begin() as db:
        db.add_all([Device(device_uid=uid) for uid in ("plant-1", "plant-2")])

    evaluated = []
    broadcast = []
    monkeypatch.setattr(rule_engine, "evaluate", lambda db, device_id, row: evaluated.append(row.id))
    monkeypatch.setattr(manager, "broadcast_sync", lambda device_id, event: broadcast.append(event))

    def receive(payload, uid="plant-1", sensor="soil"):
        msg = SimpleNamespace(topic=f"plant/{uid}/telemetry/{sensor}", payload=json.dumps(payload).encode())
        mqtt_client_instance.on_message(None, None, msg)

    yield sessions, receive, evaluated, broadcast
    engine.dispose()


@pytest.mark.parametrize("payload", [
    {},
    [],
    {"value": None},
    {"value": True},
    {"value": "bad"},
    {"value": float("nan")},
    {"value": float("inf")},
    {"value": 110},
    {"raw": -1},
    {"raw": 1025},
    {"raw": "NaN"},
    {"value": 50, "sample_id": ""},
])
def test_invalid_telemetry_has_no_side_effects(receiver, payload):
    sessions, receive, evaluated, broadcast = receiver
    receive(payload)
    with sessions() as db:
        assert db.query(Telemetry).count() == 0
        device = db.query(Device).filter_by(device_uid="plant-1").one()
        assert device.status == "registered"
        assert device.last_heartbeat_at is None
    assert evaluated == []
    assert broadcast == []


def test_replay_is_processed_once_per_device_and_sensor(receiver):
    sessions, receive, evaluated, broadcast = receiver
    for _ in range(10):
        receive({"raw": 920, "sample_id": "reading-1"})
    receive({"value": 1500, "sample_id": "reading-1"}, sensor="light")
    receive({"value": 50, "sample_id": "reading-1"}, uid="plant-2")
    receive({"value": 50, "sample_id": "reading-2"})

    with sessions() as db:
        rows = db.query(Telemetry).order_by(Telemetry.id).all()
        assert [(row.device_id, row.sensor_type, row.value) for row in rows] == [
            (1, "soil", 50), (1, "light", 1500), (2, "soil", 50), (1, "soil", 50),
        ]
        assert db.get(Device, 1).status == "active"
        assert evaluated == [row.id for row in rows]
        assert [event["data"]["id"] for event in broadcast if event["type"] == "telemetry"] == evaluated


def test_legacy_publishers_can_report_the_same_value_twice(receiver):
    sessions, receive, evaluated, broadcast = receiver
    receive({"value": 0})
    receive({"value": 0})
    with sessions() as db:
        assert [row.value for row in db.query(Telemetry).all()] == [0, 0]
    assert len(evaluated) == 2


@pytest.mark.parametrize("raw", [1023, 1024])
def test_soil_adc_at_upper_limit_is_saved_as_dry(receiver, raw):
    sessions, receive, evaluated, broadcast = receiver
    receive({"raw": raw})
    with sessions() as db:
        assert db.query(Telemetry).one().value == 0
    assert len(evaluated) == 1
    assert any(event["type"] == "telemetry" for event in broadcast)
