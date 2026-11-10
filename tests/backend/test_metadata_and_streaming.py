"""Tests for metadata extraction deduplication, short clips, and HTTP Range streaming."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.database import VideoProgress, get_engine
from backend.metadata import compute_seek_seconds, extract_metadata_and_thumbnail
from backend.security import canonicalize_path, encode_b64_path


def test_compute_seek_seconds_clamps_short_clips() -> None:
    assert compute_seek_seconds(None) == 5.0
    assert compute_seek_seconds(1.0) == 0.0
    assert 0.0 <= compute_seek_seconds(4.0) < 4.0
    assert compute_seek_seconds(100.0) == pytest.approx(10.0)


def test_extract_metadata_handles_empty_streams_and_saves_thumbnail(
    isolated_env: dict[str, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_root = isolated_env["media_root"]
    video = media_root / "sample.mp4"
    video.write_bytes(b"0123456789")

    monkeypatch.setattr("backend.metadata._resolve_executable", lambda exe: exe)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **_kwargs):
        calls.append(cmd)
        if "ffprobe" in cmd[0]:
            mock = MagicMock(spec=subprocess.CompletedProcess)
            mock.returncode = 0
            mock.stdout = json.dumps({"format": {"duration": "3.2"}, "streams": []})
            return mock
        # ffmpeg writes thumbnail file at last arg
        Path(cmd[-1]).write_bytes(b"fake-jpg-bytes")
        mock = MagicMock(spec=subprocess.CompletedProcess)
        mock.returncode = 0
        return mock

    monkeypatch.setattr("backend.metadata.subprocess.run", fake_run)

    extract_metadata_and_thumbnail(str(video), target_engine=get_engine())
    assert len(calls) == 2

    # Second call should short-circuit if already complete (or skip ffmpeg since thumb exists)
    with Session(get_engine()) as session:
        vp = session.get(VideoProgress, canonicalize_path(str(video)))
        assert vp is not None
        assert vp.duration == pytest.approx(3.2)
        assert vp.size_bytes == 10
        assert vp.thumbnail_path is not None and Path(vp.thumbnail_path).is_file()


def test_http_range_streaming_200_206_416(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    video = media_root / "stream_test.mp4"
    payload = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    video.write_bytes(payload)

    client.post("/api/roots", json={"path": str(media_root)})
    encoded = encode_b64_path(str(video))

    full_res = client.get("/api/stream", params={"path": encoded})
    assert full_res.status_code == 200
    assert full_res.headers["accept-ranges"] == "bytes"
    assert full_res.content == payload

    partial_res = client.get(
        "/api/stream",
        params={"path": encoded},
        headers={"Range": "bytes=0-9"},
    )
    assert partial_res.status_code == 206
    assert partial_res.headers["content-range"] == f"bytes 0-9/{len(payload)}"
    assert partial_res.headers["content-length"] == "10"
    assert partial_res.content == payload[:10]

    suffix_res = client.get(
        "/api/stream",
        params={"path": encoded},
        headers={"Range": "bytes=-4"},
    )
    assert suffix_res.status_code == 206
    assert suffix_res.content == payload[-4:]

    bad_range = client.get(
        "/api/stream",
        params={"path": encoded},
        headers={"Range": "bytes=999-1005"},
    )
    assert bad_range.status_code == 416
    assert bad_range.headers["content-range"] == f"bytes */{len(payload)}"

