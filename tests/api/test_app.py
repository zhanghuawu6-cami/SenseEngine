"""Tests for the SenseEngine API health endpoints."""

from fastapi.testclient import TestClient

from sense_engine.api.app import app

client = TestClient(app)


def test_liveness_reports_alive() -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness_reports_ready() -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
