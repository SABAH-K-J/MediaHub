"""Tests for library root CRUD, browsing, search/status/sort, and parent clamping."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.database import VideoProgress, get_engine
from backend.metadata import generate_file_hash
from backend.security import canonicalize_path, encode_b64_path


def test_roots_crud_and_validation(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]

    missing = client.post("/api/roots", json={"path": str(media_root / "does_not_exist")})
    assert missing.status_code == 400

    extra_field = client.post("/api/roots", json={"path": str(media_root), "unknown": 1})
    assert extra_field.status_code == 422

    created = client.post("/api/roots", json={"path": str(media_root), "label": "Movies"})
    assert created.status_code == 201
    root_data = created.json()
    assert root_data["label"] == "Movies"

    duplicate = client.post("/api/roots", json={"path": str(media_root)})
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == root_data["id"]

    listing = client.get("/api/roots")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    deleted = client.delete(f"/api/roots/{root_data['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deleted"

    deleted_again = client.delete(f"/api/roots/{root_data['id']}")
    assert deleted_again.status_code == 404


def test_browse_clamps_parent_builds_breadcrumbs_and_filters(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    shows_dir = media_root / "Shows"
    empty_dir = media_root / "EmptyFolder"
    shows_dir.mkdir()
    empty_dir.mkdir()
    (empty_dir / "readme.txt").write_text("not a video", encoding="utf-8")

    v1 = shows_dir / "alpha.mp4"
    v2 = shows_dir / "beta.mkv"
    v3 = shows_dir / "gamma.webm"
    v1.write_bytes(b"a" * 100)
    v2.write_bytes(b"b" * 300)
    v3.write_bytes(b"c" * 200)

    client.post("/api/roots", json={"path": str(media_root)})

    now = datetime.now(timezone.utc)
    with Session(get_engine()) as session:
        c1 = canonicalize_path(str(v1))
        c2 = canonicalize_path(str(v2))
        c3 = canonicalize_path(str(v3))
        session.add(
            VideoProgress(
                file_path=c1,
                file_hash=generate_file_hash(c1),
                watched=True,
                progress_ratio=1.0,
                duration=120.0,
                size_bytes=100,
                watch_date=now - timedelta(hours=2),
            )
        )
        session.add(
            VideoProgress(
                file_path=c2,
                file_hash=generate_file_hash(c2),
                watched=False,
                progress_ratio=0.4,
                last_position_sec=80.0,
                duration=200.0,
                size_bytes=300,
                watch_date=now - timedelta(minutes=5),
            )
        )
        session.add(
            VideoProgress(
                file_path=c3,
                file_hash=generate_file_hash(c3),
                watched=False,
                progress_ratio=0.0,
                duration=50.0,
                size_bytes=200,
            )
        )
        session.commit()

    root_res = client.get("/api/browse", params={"path": encode_b64_path(str(media_root))})
    assert root_res.status_code == 200
    root_payload = root_res.json()
    assert root_payload["parent_path"] is None
    assert len(root_payload["breadcrumbs"]) == 1
    # Only Shows should appear (EmptyFolder has no videos)
    assert [item["name"] for item in root_payload["items"]] == ["Shows"]

    shows_res = client.get(
        "/api/browse",
        params={"path": encode_b64_path(str(shows_dir)), "sort": "size"},
    )
    assert shows_res.status_code == 200
    shows_payload = shows_res.json()
    assert shows_payload["parent_path"] == canonicalize_path(str(media_root))
    assert [b["name"] for b in shows_payload["breadcrumbs"]] == [media_root.name, "Shows"]
    assert [i["name"] for i in shows_payload["items"]] == ["beta.mkv", "gamma.webm", "alpha.mp4"]

    in_prog = client.get(
        "/api/browse",
        params={"path": encode_b64_path(str(shows_dir)), "status": "in_progress"},
    )
    assert [i["name"] for i in in_prog.json()["items"]] == ["beta.mkv"]

    watched = client.get(
        "/api/browse",
        params={"path": encode_b64_path(str(shows_dir)), "status": "watched"},
    )
    assert [i["name"] for i in watched.json()["items"]] == ["alpha.mp4"]

    searched = client.get(
        "/api/browse",
        params={"path": encode_b64_path(str(shows_dir)), "q": "gam"},
    )
    assert [i["name"] for i in searched.json()["items"]] == ["gamma.webm"]


def test_contains_video_handles_symlink_loops_safely(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    from backend.api import _contains_video

    media_root = isolated_env["media_root"]
    nested = media_root / "loop_dir"
    nested.mkdir()
    loop_link = nested / "self_link"

    try:
        os.symlink(str(media_root), str(loop_link), target_is_directory=True)
    except OSError:
        # Windows without Developer Mode / symlink privilege: verify depth guard directly
        deep = media_root
        for i in range(15):
            deep = deep / f"d{i}"
            deep.mkdir()
        (deep / "hidden.mp4").write_bytes(b"123")
        assert _contains_video(str(media_root), max_depth=3) is False
        assert _contains_video(str(media_root), max_depth=20) is True
        return

    assert _contains_video(str(media_root), max_depth=12) is False

