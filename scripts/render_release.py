"""Release SenseOrder services on Render with automatic rollback."""

from __future__ import annotations

import json
import math
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from types import FrameType
from typing import NoReturn, TypeAlias, cast

RENDER_API_BASE = "https://api.render.com"
HTTP_TIMEOUT_SECONDS = 30
POLL_INTERVAL_SECONDS = 10.0
REQUIRED_ENVIRONMENT = (
    "CIRCLE_SHA1",
    "RENDER_API_KEY",
    "RENDER_API_SERVICE_ID",
    "RENDER_WEB_SERVICE_ID",
    "PRODUCTION_WEB_URL",
)
FAILED_DEPLOY_STATUSES = frozenset(
    {
        "build_failed",
        "update_failed",
        "pre_deploy_failed",
        "canceled",
        "deactivated",
    }
)

JsonValue: TypeAlias = (
    str
    | int
    | float
    | bool
    | None
    | list["JsonValue"]
    | dict[str, "JsonValue"]
)
JsonObject: TypeAlias = dict[str, JsonValue]
SignalHandler: TypeAlias = Callable[[int, FrameType | None], object] | int | None

_monotonic = time.monotonic
_sleep = time.sleep


class ReleaseError(RuntimeError):
    """A sanitized deployment, rollback, or smoke-check failure."""


class ReleaseInterrupted(Exception):
    """A sanitized request to stop the release safely."""


def _raise_release_interrupted(
    signum: int,
    frame: FrameType | None,
) -> NoReturn:
    del signum, frame
    for interrupt_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(interrupt_signal, signal.SIG_IGN)
    raise ReleaseInterrupted("Render release interrupted.")


def _json_payload(content: bytes, *, source: str) -> JsonValue:
    try:
        parsed: object = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ReleaseError(f"{source} returned invalid JSON.") from error
    return cast(JsonValue, parsed)


def _render_request(
    method: str,
    path: str,
    body: Mapping[str, JsonValue] | None = None,
    *,
    timeout_seconds: float = HTTP_TIMEOUT_SECONDS,
) -> JsonValue:
    """Call Render through one secret-safe HTTP boundary."""
    api_key = os.environ.get("RENDER_API_KEY", "").strip()
    if not api_key:
        raise ReleaseError("Missing required environment variable: RENDER_API_KEY.")

    data = None
    if body is not None:
        data = json.dumps(dict(body), separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        f"{RENDER_API_BASE}{path}",
        data=data,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method=method,
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout_seconds,
        ) as response:
            status = response.getcode()
            content = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        raise ReleaseError(
            f"Render API request failed with HTTP status {status}."
        ) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise ReleaseError("Render API request failed during transport.") from error

    if not 200 <= status < 300:
        raise ReleaseError(f"Render API request failed with HTTP status {status}.")
    return _json_payload(content, source="Render API")


def _as_object(payload: JsonValue) -> JsonObject | None:
    if not isinstance(payload, dict):
        return None
    return payload


def _deploy_object(payload: JsonValue) -> JsonObject | None:
    candidate = _as_object(payload)
    if candidate is None:
        return None
    wrapped = candidate.get("deploy")
    if isinstance(wrapped, dict):
        return wrapped
    return candidate


def _deploy_id(payload: JsonValue) -> str | None:
    deploy = _deploy_object(payload)
    if deploy is None:
        return None
    deploy_id = deploy.get("id")
    if isinstance(deploy_id, str) and deploy_id.strip():
        return deploy_id
    return None


def _deploy_status(payload: JsonValue) -> str | None:
    deploy = _deploy_object(payload)
    if deploy is None:
        return None
    status = deploy.get("status")
    if isinstance(status, str) and status.strip():
        return status
    return None


def _deploy_commit_id(payload: JsonValue) -> str | None:
    deploy = _deploy_object(payload)
    if deploy is None:
        return None
    commit = deploy.get("commit")
    if not isinstance(commit, dict):
        return None
    commit_id = commit.get("id")
    if isinstance(commit_id, str) and commit_id.strip():
        return commit_id.strip().lower()
    return None


def _deploy_list(payload: JsonValue) -> list[JsonValue]:
    if isinstance(payload, list):
        return payload
    wrapper = _as_object(payload)
    if wrapper is not None:
        deploys = wrapper.get("deploys")
        if isinstance(deploys, list):
            return deploys
    raise ReleaseError("Render API returned an invalid deploy list.")


