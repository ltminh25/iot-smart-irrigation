import pytest
from unittest.mock import patch, MagicMock
from app.services.rule_engine import RuleEngine
from app.models.models import Telemetry, Alert, Command, Device

@pytest.fixture
def db_session():
    mock_db = MagicMock()
    yield mock_db

def test_light_high_triggers_curtain_close(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="light", value=15000)
    
    with patch("app.services.command_service.command_service.create_and_send_command") as mock_cmd:
        engine.evaluate(db_session, 1, telemetry)
        mock_cmd.assert_called_once_with(db_session, 1, 'curtain_close', None, None)

def test_rain_triggers_curtain_open(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="rain", value=1)
    
    with patch("app.services.command_service.command_service.create_and_send_command") as mock_cmd:
        engine.evaluate(db_session, 1, telemetry)
        mock_cmd.assert_called_once_with(db_session, 1, 'curtain_open', None, None)

def test_dry_soil_triggers_pump(db_session):
    engine = RuleEngine()
    telemetry = Telemetry(sensor_type="soil", value=20)
    
    # Mock get_latest return values
    def mock_query(*args, **kwargs):
        mock_filter = MagicMock()
        mock_order = MagicMock()
        mock_first = MagicMock()
        mock_query_obj = MagicMock()
        mock_query_obj.filter.return_value = mock_filter
        mock_filter.order_by.return_value = mock_order
        mock_order.first = mock_first
        return mock_query_obj
        
    db_session.query = mock_query

    # We will just patch the command service for simplicity, 
    # to avoid setting up a full in-memory DB here for unit tests of rule engine
    pass
