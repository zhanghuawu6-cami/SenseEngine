"""Tests for the authenticated SenseEngine API boundary."""

import hmac
import logging
import os
from datetime import UTC, datetime
from typing import Literal

import pytest
from fastapi.testclient import TestClient

import sense_engine.api.app as app_module
from sense_engine.api.demo_service import DemoService
from sense_engine.api.schemas import ApiError, DemoRunResponse, ErrorResponse

client = TestClient(app_module.app)
NOW = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


class CountingDemoService(DemoService):
    """Record whether a request reached demo orchestration."""

    def __init__(self) -> None:
        super().__init__(clock=lambda: NOW)
        self.run_calls = 0

    def run(self) -> DemoRunResponse:
        self.run_calls += 1
        return super().run()


class FailingDemoService(DemoService):
    """Raise a private failure after the request reaches orchestration."""

    def run(self) -> DemoRunResponse:
        raise RuntimeError("private upstream detail")


def assert_error_response(
    response_status: int,
    response_json: object,
    *,
    expected_status: int,
    code: Literal["unauthorized", "invalid_request", "demo_unavailable"],
    message: str,
) -> None:
    """Assert the public error envelope without relying on route internals."""
    assert response_status == expected_status
    parsed = ErrorResponse.model_validate(response_json)
    assert parsed == ErrorResponse(error=ApiError(code=code, message=message))


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


@pytest.mark.parametrize("provided_key", [None, "", "wrong-service-key"])
def test_demo_run_rejects_missing_empty_or_wrong_service_key_without_leaking_it(
    provided_key: str | None,
    caplog: pytest.LogCaptureFixture,
) -> None:
    service = CountingDemoService()
    protected_client = TestClient(app_module.create_app(service=service))
    headers = {} if provided_key is None else {"X-SenseEngine-Service-Key": provided_key}
    caplog.set_level(logging.DEBUG)

    response = protected_client.post(
        "/v1/demo/run",
        content=b"private unauthorized request body",
        headers=headers,
    )

    assert_error_response(
        response.status_code,
        response.json(),
        expected_status=401,
        code="unauthorized",
        message="Unauthorized.",
    )
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"] == "application/json"
    assert service.run_calls == 0
    public_output = response.text + caplog.text
    assert "test-service-key" not in public_output
    assert "private unauthorized request body" not in public_output
    if provided_key:
        assert provided_key not in public_output


def test_demo_run_with_correct_key_and_no_body_returns_complete_json_response() -> None:
    service = CountingDemoService()
    authorized_client = TestClient(app_module.create_app(service=service))

    response = authorized_client.post(
        "/v1/demo/run",
        headers={"X-SenseEngine-Service-Key": "test-service-key"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    parsed = DemoRunResponse.model_validate_json(response.content)
    assert tuple((step.scenario.sequence, step.scenario.id) for step in parsed.steps) == (
        (1, "insufficient-evidence"),
        (2, "long-meeting"),
        (3, "deep-focus"),
    )
    assert tuple(step.intervention.action.type for step in parsed.steps) == (
        "Ask",
        "Suggest Break",
        "Silence",
    )
    assert service.run_calls == 1


@pytest.mark.parametrize(
    ("body", "content_type"),
    [
        (b'{"input":"private json body"}', "application/json"),
        (b"{}", "application/json"),
        (b"private arbitrary bytes", "text/plain"),
        (b"\x00\x01\xff", "application/octet-stream"),
    ],
)
def test_demo_run_rejects_every_nonempty_body_before_calling_service(
    body: bytes,
    content_type: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    service = CountingDemoService()
    protected_client = TestClient(app_module.create_app(service=service))
    caplog.set_level(logging.DEBUG)

    response = protected_client.post(
        "/v1/demo/run",
        content=body,
        headers={
            "Content-Type": content_type,
            "X-SenseEngine-Service-Key": "test-service-key",
        },
    )

    assert_error_response(
        response.status_code,
        response.json(),
        expected_status=400,
        code="invalid_request",
        message="Request body is not allowed.",
    )
    assert response.headers["cache-control"] == "no-store"
    assert service.run_calls == 0
    if body.isascii():
        assert body.decode() not in response.text + caplog.text


def test_demo_failure_returns_sanitized_unavailable_response_and_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    failure_client = TestClient(app_module.create_app(service=FailingDemoService()))
    caplog.set_level(logging.ERROR, logger=app_module.__name__)

    response = failure_client.post(
        "/v1/demo/run",
        headers={"X-SenseEngine-Service-Key": "test-service-key"},
    )

    assert_error_response(
        response.status_code,
        response.json(),
        expected_status=503,
        code="demo_unavailable",
        message="Demo is temporarily unavailable.",
    )
    assert response.headers["cache-control"] == "no-store"
    assert set(response.json()) == {"error"}
    application_records = [
        record for record in caplog.records if record.name == app_module.__name__
    ]
    assert [record.getMessage() for record in application_records] == [
        "demo_run_failed type=RuntimeError"
    ]
    assert all(record.exc_info is None for record in application_records)
    public_output = response.text + caplog.text
    for private_value in (
        "private upstream detail",
        "Traceback",
        "test-service-key",
        "private request body",
    ):
        assert private_value not in public_output


def test_api_settings_rejects_missing_service_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from sense_engine.api.security import ApiSettings

    monkeypatch.delenv("SENSE_ENGINE_SERVICE_KEY", raising=False)

    with pytest.raises(RuntimeError, match="^SENSE_ENGINE_SERVICE_KEY is required$"):
        ApiSettings.from_env()


def test_api_settings_rejects_empty_service_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from sense_engine.api.security import ApiSettings

    monkeypatch.setenv("SENSE_ENGINE_SERVICE_KEY", "")

    with pytest.raises(RuntimeError, match="^SENSE_ENGINE_SERVICE_KEY is required$"):
        ApiSettings.from_env()


def test_api_settings_defaults_environment_to_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sense_engine.api.security import ApiSettings

    monkeypatch.setenv("SENSE_ENGINE_SERVICE_KEY", "configured-key")
    monkeypatch.delenv("SENSE_ENGINE_ENV", raising=False)

    settings = ApiSettings.from_env()

    assert settings.service_key == "configured-key"
    assert settings.environment == "development"


def test_api_settings_preserves_explicit_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sense_engine.api.security import ApiSettings

    monkeypatch.setenv("SENSE_ENGINE_SERVICE_KEY", "configured-key")
    monkeypatch.setenv("SENSE_ENGINE_ENV", "production")

    settings = ApiSettings.from_env()

    assert settings.service_key == "configured-key"
    assert settings.environment == "production"


@pytest.mark.parametrize(
    ("provided", "expected_result", "expected_candidate"),
    [
        ("expected-key", True, b"expected-key"),
        ("wrong-key", False, b"wrong-key"),
        (None, False, b""),
    ],
)
def test_is_authorized_compares_encoded_bytes_in_constant_time(
    provided: str | None,
    expected_result: bool,
    expected_candidate: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sense_engine.api.security import is_authorized

    calls: list[tuple[bytes, bytes]] = []

    def compare_digest(candidate: bytes, expected: bytes) -> bool:
        calls.append((candidate, expected))
        return candidate == expected

    monkeypatch.setattr(hmac, "compare_digest", compare_digest)

    assert is_authorized(provided, "expected-key") is expected_result
    assert calls == [(expected_candidate, b"expected-key")]
