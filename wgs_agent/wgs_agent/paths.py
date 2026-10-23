"""Path validation: keep tool I/O inside a work directory."""

from __future__ import annotations

from pathlib import Path


class PathEscapeError(ValueError):
    """Raised when a path resolves outside the work directory."""


def resolve_work_dir(work_dir: str | Path) -> Path:
    path = Path(work_dir).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"work directory does not exist: {path}")
    if not path.is_dir():
        raise NotADirectoryError(f"work directory is not a directory: {path}")
    return path


def safe_path(work_dir: Path, relative_or_name: str | Path) -> Path:
    """Resolve a user-supplied path and ensure it stays under work_dir."""
    work = work_dir.resolve()
    candidate = Path(relative_or_name)
    if candidate.is_absolute():
        resolved = candidate.resolve()
    else:
        resolved = (work / candidate).resolve()
    try:
        resolved.relative_to(work)
    except ValueError as exc:
        raise PathEscapeError(
            f"path escapes work directory: {relative_or_name!r} -> {resolved}"
        ) from exc
    return resolved
