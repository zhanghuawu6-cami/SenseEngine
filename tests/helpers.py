"""Factories for complete core contracts used by API tests."""

from sense_engine.core.models.intervention import (
    ActionSpec,
    Intervention,
    Reversibility,
    RiskAssessment,
    RiskLevel,
)
from sense_engine.core.models.state_estimate import StateEstimate


def make_estimate(*, cognitive_load: float, confidence: float) -> StateEstimate:
    """Build a complete state estimate without behavior logic."""
    return StateEstimate(
        dimensions={"cognitive_load": cognitive_load},
        distribution={
            "flow": 0.25,
            "friction": 0.25,
            "cognitive_overload": 0.25,
            "unknown": 0.25,
        },
        confidence=confidence,
        missingness={},
        model_version="test-model",
        explanation=("test evidence",),
    )


def make_intervention(*, action_type: str) -> Intervention:
    """Build a complete low-risk reversible intervention without behavior logic."""
    return Intervention(
        objective="test-objective",
        action=ActionSpec(type=action_type, channel="none", parameters={}),
        risk=RiskAssessment(level=RiskLevel.LOW, rationale="test safety rationale"),
        reversibility=Reversibility(
            is_reversible=True,
            method="dismiss",
            recovery_seconds=0.0,
        ),
        expected_effect={"cognitive_load": 0.0},
    )
