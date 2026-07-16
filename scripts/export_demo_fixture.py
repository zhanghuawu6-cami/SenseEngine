"""Export the deterministic SenseEngine demo response fixture."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from sense_engine.api.demo_service import DemoService

USAGE = "Usage: export_demo_fixture.py OUTPUT\n"
FIXTURE_TIME = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


def main() -> int:
    """Run the real fixed demo and write its response to one output path."""
    if len(sys.argv) != 2:
        sys.stderr.write(USAGE)
        return 2

    response = DemoService(clock=lambda: FIXTURE_TIME).run()
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(
        response.model_dump(mode="json"),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    output.write_text(serialized + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
