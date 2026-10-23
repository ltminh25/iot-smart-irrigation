import json
import pytest
from unittest.mock import patch, MagicMock
from app.services.rule_engine import RuleEngine
from app.models.models import Telemetry, Command

@pytest.fixture
def db_session():
    mock_db = MagicMock()
    yield mock_db

def test_light_high_triggers_curtain_close(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="light", value=15000)
    
    with patch.object(engine, "_has_recent_command", return_value=False), \
         patch.object(engine, "_create_alert_if_not_recent") as mock_alert, \
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

    with patch.object(engine, "_has_recent_command", return_value=False), \
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
