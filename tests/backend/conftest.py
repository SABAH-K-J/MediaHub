"""Shared fixtures for isolated backend unit and integration tests."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from backend.api import create_app
from backend.config import clear_settings_cache
from backend.database import build_sqlite_engine, create_db_and_tables, set_engine
from backend.player import MPV_SESSIONS
from fastapi.testclient import TestClient


@pytest.fixture()
def isolated_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[dict[str, Path], None, None]:
    """Provide isolated SQLite DB, thumbnails directory, and sample media root."""
    db_path = tmp_path / "test_library.db"
    thumbs_dir = tmp_path / "thumbnails"
    media_root = tmp_path / "media"
    outside_dir = tmp_path / "outside"

    thumbs_dir.mkdir(parents=True, exist_ok=True)
    media_root.mkdir(parents=True, exist_ok=True)
    outside_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("MEDIAHUB_DB_PATH", str(db_path))
    monkeypatch.setenv("MEDIAHUB_THUMBNAILS_DIR", str(thumbs_dir))
    monkeypatch.setenv("MEDIAHUB_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:8000")
    monkeypatch.setenv("MPV_EXECUTABLE", "nonexistent_mpv_binary_for_test")
    monkeypatch.setenv("FFMPEG_EXECUTABLE", "nonexistent_ffmpeg_binary_for_test")
    monkeypatch.setenv("FFPROBE_EXECUTABLE", "nonexistent_ffprobe_binary_for_test")

    clear_settings_cache()
    engine = build_sqlite_engine(f"sqlite:///{db_path.as_posix()}")
    set_engine(engine)
    create_db_and_tables(engine)
    MPV_SESSIONS.clear()

    yield {
        "tmp": tmp_path,
        "db_path": db_path,
        "thumbs_dir": thumbs_dir,
        "media_root": media_root,
        "outside_dir": outside_dir,
    }

    MPV_SESSIONS.clear()
    engine.dispose()
    set_engine(None)
    clear_settings_cache()


@pytest.fixture()
def client(isolated_env: dict[str, Path]) -> Generator[TestClient, None, None]:
    """Return a FastAPI TestClient wired to the isolated environment."""
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client

