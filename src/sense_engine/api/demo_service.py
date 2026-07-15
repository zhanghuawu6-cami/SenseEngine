"""Request-isolated orchestration for the fixed SenseEngine demo run."""

from collections.abc import Callable
from datetime import UTC, datetime

from sense_engine.api.demo_scenarios import build_demo_scenarios
from sense_engine.api.schemas import DemoRunResponse, DemoStep
from sense_engine.core.state_estimator import StateEstimator
from sense_engine.memory.state_memory import StateMemoryBank
from sense_engine.policy.intervention_policy import InterventionPolicy

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    """Return the current timezone-aware UTC time."""
    return datetime.now(tz=UTC)


class DemoService:
    """Run the fixed demo loop with memory isolated to one request."""

    def __init__(
        self,
        *,
        clock: Clock = utc_now,
        estimator: StateEstimator | None = None,
        policy: InterventionPolicy | None = None,
    ) -> None:
        self._clock = clock
        self._estimator = estimator if estimator is not None else StateEstimator()
        self._policy = policy if policy is not None else InterventionPolicy()

    def run(self) -> DemoRunResponse:
        """Run the ordered three-scenario demo with a fresh memory bank."""
        generated_at = self._clock()
        if generated_at.tzinfo is None or generated_at.utcoffset() is None:
            raise ValueError("demo clock must be timezone-aware")
        generated_at = generated_at.astimezone(UTC)

        memory = StateMemoryBank(clock=lambda: generated_at)
        steps: list[DemoStep] = []
        for scenario in build_demo_scenarios(generated_at):
            estimate = self._estimator.estimate(
                list(scenario.signal_events),
                scenario.context,
            )
            baseline = memory.get_baseline()
            memory.save_event(estimate)
            intervention = self._policy.decide_action(estimate, baseline)
            steps.append(
                DemoStep(
                    scenario=scenario.scenario,
                    baseline_before=baseline,
                    estimate=estimate,
                    intervention=intervention,
                )
            )

        return DemoRunResponse(
            generated_at=generated_at,
            steps=(steps[0], steps[1], steps[2]),
            baseline_after=memory.get_baseline(),
        )
