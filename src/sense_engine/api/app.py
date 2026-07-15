"""FastAPI application and process health endpoints."""

from fastapi import FastAPI

from sense_engine.core.state_estimator import StateEstimator
from sense_engine.policy.intervention_policy import InterventionPolicy


def create_app() -> FastAPI:
    """Create the SenseEngine API application."""
    application = FastAPI(title="SenseEngine API", version="1.0.0")

    @application.get("/health/live")
    def health_live() -> dict[str, str]:
        """Report that the API process is running."""
        return {"status": "alive"}

    @application.get("/health/ready")
    def health_ready() -> dict[str, str]:
        """Report that core service components can be constructed."""
        StateEstimator()
        InterventionPolicy()
        return {"status": "ready"}

    return application


app = create_app()
