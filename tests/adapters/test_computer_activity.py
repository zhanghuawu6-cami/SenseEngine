"""Tests for the simulated computer activity signal adapter."""

import random
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from sense_engine.adapters.computer_activity import ComputerActivityAdapter
from sense_engine.core.models.signal_event import (
    ConsentScope,
    ExpiryAction,
    RetentionPolicy,
    RetentionTier,
    SignalEvent,
)

FIXED_TIME = datetime(2026, 7, 15, 9, 30, tzinfo=UTC)
ACTIVE_WINDOWS = {"VS Code", "Google Chrome", "Terminal", "Figma", "Slack"}
ACTIVITY_LEVELS = {"Low", "Moderate", "High"}


def make_consent_scope() -> ConsentScope:
    """Build caller-declared consent metadata for adapter tests."""
    return ConsentScope(
        purposes=("state_estimation",),
        granted_at=FIXED_TIME,
    )


def make_retention_policy() -> RetentionPolicy:
    """Build caller-declared retention metadata for adapter tests."""
    return RetentionPolicy(
        tier=RetentionTier.SESSION,
        on_expiry=ExpiryAction.DELETE,
    )


def make_adapter(*, clock_time: datetime = FIXED_TIME) -> ComputerActivityAdapter:
    """Build a deterministic adapter for focused tests."""
    return ComputerActivityAdapter(
        device_id="device-pseudonym-001",
        consent_scope=make_consent_scope(),
        retention=make_retention_policy(),
        rng=random.Random(7),
        clock=lambda: clock_time,
    )


def test_capture_activity_returns_one_composite_signal_event() -> None:
    event = make_adapter().capture_activity()

    assert isinstance(event, SignalEvent)
    assert event.feature.name == "computer_activity_snapshot"
    assert event.feature.unit is None
    assert isinstance(event.feature.value, dict)
    assert set(event.feature.value) == {
        "schema_version",
        "active_window",
        "typing_speed",
        "mouse_movement_frequency",
    }
    assert event.feature.value["schema_version"] == "1.0"


def test_capture_activity_uses_only_approved_simulation_values() -> None:
    adapter = make_adapter()

    for _ in range(100):
        value = adapter.capture_activity().feature.value
        assert isinstance(value, dict)
        assert value["active_window"] in ACTIVE_WINDOWS
        assert value["typing_speed"] in ACTIVITY_LEVELS
        assert value["mouse_movement_frequency"] in ACTIVITY_LEVELS


def test_capture_activity_preserves_time_source_quality_and_policy_metadata() -> None:
    consent_scope = make_consent_scope()
    retention = make_retention_policy()
    adapter = ComputerActivityAdapter(
        device_id="device-pseudonym-001",
        consent_scope=consent_scope,
        retention=retention,
        rng=random.Random(7),
        clock=lambda: FIXED_TIME,
    )

    event = adapter.capture_activity()

    assert event.time == FIXED_TIME
    assert event.time.utcoffset() is not None
    assert event.source.adapter == "computer_activity_adapter"
    assert event.source.device_id == "device-pseudonym-001"
    assert event.source.modality == "computer_activity"
    assert event.quality.score == 0.85
    assert event.quality.completeness == 1.0
    assert event.quality.reason == "simulated_complete_snapshot"
    assert event.consent_scope == consent_scope
    assert event.retention == retention


def test_capture_activity_json_round_trip_is_lossless() -> None:
    event = make_adapter().capture_activity()

    assert SignalEvent.model_validate_json(event.model_dump_json()) == event


def test_adapter_rejects_empty_device_identifier() -> None:
    with pytest.raises(ValidationError):
        ComputerActivityAdapter(
            device_id="",
            consent_scope=make_consent_scope(),
            retention=make_retention_policy(),
        )


def test_capture_activity_rejects_naive_clock_time() -> None:
    adapter = make_adapter(clock_time=FIXED_TIME.replace(tzinfo=None))

    with pytest.raises(ValidationError):
        adapter.capture_activity()
