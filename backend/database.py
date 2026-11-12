"""Database models, SQLite WAL engine setup, and session management."""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Engine, event, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Field, Session, SQLModel, create_engine

from backend.config import get_settings


def utc_now() -> datetime:
    """Return current timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class LibraryRoot(SQLModel, table=True):
    """Registered local root directory allowed for browsing and streaming."""

    id: int | None = Field(default=None, primary_key=True)
    path: str = Field(unique=True, index=True)
    label: str | None = Field(default=None)
    created_at: datetime | None = Field(default_factory=utc_now)


class VideoProgress(SQLModel, table=True):
    """Tracked playback progress and extracted metadata for a video file."""

    file_path: str = Field(primary_key=True)
    file_hash: str = Field(default="", index=True)
    duration: float | None = Field(default=None, ge=0.0)
    last_position_sec: float | None = Field(default=None, ge=0.0)
    progress_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    watched: bool = Field(default=False)
    watch_date: datetime | None = Field(default=None)
    resolution: str | None = Field(default=None)
    size_bytes: int | None = Field(default=None, ge=0)
    thumbnail_path: str | None = Field(default=None)
    preferred_audio_index: int | None = Field(default=None, ge=0)
    preferred_subtitle_id: str | None = Field(default=None)


def _configure_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def build_sqlite_engine(database_url: str, in_memory: bool = False) -> Engine:
    """Create a SQLite SQLAlchemy engine with concurrency pragmas enabled."""
    kwargs: dict[str, Any] = {"connect_args": {"check_same_thread": False}}
    if in_memory:
        kwargs["poolclass"] = StaticPool
    eng = create_engine(database_url, **kwargs)
    event.listen(eng, "connect", _configure_sqlite_pragmas)
    return eng


_engine: Engine | None = None


def get_engine() -> Engine:
    """Return the active SQLAlchemy engine, initializing it from settings if needed."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = build_sqlite_engine(settings.database_url)
    return _engine


def set_engine(new_engine: Engine | None) -> None:
    """Override or reset the module-level SQLAlchemy engine (intended for tests)."""
    global _engine
    _engine = new_engine


def _apply_safe_column_migrations(target_engine: Engine) -> None:
    """Add new columns to pre-existing SQLite tables without destroying data."""
    migrations: dict[str, list[tuple[str, str]]] = {
        "libraryroot": [
            ("label", "TEXT"),
            ("created_at", "TEXT"),
        ],
        "videoprogress": [
            ("file_hash", "TEXT DEFAULT ''"),
            ("preferred_audio_index", "INTEGER"),
            ("preferred_subtitle_id", "TEXT"),
        ],
    }

    with target_engine.begin() as conn:
        for table_name, columns in migrations.items():
            rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            if not rows:
                continue
            existing_cols = {row[1] for row in rows}
            for col_name, col_def in columns:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))

        conn.execute(
            text("UPDATE libraryroot SET created_at = :now WHERE created_at IS NULL"),
            {"now": utc_now().isoformat()},
        )


def create_db_and_tables(target_engine: Engine | None = None) -> None:
    """Create SQLModel tables and apply non-destructive column migrations."""
    eng = target_engine or get_engine()
    SQLModel.metadata.create_all(eng)
    _apply_safe_column_migrations(eng)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session with rollback on error."""
    with Session(get_engine()) as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
