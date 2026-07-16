"""Export the deterministic SenseEngine OpenAPI contract."""

import json
import sys
from pathlib import Path

from sense_engine.api.app import app

USAGE = "Usage: export_openapi.py OUTPUT\n"


def main() -> int:
    """Write the current application OpenAPI schema to one output path."""
    if len(sys.argv) != 2:
        sys.stderr.write(USAGE)
        return 2

    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(
        app.openapi(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    output.write_text(serialized + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
