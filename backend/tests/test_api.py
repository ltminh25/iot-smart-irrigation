import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to Smart Plant Care IoT API"}

# Bỏ qua integration tests phức tạp hơn do cần setup in-memory db và mqtt mock.
