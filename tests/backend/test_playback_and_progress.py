"""Tests for mpv launching, session race protection, watch/unwatch, and progress sync."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from backend.database import get_engine
from backend.player import MPV_SESSIONS, MpvSession
from backend.security import canonicalize_path, encode_b64_path, normalize_for_compare
from fastapi.testclient import TestClient


def test_watch_unwatch_progress_sync_and_last_watched(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    video = media_root / "episode1.mp4"
    video.write_bytes(b"video-data")
    encoded = encode_b64_path(str(video))

    client.post("/api/roots", json={"path": str(media_root)})

    # Sync 50% progress -> should appear in /api/last-watched
    p1 = client.post(
        "/api/file/progress",
        json={"file_path": encoded, "position_sec": 50.0, "duration_sec": 100.0},
    )
    assert p1.status_code == 200
    d1 = p1.json()
    assert d1["watched"] is False
    assert d1["progress_ratio"] == pytest.approx(0.5)
    assert d1["last_position_sec"] == pytest.approx(50.0)

    lw = client.get("/api/last-watched")
    assert lw.status_code == 200
    assert lw.json()["name"] == "episode1.mp4"

    # Sync 92% progress -> auto-marked watched and cleared from last-watched
    p2 = client.post(
        "/api/file/progress",
        json={"file_path": encoded, "position_sec": 92.0, "duration_sec": 100.0},
    )
    assert p2.status_code == 200
    d2 = p2.json()
    assert d2["watched"] is True
    assert d2["progress_ratio"] == 1.0
    assert d2["last_position_sec"] is None
    assert client.get("/api/last-watched").json() is None

    # Manual unwatch and manual watch
    uw = client.post("/api/file/unwatch", json={"file_path": encoded})
    assert uw.status_code == 200
    assert uw.json()["watched"] is False
    assert uw.json()["progress_ratio"] == 0.0

    mw = client.post("/api/file/watch", json={"file_path": encoded})
    assert mw.status_code == 200
    assert mw.json()["watched"] is True
    assert mw.json()["progress_ratio"] == 1.0


def test_play_returns_503_when_mpv_missing_and_health_reports_status(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    video = media_root / "clip.mp4"
    video.write_bytes(b"video-data")

    client.post("/api/roots", json={"path": str(media_root)})

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["mpv_available"] is False

    res = client.post("/api/play", json={"file_path": encode_b64_path(str(video))})
    assert res.status_code == 503


def test_mpv_command_uses_option_delimiter_and_race_free_session_cleanup(
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    tricky = media_root / "--sub-file=evil.mp4"
    tricky.write_bytes(b"video-data")

    s1 = MpvSession(str(tricky), start_sec=12.5, target_engine=get_engine())
    cmd = s1.build_command("/usr/bin/mpv")
    assert cmd[-2:] == ["--", canonicalize_path(str(tricky))]
    assert any(arg.startswith("--start=12.500") for arg in cmd)

    # Simulate s1 replaced by s2 in MPV_SESSIONS before s1's watcher finishes
    s2 = MpvSession(str(tricky), start_sec=None, target_engine=get_engine())
    key = normalize_for_compare(str(tricky))
    MPV_SESSIONS[key] = s2

    s1.proc = MagicMock()
    s1.proc.wait.return_value = 0
    s1.time_pos = 30.0
    s1.duration = 100.0
    s1._watcher_loop()

    # s2 must still remain registered in MPV_SESSIONS!
    assert MPV_SESSIONS.get(key) is s2
    MPV_SESSIONS.clear()

