"""In-process state memory and individual-baseline calculation."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import isfinite
from typing import Final

from sense_engine.core.models.state_estimate import StateEstimate

Clock = Callable[[], datetime]
DEFAULT_BASELINE: Final = 0.5


def _utc_now() -> datetime:
    """Return the current timezone-aware UTC time."""
    return datetime.now(tz=UTC)


@dataclass(frozen=True, slots=True)
class _MemoryEntry:
    """Pair one runtime estimate with its memory write time."""

    recorded_at: datetime
    estimate: StateEstimate


class StateMemoryBank:
    """Store state estimates in process and calculate recent baselines."""

    def __init__(self, *, clock: Clock | None = None) -> None:
        self._clock = clock if clock is not None else _utc_now
        self._entries: list[_MemoryEntry] = []

    def save_event(self, estimate: StateEstimate) -> None:
        """Store an estimate with the current injected-clock time."""
        self._entries.append(_MemoryEntry(recorded_at=self._now(), estimate=estimate))

    def get_baseline(self, window_minutes: int = 60) -> float:
        """Return average recent cognitive load or a neutral cold-start value."""
        if window_minutes <= 0:
            raise ValueError("window_minutes must be positive")

        now = self._now()
        cutoff = now - timedelta(minutes=window_minutes)
        loads: list[float] = []
        for entry in self._entries:
            if not cutoff <= entry.recorded_at <= now:
                continue
            load = self._cognitive_load(entry.estimate)
            if load is not None:
                loads.append(load)
        return sum(loads) / len(loads) if loads else DEFAULT_BASELINE

    def _now(self) -> datetime:
        current = self._clock()
        if current.tzinfo is None or current.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return current

    @staticmethod
    def _cognitive_load(estimate: StateEstimate) -> float | None:
        value: object = estimate.dimensions.get("cognitive_load")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        load = float(value)
        return load if isfinite(load) else None
