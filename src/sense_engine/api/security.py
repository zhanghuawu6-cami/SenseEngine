"""Service-key configuration and constant-time authorization helpers."""

import hmac
import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ApiSettings:
    """Hold process-level settings for the private demo API."""

    service_key: str
    environment: str

    @classmethod
    def from_env(cls) -> "ApiSettings":
        """Load API settings and fail fast when the service key is absent."""
        service_key = os.getenv("SENSE_ENGINE_SERVICE_KEY")
        if not service_key:
            raise RuntimeError("SENSE_ENGINE_SERVICE_KEY is required")
        return cls(
            service_key=service_key,
            environment=os.getenv("SENSE_ENGINE_ENV", "development"),
        )


def is_authorized(provided: str | None, expected: str) -> bool:
    """Compare a provided service key with the configured key in constant time."""
    candidate = provided if provided is not None else ""
    return hmac.compare_digest(candidate.encode(), expected.encode())
