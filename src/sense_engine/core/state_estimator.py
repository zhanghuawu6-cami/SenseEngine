"""Probabilistic and explainable rule-based state estimation."""

from dataclasses import dataclass
from datetime import datetime
from typing import Final

from sense_engine.core.models.context_snapshot import ContextSnapshot
from sense_engine.core.models.signal_event import SignalEvent
from sense_engine.core.models.state_estimate import StateEstimate

MODEL_VERSION: Final = "state-estimator-rules-v0.1"


@dataclass(frozen=True, slots=True)
class StateBaseline:
    """Individual comparison values used by the first rule engine."""

    flow_typing_speed: str = "High"
    flow_mouse_movement_frequency: str = "Low"
    friction_typing_speed: str = "Low"
    friction_mouse_movement_frequency: str = "High"
    meeting_overload_minutes: float = 60.0


@dataclass(frozen=True, slots=True)
class _ComputerActivity:
    """Validated subset of a composite computer activity event."""

    typing_speed: str
    mouse_movement_frequency: str


class StateEstimator:
    """Apply ordered rules and return probability-first state estimates."""

    def __init__(self, baseline: StateBaseline | None = None) -> None:
        self._baseline = baseline if baseline is not None else StateBaseline()

    def estimate(
        self,
        signal_events: list[SignalEvent],
        context: ContextSnapshot,
    ) -> StateEstimate:
        """Estimate a state distribution from signal and context evidence."""
        computer_activity = self._latest_computer_activity(signal_events)
        meeting_minutes = self._longest_meeting_minutes(context)
        missingness = {
            "computer_activity": 0.0 if computer_activity is not None else 1.0,
            "calendar_context": 0.0 if meeting_minutes is not None else 1.0,
        }

        if self._is_long_meeting(context, meeting_minutes):
            assert meeting_minutes is not None
            explanation = (
                f"Meeting duration of {meeting_minutes:g} minutes exceeds the "
                f"{self._baseline.meeting_overload_minutes:g}-minute baseline."
            )
            return self._build_estimate(
                probabilities=(0.05, 0.05, 0.80),
                confidence=0.80,
                cognitive_load=0.90,
                explanation=explanation,
                missingness=missingness,
            )

        if computer_activity is not None and self._is_friction(computer_activity):
            return self._build_estimate(
                probabilities=(0.10, 0.70, 0.10),
                confidence=0.70,
                cognitive_load=0.65,
                explanation=(
                    "Low typing speed combined with high mouse movement indicates "
                    "interaction friction."
                ),
                missingness=missingness,
            )

        if computer_activity is not None and self._is_flow(computer_activity):
            return self._build_estimate(
                probabilities=(0.85, 0.05, 0.05),
                confidence=0.85,
                cognitive_load=0.55,
                explanation=(
                    "High typing speed combined with low mouse movement indicates "
                    "deep focus."
                ),
                missingness=missingness,
            )

        return self._build_estimate(
            probabilities=(0.20, 0.20, 0.20),
            confidence=0.40,
            cognitive_load=0.50,
            explanation="Available evidence does not strongly support a specific state.",
            missingness=missingness,
        )

    def _is_flow(self, activity: _ComputerActivity) -> bool:
        return (
            activity.typing_speed == self._baseline.flow_typing_speed
            and activity.mouse_movement_frequency
            == self._baseline.flow_mouse_movement_frequency
        )

    def _is_friction(self, activity: _ComputerActivity) -> bool:
        return (
            activity.typing_speed == self._baseline.friction_typing_speed
            and activity.mouse_movement_frequency
            == self._baseline.friction_mouse_movement_frequency
        )

    def _is_long_meeting(
        self,
        context: ContextSnapshot,
        meeting_minutes: float | None,
    ) -> bool:
        return (
            context.activity is not None
            and context.activity.name.casefold() == "meeting"
            and meeting_minutes is not None
            and meeting_minutes > self._baseline.meeting_overload_minutes
        )

    @staticmethod
    def _latest_computer_activity(
        signal_events: list[SignalEvent],
    ) -> _ComputerActivity | None:
        valid_events: list[tuple[datetime, _ComputerActivity]] = []
        for event in signal_events:
            if event.feature.name != "computer_activity_snapshot":
                continue
            value = event.feature.value
            if not isinstance(value, dict):
                continue
            typing_speed = value.get("typing_speed")
            mouse_frequency = value.get("mouse_movement_frequency")
            if not isinstance(typing_speed, str) or not isinstance(mouse_frequency, str):
                continue
            valid_events.append(
                (
                    event.time,
                    _ComputerActivity(
                        typing_speed=typing_speed,
                        mouse_movement_frequency=mouse_frequency,
                    ),
                )
            )
        if not valid_events:
            return None
        return max(valid_events, key=lambda item: item[0])[1]

    @staticmethod
    def _longest_meeting_minutes(context: ContextSnapshot) -> float | None:
        durations = [
            (item.ends_at - item.starts_at).total_seconds() / 60.0
            for item in context.calendar
            if item.event_type.casefold() == "meeting"
            and item.busy
            and item.ends_at > item.starts_at
        ]
        return max(durations) if durations else None

    @staticmethod
    def _build_estimate(
        *,
        probabilities: tuple[float, float, float],
        confidence: float,
        cognitive_load: float,
        explanation: str,
        missingness: dict[str, float],
    ) -> StateEstimate:
        flow, friction, cognitive_overload = probabilities
        unknown = 1.0 - sum(probabilities)
        return StateEstimate(
            dimensions={"cognitive_load": cognitive_load},
            distribution={
                "flow": flow,
                "friction": friction,
                "cognitive_overload": cognitive_overload,
                "unknown": unknown,
            },
            confidence=confidence,
            missingness=missingness,
            model_version=MODEL_VERSION,
            explanation=(explanation,),
        )
