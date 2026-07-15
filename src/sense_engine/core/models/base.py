"""Strict v0.2 base configuration for SenseEngine data contracts."""

from pydantic import BaseModel, ConfigDict


class ContractModel(BaseModel):
    """Disable field rebinding; callers treat nested containers as read-only by convention."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
