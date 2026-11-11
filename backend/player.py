"""External mpv IPC playback launcher and position synchronization."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Engine
from sqlmodel import Session

from backend.config import get_settings
from backend.database import VideoProgress, get_engine
from backend.metadata import generate_file_hash
from backend.security import canonicalize_path, normalize_for_compare

logger = logging.getLogger(__name__)

MPV_SESSIONS: dict[str, "MpvSession"] = {}
_sessions_lock = threading.Lock()


def _find_mpv() -> Optional[str]:
    """Locate the mpv binary using settings, PATH, and standard OS install paths."""
    configured = get_settings().mpv_executable
    if os.path.isfile(configured):
        return configured

    from_path = shutil.which(configured)
    if from_path:
        return from_path

    # Only probe default OS install paths when using the default executable name
    if configured != "mpv":
        return None

    if os.name == "nt":
        candidates = [
            r"C:\Program Files\mpv\mpv.exe",
            r"C:\Program Files (x86)\mpv\mpv.exe",
            r"D:\Program Files\mpv\mpv.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\mpv\mpv.exe"),
            os.path.expandvars(r"%APPDATA%\mpv\mpv.exe"),
        ]
    else:
        candidates = [
            "/usr/bin/mpv",
            "/usr/local/bin/mpv",
            "/opt/homebrew/bin/mpv",
        ]

    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    return None


def is_mpv_available() -> bool:
    """Return True if an mpv executable can be found."""
    return _find_mpv() is not None


def _build_ipc_socket_path(session_id: str) -> str:
    if os.name == "nt":
        return rf"\\.\pipe\cameodist_mpv_{session_id}"
    return os.path.join(tempfile.gettempdir(), f"cameodist_mpv_{session_id}.sock")


class MpvSession:
    """Manages a single mpv process and its IPC progress polling thread."""

    def __init__(
        self,
        file_path: str,
        start_sec: Optional[float] = None,
        target_engine: Optional[Engine] = None,
    ) -> None:
        self.file_path = canonicalize_path(file_path)
        self.session_key = normalize_for_compare(self.file_path)
        self.session_id = uuid.uuid4().hex
        self.start_sec = start_sec
        self._engine = target_engine

        self.time_pos: Optional[float] = None
        self.duration: Optional[float] = None
        self._lock = threading.Lock()
        self._pipe_name = _build_ipc_socket_path(self.session_id)

        self.proc: Optional[subprocess.Popen[bytes]] = None
        self._ipc_thread: Optional[threading.Thread] = None
        self._watcher_thread: Optional[threading.Thread] = None
        self._stop_ipc = threading.Event()

    def build_command(self, mpv_path: str) -> list[str]:
        """Construct mpv CLI arguments with '--' option delimiter before file path."""
        cmd = [mpv_path, f"--input-ipc-server={self._pipe_name}"]
        if self.start_sec is not None and self.start_sec > 0:
            cmd.append(f"--start={self.start_sec:.3f}")
        cmd.append("--")
        cmd.append(self.file_path)
        return cmd

    def start(self) -> None:
        mpv_path = _find_mpv()
        if not mpv_path:
            raise RuntimeError(
                "mpv not found. Install mpv and ensure it is in your PATH "
                "(or set MPV_EXECUTABLE), or use the in-browser player."
            )

        cmd = self.build_command(mpv_path)
        logger.info("Launching mpv session %s for %s", self.session_id, self.file_path)
        self.proc = subprocess.Popen(cmd)

        time.sleep(0.5)

        self._ipc_thread = threading.Thread(target=self._ipc_loop, daemon=True)
        self._watcher_thread = threading.Thread(target=self._watcher_loop, daemon=True)
        self._ipc_thread.start()
        self._watcher_thread.start()

    def _ipc_loop(self) -> None:
        try:
            from mpv_jsonipc import MPV  # type: ignore[import-untyped]
        except ImportError:
            return

        mpv_ipc = None
        for _ in range(20):
            if self._stop_ipc.is_set():
                return
            try:
                mpv_ipc = MPV(start_mpv=False, ipc_socket=self._pipe_name)
                break
            except Exception:
                time.sleep(0.5)

        if mpv_ipc is None:
            return

        try:
            while not self._stop_ipc.is_set():
                try:
                    t = mpv_ipc.time_pos
                    d = mpv_ipc.duration
                    with self._lock:
                        if isinstance(t, (int, float)) and t >= 0:
                            self.time_pos = float(t)
                        if isinstance(d, (int, float)) and d > 0:
                            self.duration = float(d)
                except Exception:
                    break
                self._stop_ipc.wait(timeout=5.0)
        finally:
            try:
                mpv_ipc.terminate()
            except Exception:
                pass

    def _watcher_loop(self) -> None:
        if self.proc is None:
            return

        try:
            self.proc.wait()
        finally:
            self._stop_ipc.set()
            if os.name != "nt" and os.path.exists(self._pipe_name):
                try:
                    os.unlink(self._pipe_name)
                except OSError:
                    pass

        with self._lock:
            final_pos = self.time_pos
            final_dur = self.duration

        self._write_progress_to_db(final_pos, final_dur)

        with _sessions_lock:
            current = MPV_SESSIONS.get(self.session_key)
            if current is not None and current.session_id == self.session_id:
                MPV_SESSIONS.pop(self.session_key, None)

    def _write_progress_to_db(
        self,
        time_pos: Optional[float],
        duration: Optional[float],
    ) -> None:
        if time_pos is None or time_pos < 0:
            return

        eng = self._engine or get_engine()
        try:
            with Session(eng) as session:
                vp = session.get(VideoProgress, self.file_path)
                if vp is None:
                    vp = VideoProgress(
                        file_path=self.file_path,
                        file_hash=generate_file_hash(self.file_path),
                    )
                else:
                    vp.file_hash = generate_file_hash(self.file_path)

                effective_duration = (
                    duration if (duration is not None and duration > 0) else vp.duration
                )
                if duration is not None and duration > 0:
                    vp.duration = duration

                vp.last_position_sec = time_pos
                if effective_duration and effective_duration > 0:
                    ratio = min(max(time_pos / effective_duration, 0.0), 1.0)
                    vp.progress_ratio = ratio
                    if ratio >= 0.9:
                        vp.watched = True
                        vp.progress_ratio = 1.0
                        vp.last_position_sec = None
                    else:
                        vp.watched = False

                vp.watch_date = datetime.now(timezone.utc)
                session.add(vp)
                session.commit()
        except Exception as exc:
            logger.error("Failed to persist mpv progress for %s: %s", self.file_path, exc)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            pos = self.time_pos
            dur = self.duration
        progress = (min(max(pos / dur, 0.0), 1.0)) if (pos is not None and dur and dur > 0) else None
        return {
            "active": True,
            "file_path": self.file_path,
            "time_pos": pos,
            "duration": dur,
            "progress": progress,
        }


def play_media_file(file_path: str, target_engine: Optional[Engine] = None) -> None:
    """Launch mpv for file_path, resuming from any stored position."""
    canon_path = canonicalize_path(file_path)
    if not os.path.isfile(canon_path):
        raise ValueError(f"Video file not found: {canon_path}")

    eng = target_engine or get_engine()
    with Session(eng) as session:
        vp = session.get(VideoProgress, canon_path)
        start_sec = vp.last_position_sec if vp else None

    session_key = normalize_for_compare(canon_path)
    with _sessions_lock:
        existing = MPV_SESSIONS.get(session_key)
        if existing and existing.proc and existing.proc.poll() is None:
            existing.proc.terminate()
        MPV_SESSIONS.pop(session_key, None)

    session_obj = MpvSession(
        file_path=canon_path,
        start_sec=start_sec,
        target_engine=eng,
    )
    session_obj.start()

    with _sessions_lock:
        MPV_SESSIONS[session_key] = session_obj


def get_playback_progress(file_path: str) -> Optional[dict[str, Any]]:
    """Return live progress snapshot for an active mpv session, or None."""
    try:
        session_key = normalize_for_compare(file_path)
    except ValueError:
        return None

    with _sessions_lock:
        session_obj = MPV_SESSIONS.get(session_key)
    if session_obj is None:
        return None
    return session_obj.snapshot()
