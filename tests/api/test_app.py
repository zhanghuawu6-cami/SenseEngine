"""Tests for the SenseEngine API health endpoints."""

import os

import pytest
from fastapi.testclient import TestClient

import sense_engine.api.app as app_module

client = TestClient(app_module.app)


def test_api_environment_uses_exact_test_values() -> None:
    assert os.environ["SENSE_ENGINE_SERVICE_KEY"] == "test-service-key"
    assert os.environ["SENSE_ENGINE_ENV"] == "test"


def test_liveness_reports_alive() -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness_reports_ready() -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_liveness_does_not_construct_core_components(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_constructor() -> None:
        raise AssertionError("liveness must not construct core components")

    monkeypatch.setattr(app_module, "StateEstimator", fail_constructor)
    monkeypatch.setattr(app_module, "InterventionPolicy", fail_constructor)

    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness_constructs_core_components(monkeypatch: pytest.MonkeyPatch) -> None:
    constructed: set[str] = set()

    def construct_estimator() -> object:
        constructed.add("estimator")
        return object()

    def construct_policy() -> object:
        constructed.add("policy")
        return object()

    monkeypatch.setattr(app_module, "StateEstimator", construct_estimator)
    monkeypatch.setattr(app_module, "InterventionPolicy", construct_policy)

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert constructed == {"estimator", "policy"}


def test_constructor_failure_keeps_liveness_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_constructor() -> None:
        raise RuntimeError("core component unavailable")

    monkeypatch.setattr(app_module, "StateEstimator", fail_constructor)
    failure_client = TestClient(app_module.app, raise_server_exceptions=False)

    readiness_response = failure_client.get("/health/ready")
    liveness_response = failure_client.get("/health/live")

    assert readiness_response.status_code == 500
    assert liveness_response.status_code == 200
    assert liveness_response.json() == {"status": "alive"}
