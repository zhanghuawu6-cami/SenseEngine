"""Calm, uncertainty-aware intervention policy decisions."""

from dataclasses import dataclass
from math import isfinite
from typing import Final

from sense_engine.core.models.intervention import (
    ActionSpec,
    Intervention,
    Reversibility,
    RiskAssessment,
    RiskLevel,
)
from sense_engine.core.models.state_estimate import StateEstimate


@dataclass(frozen=True, slots=True)
class _DecisionSpec:
    """Map one policy decision to the complete intervention contract."""

    objective: str
    action_type: str
    channel: str
    rationale: str
    reversibility_method: str
    cognitive_load_effect: float


ASK: Final = _DecisionSpec(
    objective="confirm-current-state",
    action_type="Ask",
    channel="user-prompt",
    rationale="系统不确定当前状态，需要用户确认",
    reversibility_method="dismiss-prompt",
    cognitive_load_effect=0.0,
)
SUGGEST_BREAK: Final = _DecisionSpec(
    objective="reduce-cognitive-load",
    action_type="Suggest Break",
    channel="recommendation",
    rationale="认知负荷显著高于个人基线，建议休息",
    reversibility_method="dismiss-suggestion",
    cognitive_load_effect=-0.2,
)
SILENCE: Final = _DecisionSpec(
    objective="preserve-focus",
    action_type="Silence",
    channel="none",
    rationale="状态良好，保持安静",
    reversibility_method="no-action-required",
    cognitive_load_effect=0.0,
)


class InterventionPolicy:
    """Choose a restrained declarative intervention from state evidence."""

    def decide_action(
        self,
        estimate: StateEstimate,
        baseline: float,
    ) -> Intervention:
        """Apply policy priority and return a complete intervention contract."""
        if estimate.confidence < 0.5:
            decision = ASK
        elif self._is_overload(estimate, baseline):
            decision = SUGGEST_BREAK
        else:
            decision = SILENCE
        return self._build_intervention(decision)

    @staticmethod
    def _is_overload(estimate: StateEstimate, baseline: float) -> bool:
        value: object = estimate.dimensions.get("cognitive_load")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        cognitive_load = float(value)
        return (
            isfinite(cognitive_load)
            and cognitive_load > baseline + 0.2
            and estimate.confidence >= 0.7
        )

    @staticmethod
    def _build_intervention(decision: _DecisionSpec) -> Intervention:
        return Intervention(
            objective=decision.objective,
            action=ActionSpec(
                type=decision.action_type,
                channel=decision.channel,
                parameters={},
            ),
            risk=RiskAssessment(
                level=RiskLevel.LOW,
                rationale=decision.rationale,
            ),
            reversibility=Reversibility(
                is_reversible=True,
                method=decision.reversibility_method,
                recovery_seconds=0.0,
            ),
            expected_effect={
                "cognitive_load": decision.cognitive_load_effect,
            },
        )