def get_live_deploy(service_id: str) -> str:
    """Return the newest live deployment ID for a Render service."""
    payload = _render_request(
        "GET",
        f"/v1/services/{urllib.parse.quote(service_id, safe='')}/deploys?limit=20",
    )
    for item in _deploy_list(payload):
        if _deploy_status(item) == "live":
            deploy_id = _deploy_id(item)
            if deploy_id is not None:
                return deploy_id
    raise ReleaseError("Render service has no usable live deployment.")


def start_deploy(service_id: str, commit_id: str) -> str:
    """Start a Render deployment and return its ID."""
    payload = _render_request(
        "POST",
        f"/v1/services/{urllib.parse.quote(service_id, safe='')}/deploys",
        {"commitId": commit_id},
    )
    deploy_id = _deploy_id(payload)
    if deploy_id is None:
        raise ReleaseError("Render API returned an invalid deployment response.")
    return deploy_id


def wait_for_live(
    service_id: str,
    deploy_id: str,
    timeout_seconds: int = 900,
    *,
    expected_commit_id: str | None = None,
) -> None:
    """Wait until one deployment is live or reaches a failed terminal state."""
    if timeout_seconds <= 0:
        raise ReleaseError("Deployment timeout must be positive.")

    deadline = _monotonic() + timeout_seconds
    path = (
        f"/v1/services/{urllib.parse.quote(service_id, safe='')}/deploys/"
        f"{urllib.parse.quote(deploy_id, safe='')}"
    )
    while True:
        remaining = deadline - _monotonic()
        if remaining <= 0:
            raise ReleaseError(
                f"Render deployment did not become live within {timeout_seconds} seconds."
            )
        payload = _render_request(
            "GET",
            path,
            timeout_seconds=min(HTTP_TIMEOUT_SECONDS, remaining),
        )
        if _monotonic() >= deadline:
            raise ReleaseError(
                f"Render deployment did not become live within {timeout_seconds} seconds."
            )

        status = _deploy_status(payload)
        if status == "live":
            if (
                expected_commit_id is not None
                and _deploy_commit_id(payload) != expected_commit_id
            ):
                raise ReleaseError(
                    "Render live deployment commit did not match the expected commit."
                )
            return
        if status in FAILED_DEPLOY_STATUSES:
            raise ReleaseError("Render deployment reached a failed terminal status.")

        remaining = deadline - _monotonic()
        if remaining <= 0:
            raise ReleaseError(
                f"Render deployment did not become live within {timeout_seconds} seconds."
            )
        _sleep(min(POLL_INTERVAL_SECONDS, remaining))


def rollback(service_id: str, deploy_id: str) -> None:
    """Rollback a service to a known live deployment and await completion."""
    payload = _render_request(
        "POST",
        f"/v1/services/{urllib.parse.quote(service_id, safe='')}/rollback",
        {"deployId": deploy_id},
    )
    rollback_deploy_id = _deploy_id(payload)
    if rollback_deploy_id is None:
        raise ReleaseError("Render API returned an invalid rollback response.")
    wait_for_live(service_id, rollback_deploy_id)


def _normalize_web_url(raw_url: str) -> str:
    candidate = raw_url.strip().rstrip("/")
    parsed = urllib.parse.urlsplit(candidate)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ReleaseError("PRODUCTION_WEB_URL must be a public HTTP(S) base URL.")
    return urllib.parse.urlunsplit(
        (parsed.scheme.lower(), parsed.netloc, parsed.path.rstrip("/"), "", "")
    )


def _web_request(method: str, url: str) -> JsonValue:
    data = b"" if method == "POST" else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=HTTP_TIMEOUT_SECONDS,
        ) as response:
            status = response.getcode()
            content = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        raise ReleaseError(
            f"Public smoke request failed with HTTP status {status}."
        ) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise ReleaseError("Public smoke request failed during transport.") from error

    if status != 200:
        raise ReleaseError(
            f"Public smoke request failed with HTTP status {status}."
        )
    return _json_payload(content, source="Public smoke endpoint")


def _number(value: JsonValue | None) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return float(value)


