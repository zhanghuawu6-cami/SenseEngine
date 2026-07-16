from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
BLUEPRINT_PATH = ROOT / "render.yaml"
SHARED_SECRET_GROUP = "senseorder-shared-secrets"


def _blueprint() -> dict[str, Any]:
    loaded = yaml.safe_load(BLUEPRINT_PATH.read_text(encoding="utf-8"))
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


def test_render_blueprint_is_parseable_and_defines_exactly_two_services() -> None:
    blueprint = _blueprint()
    services = _services(blueprint)

    assert set(services) == {"senseengine-api", "senseorder-web"}


def test_shared_secret_group_generates_the_service_key() -> None:
    blueprint = _blueprint()
    groups = blueprint["envVarGroups"]
    assert isinstance(groups, list)
    assert all(isinstance(group, dict) for group in groups)

    shared_group = next(
        group for group in groups if group.get("name") == SHARED_SECRET_GROUP
    )
    assert shared_group["envVars"] == [
        {"key": "SENSE_ENGINE_SERVICE_KEY", "generateValue": True}
    ]


def test_api_is_a_private_docker_service_without_persistent_storage() -> None:
    api = _services(_blueprint())["senseengine-api"]

    assert api["type"] == "pserv"
    assert api["runtime"] == "docker"
    assert api["dockerfilePath"] == "./Dockerfile.api"
    assert api["dockerContext"] == "."
    assert api["healthCheckPath"] == "/health/ready"
    assert "disk" not in api

    env_vars = _keyed_env_vars(api)
    assert env_vars["SENSE_ENGINE_ENV"] == {
        "key": "SENSE_ENGINE_ENV",
        "value": "production",
    }
    assert env_vars["LOG_LEVEL"] == {"key": "LOG_LEVEL", "value": "info"}


def test_web_is_a_single_instance_docker_service_with_the_only_disk() -> None:
    services = _services(_blueprint())
    web = services["senseorder-web"]

    assert web["type"] == "web"
    assert web["runtime"] == "docker"
    assert web["dockerfilePath"] == "./web/Dockerfile"
    assert web["dockerContext"] == "./web"
    assert web["healthCheckPath"] == "/api/health"
    assert web["numInstances"] == 1
    assert web["disk"] == {
        "name": "senseorder-data",
        "mountPath": "/var/data",
        "sizeGB": 1,
    }

    disks = [service["disk"] for service in services.values() if "disk" in service]
    assert disks == [web["disk"]]

    env_vars = _keyed_env_vars(web)
    assert env_vars["DATABASE_PATH"] == {
        "key": "DATABASE_PATH",
        "value": "/var/data/senseorder.db",
    }
    assert env_vars["MEDIA_ROOT"] == {
        "key": "MEDIA_ROOT",
        "value": "/var/data/media",
    }
    assert env_vars["SENSE_ENGINE_PRIVATE_URL"] == {
        "key": "SENSE_ENGINE_PRIVATE_URL",
        "value": "http://senseengine-api:8000",
    }
    assert env_vars["NODE_ENV"] == {"key": "NODE_ENV", "value": "production"}


def test_services_share_secrets_privately_and_never_publish_engine_credentials() -> None:
    services = _services(_blueprint())

    for service in services.values():
        group_references = [
            env_var["fromGroup"]
            for env_var in _env_vars(service)
            if "fromGroup" in env_var
        ]
        assert group_references == [SHARED_SECRET_GROUP]

        for env_var in _env_vars(service):
            key = str(env_var.get("key", ""))
            value = str(env_var.get("value", ""))
            assert not key.startswith("NEXT_PUBLIC_SENSE_ENGINE")
            if key.startswith("NEXT_PUBLIC_"):
                public_content = f"{key} {value}".upper()
                assert "SERVICE_KEY" not in public_content
                assert "PRIVATE_URL" not in public_content
                assert "SENSEENGINE-API:8000" not in public_content


def test_operator_credentials_use_render_secret_input_or_generation() -> None:
    web_env_vars = _keyed_env_vars(_services(_blueprint())["senseorder-web"])

    for key in ("ADMIN_EMAIL", "ADMIN_PASSWORD", "SESSION_SECRET"):
        declaration = web_env_vars[key]
        has_secure_source = (
            declaration.get("sync") is False
            or declaration.get("generateValue") is True
        )
        assert has_secure_source
        assert "value" not in declaration


def test_services_use_one_fixed_region_and_disable_automatic_deploys() -> None:
    services = _services(_blueprint())
    regions = {service["region"] for service in services.values()}

    assert len(regions) == 1
    assert all(isinstance(region, str) and region for region in regions)
    for service in services.values():
        trigger = service["autoDeployTrigger"]
        assert isinstance(trigger, str)
        assert trigger == "off"
