import subprocess
from pathlib import Path, PurePosixPath

REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIRED_WEB_FILES = (
    ".env.example",
    "package.json",
    "package-lock.json",
    "app/page.tsx",
    "app/layout.tsx",
    "components/SiteHeader.tsx",
    "lib/db.ts",
    "public/uploads/.gitkeep",
)
GENERATED_WEB_PATHS = (
    "web/next-env.d.ts",
    "web/tsconfig.tsbuildinfo",
    "web/.next/cache/probe",
    "web/node_modules/probe",
    "web/data/senseorder.db",
    "web/data/senseorder.db-wal",
    "web/data/media/probe",
    "web/public/uploads/probe",
)


def test_web_workspace_contains_required_files() -> None:
    missing = [path for path in REQUIRED_WEB_FILES if not (REPO_ROOT / "web" / path).is_file()]

    assert not missing, f"Missing required web workspace files: {missing}"


def test_web_workspace_does_not_track_local_artifacts() -> None:
    result = subprocess.run(
        ["git", "ls-files", "web"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    tracked_paths = [PurePosixPath(path) for path in result.stdout.splitlines()]

    forbidden = [
        str(path)
        for path in tracked_paths
        if "node_modules" in path.parts
        or ".next" in path.parts
        or path == PurePosixPath("web/next-env.d.ts")
        or (
            path.name.startswith(".env")
            and path != PurePosixPath("web/.env.example")
        )
        or path.name == ".DS_Store"
        or path.name.endswith(".db")
        or ".db-" in path.name
        or (
            path.is_relative_to("web/public/uploads")
            and path != PurePosixPath("web/public/uploads/.gitkeep")
        )
    ]

    assert not forbidden, f"Forbidden tracked web artifacts: {forbidden}"


def test_web_workspace_ignores_generated_paths() -> None:
    result = subprocess.run(
        ["git", "check-ignore", "--no-index", *GENERATED_WEB_PATHS],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    ignored_paths = result.stdout.splitlines()

    assert ignored_paths == list(GENERATED_WEB_PATHS)
