# SenseEngine

SenseEngine is the typed contract foundation for the State Computing v0.2 system. It defines
stable Python package boundaries and provides the project tooling needed to evolve those
contracts safely.

The package is organized into five modules:

- `core`: shared State Computing contracts and types.
- `adapters`: the boundary for converting external signals into contract inputs.
- `memory`: the boundary for state memory capabilities.
- `policy`: the boundary for intervention policy capabilities.
- `api`: the boundary for exposing contracts through an API.

This foundation intentionally implements no inference, storage, policy execution, intervention
execution, or API routes.

## Development

SenseEngine requires Python 3.11 or newer.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
pytest
ruff check .
mypy
```
