"""Simulated computer activity adapter for State Computing signals."""

import random
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Final, TypedDict, cast

from sense_engine.core.models.common import FiniteJsonValue
from sense_engine.core.models.signal_event import (
    ConsentScope,
    FeaturePayload,
    RetentionPolicy,
    SignalEvent,
    SignalQuality,
    SignalSource,
)

SCHEMA_VERSION: Final = "1.0"
ACTIVE_WINDOWS: Final = ("VS Code", "Google Chrome", "Terminal", "Figma", "Slack")
ACTIVITY_LEVELS: Final = ("Low", "Moderate", "High")


class ComputerActivityValue(TypedDict):
    """Versioned composite payload for one computer activity snapshot."""

    schema_version: str
    active_window: str
    typing_speed: str
    mouse_movement_frequency: str


def _utc_now() -> datetime:
    """Return the current timezone-aware UTC time."""
    return datetime.now(tz=UTC)


class ComputerActivityAdapter:
    """Generate simulated computer activity as one time-aligned signal event."""

    def __init__(
        self,
        *,
        device_id: str,
        consent_scope: ConsentScope,
        retention: RetentionPolicy,
        rng: random.Random | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._source = SignalSource(
            adapter="computer_activity_adapter",
            device_id=device_id,
            modality="computer_activity",
        )
        self._consent_scope = consent_scope
        self._retention = retention
        self._rng = rng if rng is not None else random.Random()
        self._clock = clock if clock is not None else _utc_now

    def capture_activity(self) -> SignalEvent:
        """Capture one simulated computer activity snapshot as a composite event."""
        value: ComputerActivityValue = {
            "schema_version": SCHEMA_VERSION,
            "active_window": self._rng.choice(ACTIVE_WINDOWS),
            "typing_speed": self._rng.choice(ACTIVITY_LEVELS),
            "mouse_movement_frequency": self._rng.choice(ACTIVITY_LEVELS),
        }
        return SignalEvent(
            time=self._clock(),
            source=self._source,
            feature=FeaturePayload(
                name="computer_activity_snapshot",
                value=cast(FiniteJsonValue, value),
                unit=None,
            ),
            quality=SignalQuality(
                score=0.85,
                completeness=1.0,
                reason="simulated_complete_snapshot",
            ),
            consent_scope=self._consent_scope,
            retention=self._retention,
        )
