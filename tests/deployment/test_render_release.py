from __future__ import annotations

import importlib.util
import io
import json
import sys
import urllib.error
import urllib.request
from email.message import Message
from pathlib import Path
from types import TracebackType
from typing import Any, Self, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "contracts" / "demo-response.json"
RELEASE_SCRIPT = ROOT / "scripts" / "render_release.py"
API_KEY = "render-api-key-that-must-not-leak"
SERVICE_KEY = "senseengine-service-key-that-must-not-leak"
API_SERVICE_ID = "srv-api-private-id"
WEB_SERVICE_ID = "srv-web-public-id"
WEB_URL = "https://senseorder.example"
REQUIRED_ENV = {
    "RENDER_API_KEY": API_KEY,
    "RENDER_API_SERVICE_ID": API_SERVICE_ID,
    "RENDER_WEB_SERVICE_ID": WEB_SERVICE_ID,
    "PRODUCTION_WEB_URL": WEB_URL,
}

spec = importlib.util.spec_from_file_location("render_release", RELEASE_SCRIPT)
assert spec is not None and spec.loader is not None
render_release = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = render_release
spec.loader.exec_module(render_release)


class FakeResponse:
    def __init__(self, payload: object, *, status: int = 200) -> None:
        self._content = json.dumps(payload).encode("utf-8")
        self.status = status

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exc_type, exc_value, traceback

    def read(self) -> bytes:
        return self._content

    def getcode(self) -> int:
        return self.status


class TrackableHTTPError(urllib.error.HTTPError):
    def __init__(self) -> None:
        super().__init__(WEB_URL, 503, "private response", Message(), io.BytesIO())
        self.explicitly_closed = False

    def close(self) -> None:
        self.explicitly_closed = True
        super().close()


def _set_required_environment(
    monkeypatch: pytest.MonkeyPatch,
    *,
    production_url: str = WEB_URL,
) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("PRODUCTION_WEB_URL", production_url)
    monkeypatch.setenv("SENSE_ENGINE_SERVICE_KEY", SERVICE_KEY)


def _valid_demo_payload() -> object:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_render_request_builds_authenticated_json_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RENDER_API_KEY", API_KEY)
    captured: dict[str, object] = {}

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> FakeResponse:
        captured.update(request=request, timeout=timeout)
        return FakeResponse({"deploy": {"id": "dep-rollback"}})

    monkeypatch.setattr(render_release.urllib.request, "urlopen", fake_urlopen)

    result = render_release._render_request(
        "POST",
        f"/v1/services/{WEB_SERVICE_ID}/rollback",
        {"deployId": "dep-old-web"},
        timeout_seconds=7.0,
    )

    request = captured["request"]
    assert isinstance(request, urllib.request.Request)
    assert request.full_url == (
        f"https://api.render.com/v1/services/{WEB_SERVICE_ID}/rollback"
    )
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == f"Bearer {API_KEY}"
    assert request.get_header("Accept") == "application/json"
    assert request.get_header("Content-type") == "application/json"
    assert isinstance(request.data, bytes)
    assert json.loads(request.data) == {"deployId": "dep-old-web"}
    assert captured["timeout"] == 7.0
    assert result == {"deploy": {"id": "dep-rollback"}}


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (
            [
                {
                    "deploy": {
                        "id": "dep-building",
                        "status": "build_in_progress",
                    },
                    "cursor": "newest",
                },
                {
                    "deploy": {"id": "dep-live-wrapper", "status": "live"},
                    "cursor": "older",
                },
            ],
            "dep-live-wrapper",
        ),
        (
            {
                "deploys": [
                    {"id": "dep-live-direct", "status": "live"},
                    {"id": "dep-older", "status": "live"},
                ]
            },
            "dep-live-direct",
        ),
    ],
)
def test_get_live_deploy_accepts_render_list_wrappers(
    monkeypatch: pytest.MonkeyPatch,
    payload: object,
    expected: str,
) -> None:
    calls: list[tuple[str, str, object | None]] = []

    def fake_request(method: str, path: str, body: object | None = None) -> object:
        calls.append((method, path, body))
        return payload

    monkeypatch.setattr(render_release, "_render_request", fake_request)

    assert render_release.get_live_deploy(API_SERVICE_ID) == expected
    assert calls == [
        (
            "GET",
            f"/v1/services/{API_SERVICE_ID}/deploys?limit=20",
            None,
        )
    ]


