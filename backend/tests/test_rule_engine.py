import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from unittest.mock import patch, MagicMock
from app.core.database import Base
from app.services.rule_engine import RuleEngine
from app.models.models import Telemetry, Command

@pytest.fixture
def db_session():
    mock_db = MagicMock()
    yield mock_db

def test_light_high_triggers_curtain_close(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="light", value=15000)
    
    with patch.object(engine, "_create_alert_if_not_recent") as mock_alert, \
         patch("app.services.command_service.command_service.create_and_send_command") as mock_cmd:
        engine.evaluate(db_session, 1, telemetry)
        mock_cmd.assert_called_once_with(db_session, 1, "curtain_close", None, None)
        mock_alert.assert_called_once()

def test_light_low_reopens_curtain_when_closed(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="light", value=1000)

    with patch.object(engine, "_get_last_curtain_action", return_value="curtain_close"), \
         patch("app.services.command_service.command_service.create_and_send_command") as mock_cmd:
        engine.evaluate(db_session, 1, telemetry)
        mock_cmd.assert_called_once_with(db_session, 1, "curtain_open", None, None)

def test_dry_soil_triggers_pump_on(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="soil", value=20)

    # Giả lập ánh sáng hiện tại vừa phải (3000 lux)
    mock_light = Telemetry(sensor_type="light", value=3000)
    db_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_light

    with patch.object(engine, "_can_start_pump", return_value=True), \
         patch("app.services.command_service.command_service.create_and_send_command") as mock_cmd:
        engine.evaluate(db_session, 1, telemetry)
        mock_cmd.assert_called_once_with(db_session, 1, "pump_on", json.dumps({"duration": 5000}), None)

def test_dry_soil_high_light_delays_pump_and_alerts(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="soil", value=20)

    # Giả lập trời đang nắng gắt (20000 lux)
    mock_light = Telemetry(sensor_type="light", value=20000)
    db_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_light

    with patch.object(engine, "_create_alert_if_not_recent") as mock_alert, \
         patch("app.services.command_service.command_service.create_and_send_command") as mock_cmd:
        engine.evaluate(db_session, 1, telemetry)
        mock_cmd.assert_not_called()
        mock_alert.assert_called_once()


@pytest.fixture
def command_db():
    db_engine = create_engine("sqlite://")
    Base.metadata.create_all(db_engine)
    with Session(db_engine) as db:
        yield db
    db_engine.dispose()


@pytest.mark.parametrize(("lux", "previous", "expected"), [
    (1000, "curtain_close", "curtain_open"),
    (9000, "curtain_open", "curtain_close"),
])
def test_curtain_reacts_to_light_without_wait(command_db, lux, previous, expected):
    command_db.add(Command(device_id=1, action=previous, issued_at=datetime.utcnow()))
    command_db.commit()
    engine = RuleEngine()
    with patch.object(engine, "_create_alert_if_not_recent"), \
         patch("app.services.command_service.command_service.create_and_send_command") as send:
        engine.evaluate(command_db, 1, Telemetry(sensor_type="light", value=lux))
        send.assert_called_once_with(command_db, 1, expected, None, None)


@pytest.mark.parametrize(("duration", "elapsed", "can_start"), [
    (5000, 5, False),
    (5000, 5.9, False),
    (5000, 6, True),
    (10000, 10.9, False),
    (10000, 11, True),
])
def test_pump_rests_one_second_after_run(command_db, duration, elapsed, can_start):
    now = datetime(2026, 1, 1)
    started = now - timedelta(seconds=elapsed)
    command_db.add_all([
        Command(device_id=1, action="pump_on", status="executed", payload=json.dumps({"duration": duration}),
                issued_at=started - timedelta(seconds=1), executed_at=started),
        Command(device_id=1, action="curtain_close", issued_at=now),
    ])
    command_db.commit()

    engine = RuleEngine()
    with patch("app.services.rule_engine.datetime") as clock, \
         patch("app.services.command_service.command_service.create_and_send_command") as send:
        clock.utcnow.return_value = now
        engine.evaluate(command_db, 1, Telemetry(sensor_type="soil", value=20))
        if can_start:
            send.assert_called_once_with(command_db, 1, "pump_on", json.dumps({"duration": 5000}), None)
        else:
            send.assert_not_called()


@pytest.mark.parametrize(("status", "elapsed", "can_start"), [
    ("pending", 6, False),
    ("failed", 15, False),
    ("failed", 16, True),
])
def test_pump_retries_observe_rest_window(command_db, status, elapsed, can_start):
    now = datetime(2026, 1, 1)
    command_db.add(Command(device_id=1, action="pump_on", status=status, retry_count=2,
                           issued_at=now - timedelta(seconds=elapsed)))
    command_db.commit()

    with patch("app.services.rule_engine.datetime") as clock:
        clock.utcnow.return_value = now
        assert RuleEngine()._can_start_pump(command_db, 1) is can_start
