"""Tests for calm, uncertainty-aware intervention decisions."""

from sense_engine.core.models.intervention import Intervention, RiskLevel
from sense_engine.core.models.state_estimate import StateEstimate
from sense_engine.policy.intervention_policy import InterventionPolicy


def make_estimate(
    *,
    cognitive_load: float | None,
    confidence: float,
) -> StateEstimate:
    """Build a state estimate for policy rule tests."""
    dimensions = (
        {"cognitive_load": cognitive_load}
        if cognitive_load is not None
        else {"engagement": 0.5}
    )
    return StateEstimate(
        dimensions=dimensions,
        distribution={"flow": 0.5, "unknown": 0.5},
        confidence=confidence,
        missingness={},
        model_version="policy-test-v0.1",
        explanation=("Synthetic estimate for policy tests.",),
    )


def test_low_confidence_returns_complete_ask_intervention() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=0.9, confidence=0.49),
        baseline=0.5,
    )

    assert isinstance(intervention, Intervention)
    assert intervention.objective == "confirm-current-state"
    assert intervention.action.type == "Ask"
    assert intervention.action.channel == "user-prompt"
    assert intervention.action.parameters == {}
    assert intervention.risk.level is RiskLevel.LOW
    assert intervention.risk.rationale == "系统不确定当前状态，需要用户确认"
    assert intervention.reversibility.is_reversible is True
    assert intervention.reversibility.method == "dismiss-prompt"
    assert intervention.reversibility.recovery_seconds == 0.0
    assert intervention.expected_effect == {"cognitive_load": 0.0}


def test_overload_returns_complete_suggest_break_intervention() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=0.71, confidence=0.7),
        baseline=0.5,
    )

    assert intervention.objective == "reduce-cognitive-load"
    assert intervention.action.type == "Suggest Break"
    assert intervention.action.channel == "recommendation"
    assert intervention.action.parameters == {}
    assert intervention.risk.level is RiskLevel.LOW
    assert intervention.risk.rationale == "认知负荷显著高于个人基线，建议休息"
    assert intervention.reversibility.is_reversible is True
    assert intervention.reversibility.method == "dismiss-suggestion"
    assert intervention.reversibility.recovery_seconds == 0.0
    assert intervention.expected_effect == {"cognitive_load": -0.2}


def test_normal_state_returns_complete_silence_intervention() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=0.7, confidence=0.9),
        baseline=0.5,
    )

    assert intervention.objective == "preserve-focus"
    assert intervention.action.type == "Silence"
    assert intervention.action.channel == "none"
    assert intervention.action.parameters == {}
    assert intervention.risk.level is RiskLevel.LOW
    assert intervention.risk.rationale == "状态良好，保持安静"
    assert intervention.reversibility.is_reversible is True
    assert intervention.reversibility.method == "no-action-required"
    assert intervention.reversibility.recovery_seconds == 0.0
    assert intervention.expected_effect == {"cognitive_load": 0.0}


def test_low_confidence_ask_has_priority_over_high_load() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=1.0, confidence=0.4),
        baseline=0.5,
    )

    assert intervention.action.type == "Ask"


def test_missing_cognitive_load_keeps_policy_silent() -> None:
    intervention = InterventionPolicy().decide_action(
        make_estimate(cognitive_load=None, confidence=0.9),
        baseline=0.5,
    )

    assert intervention.action.type == "Silence"