def test_start_deploy_returns_direct_or_wrapped_deploy_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    responses: list[object] = [
        {"id": "dep-direct"},
        {"deploy": {"id": "dep-wrapper"}},
    ]
    calls: list[tuple[str, str, object | None]] = []

    def fake_request(method: str, path: str, body: object | None = None) -> object:
        calls.append((method, path, body))
        return responses.pop(0)

    monkeypatch.setattr(render_release, "_render_request", fake_request)

    assert render_release.start_deploy(API_SERVICE_ID) == "dep-direct"
    assert render_release.start_deploy(WEB_SERVICE_ID) == "dep-wrapper"
    assert calls == [
        ("POST", f"/v1/services/{API_SERVICE_ID}/deploys", {}),
        ("POST", f"/v1/services/{WEB_SERVICE_ID}/deploys", {}),
    ]


def test_wait_for_live_returns_when_deploy_becomes_live(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    statuses = iter(["build_in_progress", "update_in_progress", "live"])
    sleeps: list[float] = []

    def fake_request(
        method: str,
        path: str,
        body: object | None = None,
        *,
        timeout_seconds: float = 30,
    ) -> object:
        del method, path, body, timeout_seconds
        return {"deploy": {"status": next(statuses)}}

    monkeypatch.setattr(render_release, "_render_request", fake_request)
    monkeypatch.setattr(render_release, "_monotonic", lambda: 0.0)
    monkeypatch.setattr(render_release, "_sleep", sleeps.append)

    render_release.wait_for_live(API_SERVICE_ID, "dep-new")

    assert sleeps == [10.0, 10.0]


@pytest.mark.parametrize(
    "status",
    ["build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"],
)
def test_wait_for_live_fails_immediately_for_terminal_status(
    monkeypatch: pytest.MonkeyPatch,
    status: str,
) -> None:
    sleeps: list[float] = []
    monkeypatch.setattr(
        render_release,
        "_render_request",
        lambda method, path, body=None, *, timeout_seconds=30: {"status": status},
    )
    monkeypatch.setattr(render_release, "_monotonic", lambda: 0.0)
    monkeypatch.setattr(render_release, "_sleep", sleeps.append)

    with pytest.raises(render_release.ReleaseError, match="terminal status"):
        render_release.wait_for_live(API_SERVICE_ID, "dep-failed")

    assert sleeps == []


def test_wait_for_live_enforces_monotonic_900_second_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [0.0]
    sleeps: list[float] = []

    def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds

    monkeypatch.setattr(
        render_release,
        "_render_request",
        lambda method, path, body=None, *, timeout_seconds=30: {
            "status": "build_in_progress"
        },
    )
    monkeypatch.setattr(render_release, "_monotonic", lambda: now[0])
    monkeypatch.setattr(render_release, "_sleep", fake_sleep)

    with pytest.raises(render_release.ReleaseError, match="900 seconds"):
        render_release.wait_for_live(API_SERVICE_ID, "dep-slow")

    assert sum(sleeps) == 900
    assert set(sleeps) == {10.0}


def test_wait_for_live_rejects_live_returned_after_the_900_second_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [0.0]
    request_timeouts: list[float] = []

    def fake_request(
        method: str,
        path: str,
        body: object | None = None,
        *,
        timeout_seconds: float = 30,
    ) -> object:
        del method, path, body
        request_timeouts.append(timeout_seconds)
        if len(request_timeouts) == 1:
            now[0] = 880.0
            return {"status": "build_in_progress"}
        now[0] = 901.0
        return {"status": "live"}

    def fake_sleep(seconds: float) -> None:
        now[0] += seconds

    monkeypatch.setattr(render_release, "_render_request", fake_request)
    monkeypatch.setattr(render_release, "_monotonic", lambda: now[0])
    monkeypatch.setattr(render_release, "_sleep", fake_sleep)

    with pytest.raises(render_release.ReleaseError, match="900 seconds"):
        render_release.wait_for_live(API_SERVICE_ID, "dep-crossed-deadline")

    assert request_timeouts == [30.0, 10.0]


def test_wait_for_live_preserves_timeout_error_if_clock_expires_before_sleep(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock_values = iter([0.0, 0.0, 899.0, 901.0])
    sleeps: list[float] = []
    monkeypatch.setattr(
        render_release,
        "_render_request",
        lambda method, path, body=None, *, timeout_seconds=30: {
            "status": "build_in_progress"
        },
    )
    monkeypatch.setattr(render_release, "_monotonic", lambda: next(clock_values))

    def reject_negative_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        if seconds < 0:
            raise ValueError("sleep length must be non-negative")

    monkeypatch.setattr(render_release, "_sleep", reject_negative_sleep)

    with pytest.raises(render_release.ReleaseError, match="900 seconds"):
        render_release.wait_for_live(API_SERVICE_ID, "dep-expired-before-sleep")

    assert sleeps == []


def test_rollback_uses_old_id_and_waits_for_returned_deploy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, object, object]] = []

    def fake_request(method: str, path: str, body: object | None = None) -> object:
        calls.append(("request", method, (path, body)))
        return {"deploy": {"id": "dep-rollback-new"}}

    def fake_wait(service_id: str, deploy_id: str, timeout_seconds: int = 900) -> None:
        calls.append(("wait", service_id, (deploy_id, timeout_seconds)))

    monkeypatch.setattr(render_release, "_render_request", fake_request)
    monkeypatch.setattr(render_release, "wait_for_live", fake_wait)

    render_release.rollback(WEB_SERVICE_ID, "dep-old-web")

    assert calls == [
        (
            "request",
            "POST",
            (
                f"/v1/services/{WEB_SERVICE_ID}/rollback",
                {"deployId": "dep-old-web"},
            ),
        ),
        ("wait", WEB_SERVICE_ID, ("dep-rollback-new", 900)),
    ]


