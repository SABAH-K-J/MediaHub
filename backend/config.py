"""Typed configuration and runtime paths for CameoDist."""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, field_validator


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def get_bundle_root() -> Path:
    """Return directory containing bundled read-only assets (e.g. frontend/dist)."""
    if _is_frozen() and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent


def get_default_data_dir() -> Path:
    """Return a persistent writable directory for DB and thumbnails."""
    if _is_frozen():
        if os.name == "nt":
            base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
            return base / "CameoDist"
        xdg = os.environ.get("XDG_DATA_HOME")
        base = Path(xdg) if xdg else (Path.home() / ".local" / "share")
        return base / "cameodist"
    return Path(__file__).resolve().parent.parent


def _parse_cors_origins(raw: str | list[str]) -> list[str]:
    if isinstance(raw, list):
        return [item.strip() for item in raw if item.strip()]
    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings(BaseModel):
    """Application settings loaded from environment variables."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    host: str = Field(default="127.0.0.1", min_length=1)
    port: int = Field(default=8000, ge=1, le=65535)
    db_path: Path
    thumbnails_dir: Path
    cors_origins: list[str]
    mpv_executable: str = Field(default="mpv", min_length=1)
    ffmpeg_executable: str = Field(default="ffmpeg", min_length=1)
    ffprobe_executable: str = Field(default="ffprobe", min_length=1)
    scan_max_depth: int = Field(default=12, ge=1, le=64)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: list[str]) -> list[str]:
        if any(origin == "*" for origin in value):
            raise ValueError("Wildcard '*' is not allowed in MEDIAHUB_CORS_ORIGINS.")
        return value

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path.as_posix()}"


def load_settings() -> Settings:
    """Build Settings from .env and process environment."""
    load_dotenv(override=False)

    data_dir = get_default_data_dir()
    db_raw = os.environ.get("MEDIAHUB_DB_PATH")
    thumbs_raw = os.environ.get("MEDIAHUB_THUMBNAILS_DIR")
    cors_raw = os.environ.get(
        "MEDIAHUB_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
    )

    db_path = Path(db_raw).expanduser().resolve() if db_raw else (data_dir / "library.db")
    thumbnails_dir = (
        Path(thumbs_raw).expanduser().resolve() if thumbs_raw else (data_dir / ".thumbnails")
    )

    db_path.parent.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    log_level_raw = os.environ.get("MEDIAHUB_LOG_LEVEL", "INFO").upper()
    if log_level_raw not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        log_level_raw = "INFO"

    return Settings(
        host=os.environ.get("MEDIAHUB_HOST", "127.0.0.1"),
        port=int(os.environ.get("MEDIAHUB_PORT", "8000")),
        db_path=db_path,
        thumbnails_dir=thumbnails_dir,
        cors_origins=_parse_cors_origins(cors_raw),
        mpv_executable=os.environ.get("MPV_EXECUTABLE", "mpv"),
        ffmpeg_executable=os.environ.get("FFMPEG_EXECUTABLE", "ffmpeg"),
        ffprobe_executable=os.environ.get("FFPROBE_EXECUTABLE", "ffprobe"),
        scan_max_depth=int(os.environ.get("MEDIAHUB_SCAN_MAX_DEPTH", "12")),
        log_level=log_level_raw,  # type: ignore[arg-type]
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return load_settings()


def clear_settings_cache() -> None:
    """Clear cached Settings (intended for tests)."""
    get_settings.cache_clear()

