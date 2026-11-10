"""Media metadata and thumbnail extraction via ffprobe and ffmpeg."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Optional

from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from backend.config import get_settings
from backend.database import VideoProgress, get_engine
from backend.security import canonicalize_path, normalize_for_compare

logger = logging.getLogger(__name__)

_in_flight_lock = threading.Lock()
_in_flight_paths: set[str] = set()

_SUBPROCESS_TIMEOUT_SEC = 15


def generate_file_hash(file_path: str) -> str:
    """Compute deterministic SHA-256 hex digest of normalized canonical file path."""
    import hashlib

    normalized = normalize_for_compare(file_path)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _resolve_executable(configured: str) -> Optional[str]:
    if os.path.isfile(configured):
        return configured
    return shutil.which(configured)


def is_ffmpeg_available() -> bool:
    """Return True if ffmpeg executable can be resolved."""
    return _resolve_executable(get_settings().ffmpeg_executable) is not None


def is_ffprobe_available() -> bool:
    """Return True if ffprobe executable can be resolved."""
    return _resolve_executable(get_settings().ffprobe_executable) is not None


def _windows_startupinfo() -> Optional[subprocess.STARTUPINFO]:  # type: ignore[name-defined]
    if os.name == "nt":
        info = subprocess.STARTUPINFO()  # type: ignore[attr-defined]
        info.dwFlags |= subprocess.STARTF_USESHOWWINDOW  # type: ignore[attr-defined]
        return info
    return None


def compute_seek_seconds(duration: Optional[float]) -> float:
    """Compute a safe thumbnail seek timestamp clamped inside video duration."""
    if duration is None or duration <= 0:
        return 5.0
    if duration <= 1.5:
        return 0.0
    if duration < 10.0:
        return min(max(1.0, duration * 0.1), max(0.0, duration - 0.5))
    return min(max(1.0, duration * 0.1), duration - 1.0)


def _format_resolution(height: Optional[int]) -> Optional[str]:
    if not height or height <= 0:
        return None
    if height >= 2160:
        return "4K"
    if height >= 1440:
        return "1440p"
    if height >= 1080:
        return "1080p"
    if height >= 720:
        return "720p"
    if height >= 480:
        return "480p"
    return f"{height}p"


def _probe_video(ffprobe_bin: str, file_path: str) -> tuple[Optional[float], Optional[str]]:
    """Run ffprobe with timeout and return (duration_sec, resolution_label)."""
    cmd = [
        ffprobe_bin,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration:format=duration",
        "-of",
        "json",
        file_path,
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_SUBPROCESS_TIMEOUT_SEC,
            startupinfo=_windows_startupinfo(),
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.warning("ffprobe failed for %s: %s", file_path, exc)
        return None, None

    if result.returncode != 0 or not result.stdout.strip():
        return None, None

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None, None

    format_info = data.get("format") or {}
    streams = data.get("streams") or []
    stream_info = streams[0] if isinstance(streams, list) and streams else {}

    duration: Optional[float] = None
    dur_raw = format_info.get("duration") or stream_info.get("duration")
    if dur_raw is not None:
        try:
            parsed = float(dur_raw)
            if parsed > 0:
                duration = parsed
        except (TypeError, ValueError):
            duration = None

    height_raw = stream_info.get("height")
    resolution: Optional[str] = None
    if height_raw is not None:
        try:
            resolution = _format_resolution(int(height_raw))
        except (TypeError, ValueError):
            resolution = None

    return duration, resolution


def _generate_thumbnail(
    ffmpeg_bin: str,
    file_path: str,
    thumb_path: Path,
    duration: Optional[float],
) -> bool:
    """Capture one JPEG thumbnail frame with timeout. Return True on success."""
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    seek_sec = compute_seek_seconds(duration)
    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss",
        f"{seek_sec:.3f}",
        "-i",
        file_path,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-vf",
        "scale=320:-1",
        str(thumb_path),
    ]
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=_SUBPROCESS_TIMEOUT_SEC,
            startupinfo=_windows_startupinfo(),
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.warning("ffmpeg failed for %s: %s", file_path, exc)
        return False

    return result.returncode == 0 and thumb_path.is_file() and thumb_path.stat().st_size > 0


def extract_metadata_and_thumbnail(
    file_path: str,
    target_engine: Optional[Engine] = None,
) -> None:
    """Extract duration, resolution, size, and thumbnail for a video file safely."""
    try:
        canon_path = canonicalize_path(file_path)
    except ValueError:
        return

    if not os.path.isfile(canon_path):
        return

    norm_key = normalize_for_compare(canon_path)
    with _in_flight_lock:
        if norm_key in _in_flight_paths:
            return
        _in_flight_paths.add(norm_key)

    try:
        settings = get_settings()
        eng = target_engine or get_engine()
        file_hash = generate_file_hash(canon_path)
        thumb_path = settings.thumbnails_dir / f"{file_hash}.jpg"

        with Session(eng) as session:
            existing = session.get(VideoProgress, canon_path)
            if (
                existing
                and existing.resolution
                and existing.duration
                and existing.size_bytes is not None
                and existing.thumbnail_path
                and os.path.isfile(existing.thumbnail_path)
            ):
                return

        size_bytes: Optional[int] = None
        try:
            size_bytes = os.path.getsize(canon_path)
        except OSError:
            pass

        duration: Optional[float] = None
        resolution: Optional[str] = None
        ffprobe_bin = _resolve_executable(settings.ffprobe_executable)
        if ffprobe_bin:
            duration, resolution = _probe_video(ffprobe_bin, canon_path)

        ffmpeg_bin = _resolve_executable(settings.ffmpeg_executable)
        if ffmpeg_bin and not thumb_path.is_file():
            _generate_thumbnail(ffmpeg_bin, canon_path, thumb_path, duration)

        with Session(eng) as session:
            vp = session.get(VideoProgress, canon_path)
            if vp is None:
                vp = VideoProgress(file_path=canon_path, file_hash=file_hash)
            else:
                vp.file_hash = file_hash

            if size_bytes is not None:
                vp.size_bytes = size_bytes
            if resolution:
                vp.resolution = resolution
            if duration and (vp.duration is None or vp.duration <= 0):
                vp.duration = duration
            if thumb_path.is_file():
                vp.thumbnail_path = str(thumb_path)

            session.add(vp)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                retry_vp = session.get(VideoProgress, canon_path)
                if retry_vp is not None:
                    retry_vp.file_hash = file_hash
                    if size_bytes is not None:
                        retry_vp.size_bytes = size_bytes
                    if resolution:
                        retry_vp.resolution = resolution
                    if duration and (retry_vp.duration is None or retry_vp.duration <= 0):
                        retry_vp.duration = duration
                    if thumb_path.is_file():
                        retry_vp.thumbnail_path = str(thumb_path)
                    session.add(retry_vp)
                    session.commit()
    finally:
        with _in_flight_lock:
            _in_flight_paths.discard(norm_key)
