"""Strict public response contracts for the SenseEngine demo API."""

from datetime import datetime
from typing import Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import NonEmptyStr, Probability
from sense_engine.core.models.intervention import Intervention
from sense_engine.core.models.state_estimate import StateEstimate

ScenarioId = Literal["insufficient-evidence", "long-meeting", "deep-focus"]


class DemoEvidence(ContractModel):
    """Represent one human-readable item of fixed demo evidence."""

    label: NonEmptyStr
    value: NonEmptyStr


class DemoScenario(ContractModel):
    """Describe one scenario in the fixed public demo sequence."""

    id: ScenarioId
    sequence: int = Field(ge=1, le=3)
    title: NonEmptyStr
    description: NonEmptyStr
    evidence: tuple[DemoEvidence, ...] = Field(min_length=1)


class DemoStep(ContractModel):
    """Compose one scenario with its state estimate and intervention."""

    scenario: DemoScenario
    baseline_before: Probability
    estimate: StateEstimate
    intervention: Intervention


class DemoRunResponse(ContractModel):
    """Return exactly one complete, ordered three-scenario simulation."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    schema_version: Literal["1.0"] = "1.0"
    mode: Literal["simulation"] = "simulation"
    generated_at: datetime
    retention: Literal["none"] = "none"
    steps: tuple[DemoStep, DemoStep, DemoStep]
    baseline_after: Probability

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, value: datetime) -> datetime:
        """Require an unambiguous timestamp at the public boundary."""
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("generated_at must be timezone-aware")
        return value

    @model_validator(mode="after")
    def validate_order(self) -> Self:
        """Require the exact public scenario order and ID/sequence pairings."""
        expected = (
            (1, "insufficient-evidence"),
            (2, "long-meeting"),
            (3, "deep-focus"),
        )
        actual = tuple((item.scenario.sequence, item.scenario.id) for item in self.steps)
        if actual != expected:
            raise ValueError("demo steps must use the fixed scenario order")
        return self


class ApiError(ContractModel):
    """Describe one sanitized public API error."""

    code: Literal["unauthorized", "invalid_request", "demo_unavailable"]
    message: NonEmptyStr


class ErrorResponse(ContractModel):
    """Wrap one public API error response."""

    error: ApiError
