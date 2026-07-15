"""FastAPI application and process health endpoints."""

import logging
from typing import Annotated, Literal

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

from sense_engine.api.demo_service import DemoService
from sense_engine.api.schemas import ApiError, DemoRunResponse, ErrorResponse
from sense_engine.api.security import ApiSettings, is_authorized
from sense_engine.core.state_estimator import StateEstimator
from sense_engine.policy.intervention_policy import InterventionPolicy

logger = logging.getLogger(__name__)
ApiErrorCode = Literal["unauthorized", "invalid_request", "demo_unavailable"]


def error_response(
    status_code: int,
    code: ApiErrorCode,
    message: str,
) -> JSONResponse:
    """Build a sanitized non-cacheable public API error response."""
    response = ErrorResponse(error=ApiError(code=code, message=message))
    return JSONResponse(
        status_code=status_code,
        content=response.model_dump(mode="json"),
        headers={"Cache-Control": "no-store"},
    )


def create_app(
    *,
    settings: ApiSettings | None = None,
    service: DemoService | None = None,
) -> FastAPI:
    """Create the SenseEngine API application."""
    resolved_settings = settings if settings is not None else ApiSettings.from_env()
    resolved_service = service if service is not None else DemoService()
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

    @application.post("/v1/demo/run", response_model=DemoRunResponse)
    async def demo_run(
        request: Request,
        service_key: Annotated[
            str | None,
            Header(alias="X-SenseEngine-Service-Key"),
        ] = None,
    ) -> JSONResponse:
        """Run the fixed demo for an authenticated bodyless request."""
        if not is_authorized(service_key, resolved_settings.service_key):
            return error_response(401, "unauthorized", "Unauthorized.")

        if await request.body():
            return error_response(
                400,
                "invalid_request",
                "Request body is not allowed.",
            )

        try:
            result = resolved_service.run()
        except Exception as error:
            logger.error("demo_run_failed type=%s", type(error).__name__)
            return error_response(
                503,
                "demo_unavailable",
                "SenseEngine demo is temporarily unavailable.",
            )

        return JSONResponse(
            content=result.model_dump(mode="json"),
            headers={"Cache-Control": "no-store"},
        )

    return application


app = create_app()
