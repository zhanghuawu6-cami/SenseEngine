"""Tests for the public SenseEngine demo API response contracts."""

import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from sense_engine.api.schemas import (
    DemoEvidence,
    DemoRunResponse,
    DemoScenario,
    DemoStep,
    ScenarioId,
)
from tests.helpers import make_estimate, make_intervention

NOW = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


def make_step(sequence: int, scenario_id: ScenarioId, baseline: float) -> DemoStep:
    """Build a complete demo step for response contract tests."""
    return DemoStep(
        scenario=DemoScenario(
            id=scenario_id,
            sequence=sequence,
            title="Scenario",
            description="Fixed simulation scenario",
            evidence=(DemoEvidence(label="Evidence", value="Simulated"),),
        ),
        baseline_before=baseline,
        estimate=make_estimate(cognitive_load=0.5, confidence=0.8),
        intervention=make_intervention(action_type="Silence"),
    )


def make_response() -> DemoRunResponse:
    """Build the exact ordered three-step demo response."""
    return DemoRunResponse(
        generated_at=NOW,
        steps=(
            make_step(1, "insufficient-evidence", 0.5),
            make_step(2, "long-meeting", 0.5),
            make_step(3, "deep-focus", 0.7),
        ),
        baseline_after=0.65,
    )


def test_demo_response_accepts_exact_ordered_scenarios() -> None:
    response = make_response()

    assert response.schema_version == "1.0"
    assert response.mode == "simulation"
    assert response.retention == "none"
    assert response.generated_at == NOW
    assert tuple((step.scenario.sequence, step.scenario.id) for step in response.steps) == (
        (1, "insufficient-evidence"),
        (2, "long-meeting"),
        (3, "deep-focus"),
    )
    assert tuple(step.baseline_before for step in response.steps) == (0.5, 0.5, 0.7)
    assert response.baseline_after == 0.65


def test_demo_response_serialization_schema_requires_all_response_fields() -> None:
    schema = DemoRunResponse.model_json_schema(mode="serialization")

    assert schema["required"] == [
        "schema_version",
        "mode",
        "generated_at",
        "retention",
        "steps",
        "baseline_after",
    ]


def test_demo_response_rejects_wrong_scenario_order() -> None:
    with pytest.raises(ValidationError):
        DemoRunResponse(
            generated_at=NOW,
            steps=(
                make_step(2, "long-meeting", 0.5),
                make_step(1, "insufficient-evidence", 0.5),
                make_step(3, "deep-focus", 0.7),
            ),
            baseline_after=0.65,
        )


def test_demo_response_rejects_wrong_id_sequence_pairing() -> None:
    with pytest.raises(ValidationError):
        DemoRunResponse(
            generated_at=NOW,
            steps=(
                make_step(1, "long-meeting", 0.5),
                make_step(2, "insufficient-evidence", 0.5),
                make_step(3, "deep-focus", 0.7),
            ),
            baseline_after=0.65,
        )


def test_demo_response_rejects_naive_generated_at() -> None:
    with pytest.raises(ValidationError):
        DemoRunResponse(
            generated_at=datetime(2026, 7, 15, 8, 0),
            steps=(
                make_step(1, "insufficient-evidence", 0.5),
                make_step(2, "long-meeting", 0.5),
                make_step(3, "deep-focus", 0.7),
            ),
            baseline_after=0.65,
        )


def test_demo_response_rejects_extra_fields() -> None:
    payload = make_response().model_dump()
    payload["unexpected"] = "not-public"

    with pytest.raises(ValidationError):
        DemoRunResponse.model_validate(payload)


def test_demo_response_round_trips_without_losing_tuple_order() -> None:
    response = make_response()

    restored = DemoRunResponse.model_validate(response.model_dump())
    json_restored = DemoRunResponse.model_validate_json(
        json.dumps(response.model_dump(mode="json"))
    )

    assert restored == response
    assert json_restored == response
    assert isinstance(json_restored.steps, tuple)
    assert tuple(step.scenario.id for step in json_restored.steps) == (
        "insufficient-evidence",
        "long-meeting",
        "deep-focus",
    )
