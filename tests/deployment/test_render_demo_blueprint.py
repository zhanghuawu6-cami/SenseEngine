from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
DEMO_BLUEPRINT_PATH = ROOT / "render.demo.yaml"
DEMO_SHARED_SECRET_GROUP = "senseorder-demo-shared-secrets"
API_SERVICE_NAME = "senseengine-api-demo-cami"
WEB_SERVICE_NAME = "senseorder-web-demo-cami"


def _blueprint() -> dict[str, Any]:
    loaded = yaml.safe_load(DEMO_BLUEPRINT_PATH.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict)
    return loaded


def _services(blueprint: dict[str, Any]) -> dict[str, dict[str, Any]]:
    services = blueprint["services"]
    assert isinstance(services, list)
    assert all(isinstance(service, dict) for service in services)
    keyed_services = {service["name"]: service for service in services}
    assert len(keyed_services) == len(services)
    return keyed_services


def _env_vars(service: dict[str, Any]) -> list[dict[str, Any]]:
    env_vars = service["envVars"]
    assert isinstance(env_vars, list)
    assert all(isinstance(env_var, dict) for env_var in env_vars)
    return env_vars


def _keyed_env_vars(service: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        env_var["key"]: env_var
        for env_var in _env_vars(service)
        if "key" in env_var
    }


def test_demo_blueprint_defines_only_two_free_web_services_without_disks() -> None:
    services = _services(_blueprint())

    assert set(services) == {API_SERVICE_NAME, WEB_SERVICE_NAME}
    assert all(service["type"] == "web" for service in services.values())
    assert all(service["plan"] == "free" for service in services.values())
    assert all("disk" not in service for service in services.values())
    assert all(service["autoDeployTrigger"] == "off" for service in services.values())
    assert {service["region"] for service in services.values()} == {"singapore"}


def test_demo_blueprint_generates_one_shared_engine_credential() -> None:
    blueprint = _blueprint()
    groups = blueprint["envVarGroups"]
    assert isinstance(groups, list)
    assert groups == [
        {
            "name": DEMO_SHARED_SECRET_GROUP,
            "envVars": [
                {"key": "SENSE_ENGINE_SERVICE_KEY", "generateValue": True}
            ],
        }
    ]

    for service in _services(blueprint).values():
        group_references = [
            env_var["fromGroup"]
            for env_var in _env_vars(service)
            if "fromGroup" in env_var
        ]
        assert group_references == [DEMO_SHARED_SECRET_GROUP]


def test_demo_api_uses_the_existing_container_and_readiness_endpoint() -> None:
    api = _services(_blueprint())[API_SERVICE_NAME]

    assert api["runtime"] == "docker"
    assert api["dockerfilePath"] == "./Dockerfile.api"
    assert api["dockerContext"] == "."
    assert api["healthCheckPath"] == "/health/ready"

    env_vars = _keyed_env_vars(api)
    assert env_vars == {
        "SENSE_ENGINE_ENV": {
            "key": "SENSE_ENGINE_ENV",
            "value": "production",
        },
        "UVICORN_LOG_LEVEL": {
            "key": "UVICORN_LOG_LEVEL",
            "value": "info",
        },
    }


def test_demo_web_uses_ephemeral_storage_and_the_authenticated_api_url() -> None:
    web = _services(_blueprint())[WEB_SERVICE_NAME]

    assert web["runtime"] == "docker"
    assert web["dockerfilePath"] == "./web/Dockerfile"
    assert web["dockerContext"] == "./web"
    assert web["healthCheckPath"] == "/api/health"

    env_vars = _keyed_env_vars(web)
    assert env_vars["DATABASE_PATH"] == {
        "key": "DATABASE_PATH",
        "value": "/tmp/senseorder-demo.db",
    }
    assert env_vars["MEDIA_ROOT"] == {
        "key": "MEDIA_ROOT",
        "value": "/tmp/senseorder-demo-media",
    }
    assert env_vars["SENSE_ENGINE_PRIVATE_URL"] == {
        "key": "SENSE_ENGINE_PRIVATE_URL",
        "value": f"https://{API_SERVICE_NAME}.onrender.com",
    }
    assert env_vars["NODE_ENV"] == {"key": "NODE_ENV", "value": "production"}
    assert env_vars["NEXT_PUBLIC_SITE_URL"] == {
        "key": "NEXT_PUBLIC_SITE_URL",
        "value": f"https://{WEB_SERVICE_NAME}.onrender.com",
    }


def test_demo_web_generates_operator_secrets_without_committing_values() -> None:
    web_env_vars = _keyed_env_vars(_services(_blueprint())[WEB_SERVICE_NAME])

    assert web_env_vars["ADMIN_EMAIL"] == {
        "key": "ADMIN_EMAIL",
        "value": "demo-admin@senseorder.local",
    }
    for key in ("ADMIN_PASSWORD", "SESSION_SECRET"):
        assert web_env_vars[key] == {"key": key, "generateValue": True}


def test_demo_blueprint_never_exposes_engine_credentials_to_the_browser() -> None:
    for service in _services(_blueprint()).values():
        for env_var in _env_vars(service):
            key = str(env_var.get("key", ""))
            value = str(env_var.get("value", ""))
            if key.startswith("NEXT_PUBLIC_"):
                public_content = f"{key} {value}".upper()
                assert "SERVICE_KEY" not in public_content
                assert "PRIVATE_URL" not in public_content
                assert API_SERVICE_NAME.upper() not in public_content
