import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import database
from app.core.security import create_access_token
from app.main import app
from app.models.models import Alert, Device, Role, User


@pytest.fixture
def alerts_api(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'alerts.db').as_posix()}")
    database.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(database, "SessionLocal", sessions)

    with sessions.begin() as db:
        admin, owner, viewer = [User(username=name, role=Role(name=name)) for name in ("admin", "owner", "viewer")]
        owned = Device(device_uid="owner-device")
        other = Device(device_uid="admin-device")
        db.add_all([admin, owner, viewer])
        db.flush()
        owned.owner_id, other.owner_id = owner.id, admin.id
        db.add_all([owned, other])
        db.flush()
        opened = Alert(device_id=owned.id, message="Open alert", status="open")
        closed = Alert(device_id=owned.id, message="Resolved alert", status="resolved")
        elsewhere = Alert(device_id=other.id, message="Another device alert", status="open")
        db.add_all([opened, closed, elsewhere])
        db.flush()
        owned_id, other_id, opened_id, closed_id, elsewhere_id = owned.id, other.id, opened.id, closed.id, elsewhere.id

    yield TestClient(app), owned_id, other_id, opened_id, closed_id, elsewhere_id
    engine.dispose()


def headers(role):
    return {"Authorization": f"Bearer {create_access_token({'sub': role})}"}


def test_viewer_can_filter_alerts_by_device_and_status(alerts_api):
    client, device_id, _, open_id, resolved_id, other_id = alerts_api
    response = client.get("/api/v1/alerts", headers=headers("viewer"))
    assert response.status_code == 200
    assert {alert["id"] for alert in response.json()} == {open_id, resolved_id, other_id}

    response = client.get("/api/v1/alerts", params={"device_id": device_id, "status": "open"}, headers=headers("viewer"))
    assert response.status_code == 200
    assert [alert["id"] for alert in response.json()] == [open_id]


def test_alert_access_respects_roles_and_device_ownership(alerts_api):
    client, device_id, other_device_id, open_id, _, other_id = alerts_api
    assert client.get(f"/api/v1/alerts?device_id={other_device_id}", headers=headers("owner")).status_code == 403
    assert client.get(f"/api/v1/alerts?device_id={device_id}", headers=headers("owner")).status_code == 200
    assert client.get("/api/v1/alerts?device_id=999", headers=headers("viewer")).status_code == 404

    for action in ("acknowledge", "resolve"):
        assert client.put(f"/api/v1/alerts/{open_id}/{action}", headers=headers("viewer")).status_code == 403
        assert client.put(f"/api/v1/alerts/{other_id}/{action}", headers=headers("owner")).status_code == 403
    response = client.put(f"/api/v1/alerts/{open_id}/acknowledge", headers=headers("owner"))
    assert response.status_code == 200
    assert response.json()["status"] == "acknowledged"
    response = client.put(f"/api/v1/alerts/{open_id}/resolve", headers=headers("admin"))
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