def _validate_demo(payload: JsonValue) -> None:
    response = _as_object(payload)
    if response is None:
        raise ReleaseError("Public demo smoke validation failed.")
    steps = response.get("steps")
    if not isinstance(steps, list) or len(steps) != 3:
        raise ReleaseError("Public demo smoke validation failed.")

    actions: list[str] = []
    baselines: list[float] = []
    for step_value in steps:
        step = _as_object(step_value)
        intervention = _as_object(step.get("intervention")) if step else None
        action = _as_object(intervention.get("action")) if intervention else None
        action_type = action.get("type") if action else None
        baseline = _number(step.get("baseline_before")) if step else None
        if not isinstance(action_type, str) or baseline is None:
            raise ReleaseError("Public demo smoke validation failed.")
        actions.append(action_type)
        baselines.append(baseline)

    baseline_after = _number(response.get("baseline_after"))
    expected_baselines = (0.5, 0.5, 0.7)
    if (
        actions != ["Ask", "Suggest Break", "Silence"]
        or any(
            not math.isclose(actual, expected, abs_tol=1e-9)
            for actual, expected in zip(baselines, expected_baselines, strict=True)
        )
        or baseline_after is None
        or not math.isclose(baseline_after, 0.65, abs_tol=1e-9)
    ):
        raise ReleaseError("Public demo smoke validation failed.")


def _check_web_health(base_url: str) -> None:
    health = _as_object(_web_request("GET", f"{base_url}/api/health"))
    if health is None or health.get("status") != "alive":
        raise ReleaseError("Public health validation failed.")


def smoke_web(base_url: str) -> None:
    """Validate public Web health and the deterministic three-step demo."""
    normalized_url = _normalize_web_url(base_url)
    _check_web_health(normalized_url)
    _validate_demo(_web_request("POST", f"{normalized_url}/api/demo/run"))


def _required_environment() -> dict[str, str]:
    values: dict[str, str] = {}
    for name in REQUIRED_ENVIRONMENT:
        raw_value = os.environ.get(name, "")
        if not raw_value.strip():
            raise ReleaseError(f"Missing required environment variable: {name}.")
        values[name] = raw_value if name == "CIRCLE_SHA1" else raw_value.strip()
    commit_id = values["CIRCLE_SHA1"]
    if re.fullmatch(r"[0-9a-fA-F]{40}", commit_id) is None:
        raise ReleaseError("CIRCLE_SHA1 must be a 40-character hexadecimal commit ID.")
    values["CIRCLE_SHA1"] = commit_id.lower()
    values["PRODUCTION_WEB_URL"] = _normalize_web_url(values["PRODUCTION_WEB_URL"])
    return values


def _log(message: str) -> None:
    print(message, flush=True)


def release() -> None:
    """Deploy API then Web, verify publicly, and recover both on failure."""
    environment = _required_environment()
    api_service_id = environment["RENDER_API_SERVICE_ID"]
    web_service_id = environment["RENDER_WEB_SERVICE_ID"]
    web_url = environment["PRODUCTION_WEB_URL"]
    commit_id = environment["CIRCLE_SHA1"]

    _log("Recording current live deployments.")
    try:
        old_api_deploy = get_live_deploy(api_service_id)
        old_web_deploy = get_live_deploy(web_service_id)
    except Exception as error:
        raise ReleaseError("Unable to record current live deployments.") from error

    stage = "API deployment"
    try:
        _log("Starting API deployment.")
        api_deploy = start_deploy(api_service_id, commit_id)
        wait_for_live(
            api_service_id,
            api_deploy,
            expected_commit_id=commit_id,
        )

        stage = "Web deployment"
        _log("Starting Web deployment.")
        web_deploy = start_deploy(web_service_id, commit_id)
        wait_for_live(
            web_service_id,
            web_deploy,
            expected_commit_id=commit_id,
        )

        stage = "public smoke check"
        _log("Running public smoke checks.")
        smoke_web(web_url)
    except Exception as release_error:
        _log("Release failed; restoring previous deployments.")
        recovery_failures: list[str] = []
        for label, service_id, deploy_id in (
            ("web rollback", web_service_id, old_web_deploy),
            ("API rollback", api_service_id, old_api_deploy),
        ):
            try:
                rollback(service_id, deploy_id)
            except Exception:
                recovery_failures.append(label)
        try:
            _check_web_health(web_url)
        except Exception:
            recovery_failures.append("health check")

        recovery_summary = ""
        if recovery_failures:
            recovery_summary = f" Recovery failed: {', '.join(recovery_failures)}."
        raise ReleaseError(
            f"Release failed during {stage}.{recovery_summary}"
        ) from release_error

    _log("Render release completed successfully.")


def main() -> int:
    """Run the release while keeping arbitrary upstream details off stderr."""
    previous_handlers: dict[signal.Signals, SignalHandler] = {}
    try:
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[signum] = signal.signal(
                signum,
                _raise_release_interrupted,
            )
        release()
    except Exception as error:
        sys.stderr.write(f"Render release failed ({type(error).__name__}).\n")
        return 1
    finally:
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
