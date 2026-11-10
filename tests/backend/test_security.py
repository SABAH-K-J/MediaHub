"""Tests for path security, root containment, hash validation, and encoding."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.security import (
    decode_b64_path,
    encode_b64_path,
    ensure_within_roots,
    is_allowed_video,
    sanitize_display_name,
    validate_file_hash,
)


def test_encode_and_decode_b64_unicode_paths() -> None:
    raw = r"D:\Videos\日本語\Film (2025) [1080p].mkv"
    encoded = encode_b64_path(raw)
    assert decode_b64_path(encoded) == raw
    # Unpadded URL-safe input must also decode cleanly
    assert decode_b64_path(encoded.rstrip("=")) == raw


def test_decode_b64_rejects_invalid_and_null_byte() -> None:
    with pytest.raises(ValueError):
        decode_b64_path("")
    with pytest.raises(ValueError):
        decode_b64_path("not-valid-utf8-\xff")
    null_b64 = encode_b64_path("C:/videos/movie.mp4\x00.txt")
    with pytest.raises(ValueError):
        decode_b64_path(null_b64)


def test_ensure_within_roots_blocks_traversal(tmp_path: Path) -> None:
    root = tmp_path / "library"
    root.mkdir()
    sibling = tmp_path / "library_secret"
    sibling.mkdir()
    nested = root / "shows"
    nested.mkdir()

    resolved = ensure_within_roots(str(nested), [str(root)])
    assert resolved == str(nested.resolve())

    with pytest.raises(PermissionError):
        ensure_within_roots(str(sibling), [str(root)])

    with pytest.raises(PermissionError):
        ensure_within_roots(str(root / ".." / "library_secret"), [str(root)])


def test_validate_file_hash_strict() -> None:
    valid = "a" * 64
    assert validate_file_hash(valid) == valid

    for bad in ["../secret", "A" * 64, "a" * 63, "g" * 64, "abc.jpg"]:
        with pytest.raises(ValueError):
            validate_file_hash(bad)


def test_allowed_video_and_sanitize_name() -> None:
    assert is_allowed_video("clip.MP4")
    assert is_allowed_video("movie.mkv")
    assert not is_allowed_video("notes.txt")
    assert sanitize_display_name("hello\x00\nworld\x1f.mp4") == "helloworld.mp4"


def test_api_rejects_thumbnail_traversal_and_outside_browse(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    outside = isolated_env["outside_dir"]
    (outside / "secret.mp4").write_bytes(b"0000")

    res = client.post("/api/roots", json={"path": str(media_root)})
    assert res.status_code == 201

    bad_thumb = client.get("/api/thumbnails/not-a-sha256")
    assert bad_thumb.status_code == 400

    outside_browse = client.get("/api/browse", params={"path": encode_b64_path(str(outside))})
    assert outside_browse.status_code == 403

    outside_stream = client.get(
        "/api/stream", params={"path": encode_b64_path(str(outside / "secret.mp4"))}
    )
    assert outside_stream.status_code == 403

    outside_play = client.post(
        "/api/play", json={"file_path": encode_b64_path(str(outside / "secret.mp4"))}
    )
    assert outside_play.status_code == 403

