"""Export the deterministic SenseEngine demo response fixture."""

import json
import os
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from sense_engine.api.demo_service import DemoService

USAGE = "Usage: export_demo_fixture.py OUTPUT\n"
FIXTURE_TIME = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)


def write_bytes_atomically(output: Path, content: bytes) -> None:
    """Replace an output only after its complete bytes are closed on disk."""
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=output.parent,
            prefix=f".{output.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(content)
            temporary.flush()
        os.replace(temporary_path, output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main() -> int:
    """Run the real fixed demo and write its response to one output path."""
    if len(sys.argv) != 2:
        sys.stderr.write(USAGE)
        return 2

    response = DemoService(clock=lambda: FIXTURE_TIME).run()
    output = Path(sys.argv[1])
    serialized = json.dumps(
        response.model_dump(mode="json"),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    write_bytes_atomically(output, (serialized + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
