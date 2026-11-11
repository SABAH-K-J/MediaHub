"""FastAPI application and HTTP endpoints for CameoDist."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from backend import __version__
from backend.config import get_bundle_root, get_settings
from backend.database import (
    LibraryRoot,
    VideoProgress,
    create_db_and_tables,
    get_engine,
    get_session,
    utc_now,
)
from backend.media_streams import (
    AudioTrackInfo,
    ChapterInfo,
    SubtitleTrackInfo,
    extract_subtitle_payload,
    find_adjacent_episodes,
    inspect_media_streams,
    stream_transcoded_video,
)
from backend.metadata import (
    extract_metadata_and_thumbnail,
    generate_file_hash,
    is_ffmpeg_available,
)
from backend.player import get_playback_progress, is_mpv_available, play_media_file
from backend.security import (
    canonicalize_path,
    decode_b64_path,
    ensure_within_roots,
    find_containing_root,
    is_allowed_video,
    normalize_for_compare,
    sanitize_display_name,
    validate_file_hash,
)
from backend.streaming import stream_video_file

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Strict Pydantic v2 Schemas
# ---------------------------------------------------------------------------


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthResponse(StrictModel):
    status: Literal["ok"]
    version: str
    mpv_available: bool
    ffmpeg_available: bool


class RootAddRequest(StrictModel):
    path: str = Field(min_length=1, max_length=4096)
    label: Optional[str] = Field(default=None, max_length=120)


class LibraryRootRead(StrictModel):
    id: int
    path: str
    label: Optional[str]
    created_at: Optional[datetime] = None


class DeleteRootResponse(StrictModel):
    status: Literal["deleted"]
    id: int


class BreadcrumbItem(StrictModel):
    name: str
    path: str


class BrowseItem(StrictModel):
    name: str
    path: str
    is_dir: bool
    watched: bool = False
    progress_ratio: float = 0.0
    last_position_sec: Optional[float] = None
    resolution: Optional[str] = None
    duration: Optional[float] = None
    size_bytes: Optional[int] = None
    watch_date: Optional[datetime] = None
    thumbnail_url: Optional[str] = None


class BrowseResponse(StrictModel):
    current_path: str
    root_path: str
    parent_path: Optional[str]
    breadcrumbs: list[BreadcrumbItem]
    items: list[BrowseItem]


class LastWatchedItem(StrictModel):
    file_path: str
    name: str
    progress_ratio: float
    last_position_sec: Optional[float] = None
    duration: Optional[float] = None
    watch_date: datetime
    thumbnail_url: Optional[str] = None


class FilePathRequest(StrictModel):
    file_path: str = Field(min_length=1, max_length=8192)


class FileProgressRequest(StrictModel):
    file_path: str = Field(min_length=1, max_length=8192)
    position_sec: float = Field(ge=0.0)
    duration_sec: Optional[float] = Field(default=None, ge=0.0)


class FilePreferencesRequest(StrictModel):
    file_path: str = Field(min_length=1, max_length=8192)
    preferred_audio_index: Optional[int] = Field(default=None, ge=0)
    preferred_subtitle_id: Optional[str] = Field(default=None, max_length=256)


class MediaInfoResponse(StrictModel):
    file_path: str
    duration: Optional[float] = None
    container_ext: str
    video_codec: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    can_direct_play: bool
    audio_tracks: list[AudioTrackInfo]
    subtitle_tracks: list[SubtitleTrackInfo]
    chapters: list[ChapterInfo]
    preferred_audio_index: Optional[int] = None
    preferred_subtitle_id: Optional[str] = None
    prev_item: Optional[BrowseItem] = None
    next_item: Optional[BrowseItem] = None


class VideoProgressRead(StrictModel):
    file_path: str
    file_hash: str
    duration: Optional[float] = None
    last_position_sec: Optional[float] = None
    progress_ratio: float
    watched: bool
    watch_date: Optional[datetime] = None
    resolution: Optional[str] = None
    size_bytes: Optional[int] = None
    thumbnail_url: Optional[str] = None
    preferred_audio_index: Optional[int] = None
    preferred_subtitle_id: Optional[str] = None


class PlayResponse(StrictModel):
    status: Literal["playback started"]
    mode: Literal["mpv"]


class PlayProgressResponse(StrictModel):
    active: bool
    file_path: Optional[str] = None
    time_pos: Optional[float] = None
    duration: Optional[float] = None
    progress: Optional[float] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_registered_root_paths(session: Session) -> list[str]:
    return [root.path for root in session.exec(select(LibraryRoot)).all()]


def _decode_and_authorize_path(
    encoded_path: str,
    session: Session,
) -> str:
    try:
        raw_path = decode_b64_path(encoded_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    roots = _get_registered_root_paths(session)
    try:
        return ensure_within_roots(raw_path, roots)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _authorize_video_file(encoded_path: str, session: Session) -> str:
    canon_path = _decode_and_authorize_path(encoded_path, session)
    if not os.path.isfile(canon_path) or not is_allowed_video(canon_path):
        raise HTTPException(status_code=404, detail="Video file not found on disk")
    return canon_path


def _build_browse_item(
    display_name: str,
    file_canon: str,
    vp: Optional[VideoProgress],
) -> BrowseItem:
    if vp is not None:
        file_hash = vp.file_hash or generate_file_hash(file_canon)
        thumb_url = (
            f"/api/thumbnails/{file_hash}"
            if (vp.thumbnail_path and os.path.isfile(vp.thumbnail_path))
            else None
        )
        return BrowseItem(
            name=display_name,
            path=file_canon,
            is_dir=False,
            watched=vp.watched,
            progress_ratio=vp.progress_ratio,
            last_position_sec=vp.last_position_sec,
            resolution=vp.resolution,
            duration=vp.duration,
            size_bytes=vp.size_bytes,
            watch_date=vp.watch_date,
            thumbnail_url=thumb_url,
        )

    try:
        size_bytes: Optional[int] = os.path.getsize(file_canon)
    except OSError:
        size_bytes = None
    return BrowseItem(
        name=display_name,
        path=file_canon,
        is_dir=False,
        size_bytes=size_bytes,
    )


def _to_library_root_read(root: LibraryRoot) -> LibraryRootRead:
    return LibraryRootRead(
        id=root.id or 0,
        path=root.path,
        label=root.label or os.path.basename(root.path) or root.path,
        created_at=root.created_at or utc_now(),
    )


def _to_video_progress_read(vp: VideoProgress) -> VideoProgressRead:
    thumb_url: Optional[str] = None
    if vp.thumbnail_path and os.path.isfile(vp.thumbnail_path) and vp.file_hash:
        thumb_url = f"/api/thumbnails/{vp.file_hash}"
    return VideoProgressRead(
        file_path=vp.file_path,
        file_hash=vp.file_hash or generate_file_hash(vp.file_path),
        duration=vp.duration,
        last_position_sec=vp.last_position_sec,
        progress_ratio=vp.progress_ratio,
        watched=vp.watched,
        watch_date=vp.watch_date,
        resolution=vp.resolution,
        size_bytes=vp.size_bytes,
        thumbnail_url=thumb_url,
        preferred_audio_index=vp.preferred_audio_index,
        preferred_subtitle_id=vp.preferred_subtitle_id,
    )


def _contains_video(
    dir_path: str,
    visited: Optional[set[tuple[int, int]]] = None,
    depth: int = 0,
    max_depth: int = 12,
) -> bool:
    """Recursively check whether dir_path contains a video file with cycle protection."""
    if depth > max_depth:
        return False
    if visited is None:
        visited = set()

    try:
        st = os.stat(dir_path)
    except OSError:
        return False

    dir_identity = (st.st_dev, st.st_ino)
    if dir_identity != (0, 0):
        if dir_identity in visited:
            return False
        visited.add(dir_identity)

    try:
        with os.scandir(dir_path) as it:
            for entry in it:
                try:
                    if entry.is_file(follow_symlinks=True) and is_allowed_video(entry.name):
                        return True
                    if entry.is_dir(follow_symlinks=True):
                        if _contains_video(entry.path, visited, depth + 1, max_depth):
                            return True
                except OSError:
                    continue
    except OSError:
        return False

    return False


def _build_breadcrumbs(root_path: str, current_path: str) -> list[BreadcrumbItem]:
    root_name = sanitize_display_name(os.path.basename(root_path) or root_path)
    crumbs = [BreadcrumbItem(name=root_name, path=root_path)]

    if normalize_for_compare(root_path) == normalize_for_compare(current_path):
        return crumbs

    rel = os.path.relpath(current_path, root_path)
    if rel == ".":
        return crumbs

    acc = root_path
    for part in Path(rel).parts:
        acc = os.path.join(acc, part)
        crumbs.append(BreadcrumbItem(name=sanitize_display_name(part), path=acc))
    return crumbs


def _matches_status(item: BrowseItem, status_filter: str) -> bool:
    if status_filter == "all":
        return True
    if status_filter == "watched":
        return item.watched or item.progress_ratio >= 0.9
    if status_filter == "in_progress":
        return not item.watched and 0.0 < item.progress_ratio < 0.9
    if status_filter == "unwatched":
        return not item.watched and item.progress_ratio == 0.0
    return True


def _sort_files(items: list[BrowseItem], sort_by: str) -> list[BrowseItem]:
    if sort_by == "size":
        return sorted(items, key=lambda x: (-(x.size_bytes or 0), x.name.lower()))
    if sort_by == "duration":
        return sorted(items, key=lambda x: (-(x.duration or 0.0), x.name.lower()))
    if sort_by == "recent":
        return sorted(
            items,
            key=lambda x: (
                0 if x.watch_date is not None else 1,
                -(x.watch_date.timestamp() if x.watch_date is not None else 0.0),
                x.name.lower(),
            ),
        )
    return sorted(items, key=lambda x: x.name.lower())


# ---------------------------------------------------------------------------
# FastAPI Lifespan & App Factory
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_db_and_tables()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(title="CameoDist API", version=__version__, lifespan=lifespan)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Range"],
    )

    @application.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            version=__version__,
            mpv_available=is_mpv_available(),
            ffmpeg_available=is_ffmpeg_available(),
        )

    @application.get("/api/thumbnails/{file_hash}")
    def get_thumbnail(file_hash: str) -> FileResponse:
        try:
            validated = validate_file_hash(file_hash)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        thumb_path = get_settings().thumbnails_dir / f"{validated}.jpg"
        if not thumb_path.is_file():
            raise HTTPException(status_code=404, detail="Thumbnail not found")
        return FileResponse(path=thumb_path, media_type="image/jpeg")

    @application.get("/api/roots", response_model=list[LibraryRootRead])
    def get_roots(session: Session = Depends(get_session)) -> list[LibraryRootRead]:
        roots = session.exec(select(LibraryRoot).order_by(LibraryRoot.id)).all()
        return [_to_library_root_read(root) for root in roots]

    @application.post("/api/roots", response_model=LibraryRootRead)
    def add_root(
        req: RootAddRequest,
        response: Response,
        session: Session = Depends(get_session),
    ) -> LibraryRootRead:
        try:
            canon_path = canonicalize_path(req.path.strip())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if not os.path.isdir(canon_path):
            raise HTTPException(status_code=400, detail=f"Directory does not exist: {canon_path}")

        norm_target = normalize_for_compare(canon_path)
        existing_roots = session.exec(select(LibraryRoot)).all()
        for existing in existing_roots:
            if normalize_for_compare(existing.path) == norm_target:
                response.status_code = 200
                return _to_library_root_read(existing)

        clean_label = sanitize_display_name(req.label.strip()) if req.label else None
        new_root = LibraryRoot(
            path=canon_path,
            label=clean_label or os.path.basename(canon_path) or canon_path,
        )
        session.add(new_root)
        session.commit()
        session.refresh(new_root)
        response.status_code = 201
        return _to_library_root_read(new_root)

    @application.delete("/api/roots/{root_id}", response_model=DeleteRootResponse)
    def delete_root(root_id: int, session: Session = Depends(get_session)) -> DeleteRootResponse:
        root = session.get(LibraryRoot, root_id)
        if root is None:
            raise HTTPException(status_code=404, detail="Root not found")
        session.delete(root)
        session.commit()
        return DeleteRootResponse(status="deleted", id=root_id)

    @application.get("/api/browse", response_model=BrowseResponse)
    def browse_directory(
        background_tasks: BackgroundTasks,
        path: str = Query(..., min_length=1),
        q: str = Query(default="", max_length=200),
        status: Literal["all", "unwatched", "in_progress", "watched"] = Query(default="all"),
        sort: Literal["name", "size", "duration", "recent"] = Query(default="name"),
        session: Session = Depends(get_session),
    ) -> BrowseResponse:
        canon_path = _decode_and_authorize_path(path, session)
        if not os.path.isdir(canon_path):
            raise HTTPException(status_code=404, detail="Directory not found")

        roots = _get_registered_root_paths(session)
        containing_root = find_containing_root(canon_path, roots)
        if containing_root is None:
            raise HTTPException(status_code=403, detail="Directory is outside registered roots")

        try:
            with os.scandir(canon_path) as it:
                entries = sorted(list(it), key=lambda e: e.name.lower())
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail="Permission denied") from exc
        except OSError as exc:
            raise HTTPException(status_code=404, detail="Directory cannot be read") from exc

        max_depth = get_settings().scan_max_depth
        search_query = q.strip().lower()
        folders: list[BrowseItem] = []
        raw_files: list[tuple[str, str]] = []

        for entry in entries:
            display_name = sanitize_display_name(entry.name)
            try:
                if entry.is_dir(follow_symlinks=True):
                    if search_query and search_query not in display_name.lower():
                        continue
                    if _contains_video(entry.path, max_depth=max_depth):
                        folders.append(
                            BrowseItem(
                                name=display_name,
                                path=canonicalize_path(entry.path),
                                is_dir=True,
                            )
                        )
                elif entry.is_file(follow_symlinks=True) and is_allowed_video(entry.name):
                    if search_query and search_query not in display_name.lower():
                        continue
                    file_canon = canonicalize_path(entry.path)
                    raw_files.append((display_name, file_canon))
                    background_tasks.add_task(
                        extract_metadata_and_thumbnail,
                        file_canon,
                        get_engine(),
                    )
            except OSError:
                continue

        file_items: list[BrowseItem] = []
        if raw_files:
            file_paths = [fp for _, fp in raw_files]
            progress_records = session.exec(
                select(VideoProgress).where(VideoProgress.file_path.in_(file_paths))  # type: ignore[attr-defined]
            ).all()
            prog_map = {p.file_path: p for p in progress_records}

            for display_name, file_canon in raw_files:
                item = _build_browse_item(display_name, file_canon, prog_map.get(file_canon))
                if _matches_status(item, status):
                    file_items.append(item)

        sorted_files = _sort_files(file_items, sort)

        if normalize_for_compare(canon_path) == normalize_for_compare(containing_root):
            parent_path: Optional[str] = None
        else:
            candidate_parent = os.path.dirname(canon_path)
            if (
                candidate_parent
                and normalize_for_compare(candidate_parent) != normalize_for_compare(canon_path)
                and find_containing_root(candidate_parent, [containing_root]) is not None
            ):
                parent_path = candidate_parent
            else:
                parent_path = None

        return BrowseResponse(
            current_path=canon_path,
            root_path=containing_root,
            parent_path=parent_path,
            breadcrumbs=_build_breadcrumbs(containing_root, canon_path),
            items=folders + sorted_files,
        )

    def _query_recent_in_progress(session: Session, limit: int) -> list[LastWatchedItem]:
        roots = _get_registered_root_paths(session)
        if not roots:
            return []

        stmt = (
            select(VideoProgress)
            .where(VideoProgress.progress_ratio > 0.0)
            .where(VideoProgress.progress_ratio < 0.9)
            .where(VideoProgress.watched == False)  # noqa: E712
            .where(VideoProgress.watch_date != None)  # noqa: E711
            .order_by(VideoProgress.watch_date.desc())  # type: ignore[union-attr]
        )
        rows = session.exec(stmt).all()
        results: list[LastWatchedItem] = []
        for vp in rows:
            if vp.watch_date is None:
                continue
            if not os.path.isfile(vp.file_path):
                continue
            if find_containing_root(vp.file_path, roots) is None:
                continue
            file_hash = vp.file_hash or generate_file_hash(vp.file_path)
            thumb_url = (
                f"/api/thumbnails/{file_hash}"
                if (vp.thumbnail_path and os.path.isfile(vp.thumbnail_path))
                else None
            )
            results.append(
                LastWatchedItem(
                    file_path=vp.file_path,
                    name=sanitize_display_name(os.path.basename(vp.file_path)),
                    progress_ratio=vp.progress_ratio,
                    last_position_sec=vp.last_position_sec,
                    duration=vp.duration,
                    watch_date=vp.watch_date,
                    thumbnail_url=thumb_url,
                )
            )
            if len(results) >= limit:
                break
        return results

    @application.get("/api/last-watched", response_model=Optional[LastWatchedItem])
    def get_last_watched(session: Session = Depends(get_session)) -> Optional[LastWatchedItem]:
        items = _query_recent_in_progress(session, limit=1)
        return items[0] if items else None

    @application.get("/api/recent", response_model=list[LastWatchedItem])
    def get_recent(
        limit: int = Query(default=5, ge=1, le=20),
        session: Session = Depends(get_session),
    ) -> list[LastWatchedItem]:
        return _query_recent_in_progress(session, limit=limit)

    @application.post("/api/play", response_model=PlayResponse)
    def play_media(req: FilePathRequest, session: Session = Depends(get_session)) -> PlayResponse:
        canon_path = _decode_and_authorize_path(req.file_path, session)
        if not os.path.isfile(canon_path) or not is_allowed_video(canon_path):
            raise HTTPException(status_code=404, detail="Video file not found on disk")

        try:
            play_media_file(canon_path, target_engine=get_engine())
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        return PlayResponse(status="playback started", mode="mpv")

    @application.get("/api/play/progress", response_model=PlayProgressResponse)
    def get_progress(
        path: str = Query(..., min_length=1),
        session: Session = Depends(get_session),
    ) -> PlayProgressResponse:
        canon_path = _decode_and_authorize_path(path, session)
        data = get_playback_progress(canon_path)
        if data is None:
            return PlayProgressResponse(active=False)
        return PlayProgressResponse(**data)

    @application.get("/api/stream")
    def stream_media(
        request: Request,
        path: str = Query(..., min_length=1),
        session: Session = Depends(get_session),
    ) -> Response:
        canon_path = _authorize_video_file(path, session)
        return stream_video_file(canon_path, request.headers.get("range"))

    @application.get("/api/media/info", response_model=MediaInfoResponse)
    def get_media_info(
        path: str = Query(..., min_length=1),
        session: Session = Depends(get_session),
    ) -> MediaInfoResponse:
        canon_path = _authorize_video_file(path, session)
        info = inspect_media_streams(canon_path)
        vp = session.get(VideoProgress, canon_path)

        prev_path, next_path = find_adjacent_episodes(canon_path)
        prev_item = (
            _build_browse_item(
                sanitize_display_name(os.path.basename(prev_path)),
                prev_path,
                session.get(VideoProgress, prev_path),
            )
            if prev_path
            else None
        )
        next_item = (
            _build_browse_item(
                sanitize_display_name(os.path.basename(next_path)),
                next_path,
                session.get(VideoProgress, next_path),
            )
            if next_path
            else None
        )

        return MediaInfoResponse(
            file_path=info.file_path,
            duration=info.duration or (vp.duration if vp else None),
            container_ext=info.container_ext,
            video_codec=info.video_codec,
            width=info.width,
            height=info.height,
            can_direct_play=info.can_direct_play,
            audio_tracks=info.audio_tracks,
            subtitle_tracks=info.subtitle_tracks,
            chapters=info.chapters,
            preferred_audio_index=vp.preferred_audio_index if vp else None,
            preferred_subtitle_id=vp.preferred_subtitle_id if vp else None,
            prev_item=prev_item,
            next_item=next_item,
        )

    @application.get("/api/subtitles")
    def get_subtitles(
        path: str = Query(..., min_length=1),
        id: str = Query(..., min_length=1, max_length=256),
        format: Literal["vtt", "ass"] = Query(default="vtt"),
        session: Session = Depends(get_session),
    ) -> Response:
        canon_path = _authorize_video_file(path, session)
        try:
            payload = extract_subtitle_payload(canon_path, id, output_format=format)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        media_type = "text/plain; charset=utf-8" if format == "ass" else "text/vtt; charset=utf-8"
        return Response(content=payload, media_type=media_type)

    @application.get("/api/stream/transcode")
    def stream_transcoded(
        path: str = Query(..., min_length=1),
        audio: int = Query(default=0, ge=0, le=64),
        start: float = Query(default=0.0, ge=0.0),
        session: Session = Depends(get_session),
    ) -> Response:
        canon_path = _authorize_video_file(path, session)
        try:
            return stream_transcoded_video(canon_path, audio_index=audio, start_sec=start)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @application.post("/api/file/preferences", response_model=VideoProgressRead)
    def save_file_preferences(
        req: FilePreferencesRequest,
        session: Session = Depends(get_session),
    ) -> VideoProgressRead:
        canon_path = _authorize_video_file(req.file_path, session)
        file_hash = generate_file_hash(canon_path)
        vp = session.get(VideoProgress, canon_path)
        if vp is None:
            vp = VideoProgress(file_path=canon_path, file_hash=file_hash)
        else:
            vp.file_hash = file_hash

        vp.preferred_audio_index = req.preferred_audio_index
        vp.preferred_subtitle_id = req.preferred_subtitle_id
        session.add(vp)
        session.commit()
        session.refresh(vp)
        return _to_video_progress_read(vp)

    @application.post("/api/file/progress", response_model=VideoProgressRead)
    def sync_file_progress(
        req: FileProgressRequest,
        session: Session = Depends(get_session),
    ) -> VideoProgressRead:
        canon_path = _decode_and_authorize_path(req.file_path, session)
        if not os.path.isfile(canon_path) or not is_allowed_video(canon_path):
            raise HTTPException(status_code=404, detail="Video file not found on disk")

        file_hash = generate_file_hash(canon_path)
        vp = session.get(VideoProgress, canon_path)
        if vp is None:
            vp = VideoProgress(file_path=canon_path, file_hash=file_hash)
        else:
            vp.file_hash = file_hash

        if req.duration_sec is not None and req.duration_sec > 0:
            vp.duration = req.duration_sec

        effective_duration = vp.duration
        if effective_duration and effective_duration > 0:
            ratio = min(max(req.position_sec / effective_duration, 0.0), 1.0)
            vp.progress_ratio = ratio
            if ratio >= 0.9:
                vp.watched = True
                vp.progress_ratio = 1.0
                vp.last_position_sec = None
            else:
                vp.watched = False
                vp.last_position_sec = req.position_sec
        else:
            vp.last_position_sec = req.position_sec

        vp.watch_date = datetime.now(timezone.utc)
        session.add(vp)
        session.commit()
        session.refresh(vp)
        return _to_video_progress_read(vp)

    @application.post("/api/file/watch", response_model=VideoProgressRead)
    def mark_as_watched(
        req: FilePathRequest,
        session: Session = Depends(get_session),
    ) -> VideoProgressRead:
        canon_path = _decode_and_authorize_path(req.file_path, session)
        if not os.path.isfile(canon_path) or not is_allowed_video(canon_path):
            raise HTTPException(status_code=404, detail="Video file not found on disk")

        file_hash = generate_file_hash(canon_path)
        vp = session.get(VideoProgress, canon_path)
        if vp is None:
            vp = VideoProgress(file_path=canon_path, file_hash=file_hash)
        else:
            vp.file_hash = file_hash

        vp.watched = True
        vp.progress_ratio = 1.0
        vp.last_position_sec = None
        vp.watch_date = datetime.now(timezone.utc)
        session.add(vp)
        session.commit()
        session.refresh(vp)
        return _to_video_progress_read(vp)

    @application.post("/api/file/unwatch", response_model=VideoProgressRead)
    def mark_as_unwatched(
        req: FilePathRequest,
        session: Session = Depends(get_session),
    ) -> VideoProgressRead:
        canon_path = _decode_and_authorize_path(req.file_path, session)
        if not os.path.isfile(canon_path) or not is_allowed_video(canon_path):
            raise HTTPException(status_code=404, detail="Video file not found on disk")

        file_hash = generate_file_hash(canon_path)
        vp = session.get(VideoProgress, canon_path)
        if vp is None:
            vp = VideoProgress(file_path=canon_path, file_hash=file_hash)
        else:
            vp.file_hash = file_hash

        vp.watched = False
        vp.progress_ratio = 0.0
        vp.last_position_sec = None
        vp.watch_date = None
        session.add(vp)
        session.commit()
        session.refresh(vp)
        return _to_video_progress_read(vp)

    # Static SPA hosting (mounted after /api routes so API routes always win)
    static_dir = get_bundle_root() / "frontend" / "dist"
    if static_dir.is_dir():
        assets_dir = static_dir / "assets"
        if assets_dir.is_dir():
            application.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @application.get("/{full_path:path}")
        async def serve_spa(full_path: str) -> Response:
            if full_path == "api" or full_path.startswith("api/"):
                return JSONResponse(status_code=404, content={"detail": "Not found"})
            candidate = (static_dir / full_path).resolve()
            if (
                full_path
                and candidate.is_file()
                and os.path.commonpath([str(candidate), str(static_dir.resolve())])
                == str(static_dir.resolve())
            ):
                return FileResponse(candidate)
            return FileResponse(static_dir / "index.html")

    return application


app = create_app()