@pytest.mark.parametrize("payload", [{}, {"deploy": {}}, {"id": "  "}])
def test_rollback_fails_closed_without_a_new_deploy_id(
    monkeypatch: pytest.MonkeyPatch,
    payload: object,
) -> None:
    waits: list[tuple[object, ...]] = []
    monkeypatch.setattr(
        render_release,
        "_render_request",
        lambda method, path, body=None: payload,
    )
    monkeypatch.setattr(
        render_release,
        "wait_for_live",
        lambda *args: waits.append(args),
    )

    with pytest.raises(render_release.ReleaseError, match="rollback response"):
        render_release.rollback(WEB_SERVICE_ID, "dep-old-web")

    assert waits == []


def test_smoke_web_uses_bodyless_public_requests_and_validates_demo(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    requests: list[urllib.request.Request] = []

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> FakeResponse:
        assert timeout == 30
        requests.append(request)
        if request.full_url.endswith("/api/health"):
            return FakeResponse({"status": "alive"})
        return FakeResponse(_valid_demo_payload())

    monkeypatch.setattr(render_release.urllib.request, "urlopen", fake_urlopen)

    render_release.smoke_web(f"{WEB_URL}/")

    assert [(request.get_method(), request.full_url) for request in requests] == [
        ("GET", f"{WEB_URL}/api/health"),
        ("POST", f"{WEB_URL}/api/demo/run"),
    ]
    assert requests[0].data is None
    assert requests[1].data == b""
    assert capsys.readouterr().out == ""


@pytest.mark.parametrize(
    "corruption",
    ["step-count", "action", "baseline-before", "baseline-after"],
)
def test_smoke_web_rejects_invalid_demo_without_printing_response(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    corruption: str,
) -> None:
    payload = cast(dict[str, Any], _valid_demo_payload())
    payload["private_response"] = "must-not-be-printed"
    steps = cast(list[dict[str, Any]], payload["steps"])
    if corruption == "step-count":
        steps.pop()
    elif corruption == "action":
        steps[0]["intervention"]["action"]["type"] = "Silence"
    elif corruption == "baseline-before":
        steps[1]["baseline_before"] = 0.6
    else:
        payload["baseline_after"] = 0.66

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> FakeResponse:
        del timeout
        if request.full_url.endswith("/api/health"):
            return FakeResponse({"status": "alive"})
        return FakeResponse(payload)

    monkeypatch.setattr(render_release.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(render_release.ReleaseError, match="validation failed"):
        render_release.smoke_web(WEB_URL)

    public_output = capsys.readouterr().out + capsys.readouterr().err
    assert "must-not-be-printed" not in public_output


@pytest.mark.parametrize("payload", [{}, {"status": "starting"}, []])
def test_web_health_requires_an_alive_status(
    monkeypatch: pytest.MonkeyPatch,
    payload: object,
) -> None:
    monkeypatch.setattr(
        render_release,
        "_web_request",
        lambda method, url: payload,
    )

    with pytest.raises(render_release.ReleaseError, match="health validation"):
        render_release._check_web_health(WEB_URL)


def test_release_records_old_deploys_and_orders_api_web_then_smoke(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_required_environment(monkeypatch, production_url=f"{WEB_URL}/")
    calls: list[tuple[object, ...]] = []

    def fake_get(service_id: str) -> str:
        calls.append(("get", service_id))
        return f"old-{service_id}"

    def fake_start(service_id: str) -> str:
        calls.append(("start", service_id))
        return f"new-{service_id}"

    def fake_wait(service_id: str, deploy_id: str, timeout_seconds: int = 900) -> None:
        calls.append(("wait", service_id, deploy_id, timeout_seconds))

    monkeypatch.setattr(render_release, "get_live_deploy", fake_get)
    monkeypatch.setattr(render_release, "start_deploy", fake_start)
    monkeypatch.setattr(render_release, "wait_for_live", fake_wait)
    monkeypatch.setattr(
        render_release,
        "smoke_web",
        lambda base_url: calls.append(("smoke", base_url)),
    )

    render_release.release()

    assert calls == [
        ("get", API_SERVICE_ID),
        ("get", WEB_SERVICE_ID),
        ("start", API_SERVICE_ID),
        ("wait", API_SERVICE_ID, f"new-{API_SERVICE_ID}", 900),
        ("start", WEB_SERVICE_ID),
        ("wait", WEB_SERVICE_ID, f"new-{WEB_SERVICE_ID}", 900),
        ("smoke", WEB_URL),
    ]


@pytest.mark.parametrize(
    "failure_stage",
    ["api-start", "api-wait", "web-start", "web-wait", "smoke"],
)
def test_release_failure_always_rolls_back_web_then_api_and_checks_health(
    monkeypatch: pytest.MonkeyPatch,
    failure_stage: str,
) -> None:
    _set_required_environment(monkeypatch)
    calls: list[tuple[object, ...]] = []

    def fail_if(stage: str) -> None:
        if failure_stage == stage:
            raise RuntimeError(f"private response: {API_KEY}")

    def fake_get(service_id: str) -> str:
        calls.append(("get", service_id))
        return "old-api" if service_id == API_SERVICE_ID else "old-web"

    def fake_start(service_id: str) -> str:
        stage = "api-start" if service_id == API_SERVICE_ID else "web-start"
        calls.append((stage, service_id))
        fail_if(stage)
        return "new-api" if service_id == API_SERVICE_ID else "new-web"

    def fake_wait(service_id: str, deploy_id: str, timeout_seconds: int = 900) -> None:
        del deploy_id, timeout_seconds
        stage = "api-wait" if service_id == API_SERVICE_ID else "web-wait"
        calls.append((stage, service_id))
        fail_if(stage)

    def fake_smoke(base_url: str) -> None:
        calls.append(("smoke", base_url))
        fail_if("smoke")

    monkeypatch.setattr(render_release, "get_live_deploy", fake_get)
    monkeypatch.setattr(render_release, "start_deploy", fake_start)
    monkeypatch.setattr(render_release, "wait_for_live", fake_wait)
    monkeypatch.setattr(render_release, "smoke_web", fake_smoke)
    monkeypatch.setattr(
        render_release,
        "rollback",
        lambda service_id, deploy_id: calls.append(("rollback", service_id, deploy_id)),
    )
    monkeypatch.setattr(
        render_release,
        "_check_web_health",
        lambda base_url: calls.append(("health", base_url)),
    )

    with pytest.raises(render_release.ReleaseError) as captured:
        render_release.release()

    rollback_and_health = [
        call for call in calls if call[0] in {"rollback", "health"}
    ]
    assert rollback_and_health == [
        ("rollback", WEB_SERVICE_ID, "old-web"),
        ("rollback", API_SERVICE_ID, "old-api"),
        ("health", WEB_URL),
    ]
    assert API_KEY not in str(captured.value)
    assert captured.value.__cause__ is not None


def test_release_attempts_both_rollbacks_and_reports_rollback_health_failures(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_required_environment(monkeypatch)
    calls: list[tuple[str, str]] = []
    private_body = "full-private-response-body"

    monkeypatch.setattr(
        render_release,
        "get_live_deploy",
        lambda service_id: "old-api" if service_id == API_SERVICE_ID else "old-web",
    )
    monkeypatch.setattr(render_release, "start_deploy", lambda service_id: "new")
    monkeypatch.setattr(render_release, "wait_for_live", lambda *args: None)
    monkeypatch.setattr(
        render_release,
        "smoke_web",
        lambda base_url: (_ for _ in ()).throw(
            ValueError(f"{private_body} {SERVICE_KEY}")
        ),
    )

    def failing_rollback(service_id: str, deploy_id: str) -> None:
        calls.append((service_id, deploy_id))
        raise RuntimeError(f"rollback leaked {API_KEY} {SERVICE_KEY}")

    monkeypatch.setattr(render_release, "rollback", failing_rollback)
    monkeypatch.setattr(
        render_release,
        "_check_web_health",
        lambda base_url: (_ for _ in ()).throw(RuntimeError(private_body)),
    )

    with pytest.raises(render_release.ReleaseError) as captured:
        render_release.release()

    output = capsys.readouterr()
    message = str(captured.value) + output.out + output.err
    assert calls == [(WEB_SERVICE_ID, "old-web"), (API_SERVICE_ID, "old-api")]
    assert "web rollback" in message
    assert "API rollback" in message
    assert "health check" in message
    assert API_KEY not in message
    assert SERVICE_KEY not in message
    assert API_SERVICE_ID not in message
    assert WEB_SERVICE_ID not in message
    assert private_body not in message
    assert captured.value.__cause__ is not None


@pytest.mark.parametrize("missing", tuple(REQUIRED_ENV))
def test_release_rejects_each_missing_required_environment_variable(
    monkeypatch: pytest.MonkeyPatch,
    missing: str,
) -> None:
    _set_required_environment(monkeypatch)
    monkeypatch.delenv(missing)

    with pytest.raises(render_release.ReleaseError, match=missing):
        render_release.release()


@pytest.mark.parametrize("error_kind", ["http", "url"])
def test_render_transport_errors_are_sanitized(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    error_kind: str,
) -> None:
    monkeypatch.setenv("RENDER_API_KEY", API_KEY)

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> FakeResponse:
        del request, timeout
        if error_kind == "http":
            raise urllib.error.HTTPError(
                f"https://api.render.com/v1/services/{API_SERVICE_ID}/deploys",
                503,
                f"response={API_KEY}",
                Message(),
                io.BytesIO(f"body={API_KEY}".encode()),
            )
        raise urllib.error.URLError(f"transport={API_KEY}")

    monkeypatch.setattr(render_release.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(render_release.ReleaseError) as captured:
        render_release._render_request(
            "GET",
            f"/v1/services/{API_SERVICE_ID}/deploys?limit=20",
        )

    public_text = str(captured.value) + capsys.readouterr().out + capsys.readouterr().err
    assert API_KEY not in public_text
    assert API_SERVICE_ID not in public_text
    assert "body=" not in public_text


@pytest.mark.parametrize("boundary", ["render", "web"])
def test_http_errors_are_explicitly_closed(
    monkeypatch: pytest.MonkeyPatch,
    boundary: str,
) -> None:
    monkeypatch.setenv("RENDER_API_KEY", API_KEY)
    error = TrackableHTTPError()

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> FakeResponse:
        del request, timeout
        raise error

    monkeypatch.setattr(render_release.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(render_release.ReleaseError):
        if boundary == "render":
            render_release._render_request("GET", "/v1/services/service/deploys")
        else:
            render_release._web_request("GET", f"{WEB_URL}/api/health")

    assert error.explicitly_closed is True


def test_main_returns_nonzero_and_prints_only_sanitized_summary(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    private_body = "complete Render response body"
    monkeypatch.setattr(
        render_release,
        "release",
        lambda: (_ for _ in ()).throw(RuntimeError(f"{API_KEY} {private_body}")),
    )

    assert render_release.main() == 1

    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Render release failed" in captured.err
    assert API_KEY not in captured.err
    assert private_body not in captured.err
