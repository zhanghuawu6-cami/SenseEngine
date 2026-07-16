"""Export the deterministic SenseEngine OpenAPI contract."""

import json
import os
import sys
import tempfile
from pathlib import Path

USAGE = "Usage: export_openapi.py OUTPUT\n"


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
    """Write the current application OpenAPI schema to one output path."""
    if len(sys.argv) != 2:
        sys.stderr.write(USAGE)
        return 2

    from sense_engine.api.app import app

    output = Path(sys.argv[1])
    serialized = json.dumps(
        app.openapi(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    write_bytes_atomically(output, (serialized + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
