"""Test defaults for the API boundary."""

import os

import pytest

_TEST_ENVIRONMENT = {
    "SENSE_ENGINE_SERVICE_KEY": "test-service-key",
    "SENSE_ENGINE_ENV": "test",
}
_CALLER_ENVIRONMENT = {
    name: os.environ.get(name)
    for name in _TEST_ENVIRONMENT
}
os.environ.update(_TEST_ENVIRONMENT)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Restore the caller's service environment after the API test session."""
    del session, exitstatus
    for name, value in _CALLER_ENVIRONMENT.items():
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value
