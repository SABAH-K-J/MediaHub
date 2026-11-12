"""Media stream inspection (audio, subtitles, chapters), WebVTT extraction, and fMP4 streaming."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
from collections import OrderedDict
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Literal

from fastapi import Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict

from backend.config import get_settings
from backend.metadata import generate_file_hash
from backend.security import (
    canonicalize_path,
    is_allowed_video,
    normalize_for_compare,
    sanitize_display_name,
)

logger = logging.getLogger(__name__)

_PROBE_TIMEOUT_SEC = 15
_STREAM_CHUNK_SIZE = 64 * 1024
_VTT_CACHE_MAX_ENTRIES = 64

BROWSER_VIDEO_CODECS: frozenset[str] = frozenset({"h264", "vp8", "vp9", "av1"})
BROWSER_AUDIO_CODECS: frozenset[str] = frozenset({"aac", "mp3", "opus", "vorbis", "flac"})
BROWSER_CONTAINERS: frozenset[str] = frozenset({".mp4", ".webm", ".m4v"})
TEXT_SUBTITLE_CODECS: frozenset[str] = frozenset(
    {"subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"}
)
EXTERNAL_SUBTITLE_EXTENSIONS: frozenset[str] = frozenset({".srt", ".vtt", ".ass", ".ssa"})

ChapterCategory = Literal["intro", "recap", "outro", "credits", "preview", "main"]

_INTRO_RE = re.compile(r"\b(op|opening|intro|theme\s*song|cold\s*open)\b|^op\s*\d*$", re.IGNORECASE)
_RECAP_RE = re.compile(r"\b(recap|previously(\s+on)?|summary)\b", re.IGNORECASE)
_PREVIEW_RE = re.compile(r"\b(preview|next\s*episode|sneak\s*peek)\b", re.IGNORECASE)
_CREDITS_RE = re.compile(r"\b(credits|end\s*credits|staff\s*roll)\b", re.IGNORECASE)
_OUTRO_RE = re.compile(r"\b(ed|ending|outro)\b|^ed\s*\d*$", re.IGNORECASE)
_SRT_TIMESTAMP_RE = re.compile(r"(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})")

_vtt_cache_lock = threading.Lock()
_vtt_cache: OrderedDict[tuple[str, str, str, float], str] = OrderedDict()


def natural_sort_key(name: str) -> list[tuple[int, int | str]]:
    """Sort filenames naturally so Episode 2 precedes Episode 10."""
    parts = re.split(r"(\d+)", name.lower())
    return [(0, int(p)) if p.isdigit() else (1, p) for p in parts if p]


def find_adjacent_episodes(file_path: str) -> tuple[str | None, str | None]:
    """Return canonical (prev_path, next_path) among video siblings in the same folder."""
    canon_path = canonicalize_path(file_path)
    parent_dir = Path(canon_path).parent
    target_norm = normalize_for_compare(canon_path)

    siblings: list[tuple[str, str]] = []
    try:
        with os.scandir(parent_dir) as it:
            for entry in it:
                try:
                    if entry.is_file(follow_symlinks=True) and is_allowed_video(entry.name):
                        siblings.append((entry.name, canonicalize_path(entry.path)))
                except OSError:
                    continue
    except OSError:
        return None, None

    siblings.sort(key=lambda item: natural_sort_key(item[0]))
    for idx, (_, sib_path) in enumerate(siblings):
        if normalize_for_compare(sib_path) == target_norm:
            prev_path = siblings[idx - 1][1] if idx > 0 else None
            next_path = siblings[idx + 1][1] if idx + 1 < len(siblings) else None
            return prev_path, next_path
    return None, None


class StrictStreamModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AudioTrackInfo(StrictStreamModel):
    audio_index: int
    stream_index: int
    codec: str
    language: str | None = None
    title: str | None = None
    channels: int | None = None
    channel_layout: str | None = None
    is_default: bool = False
    browser_compatible: bool = False


class SubtitleTrackInfo(StrictStreamModel):
    id: str
    source: Literal["embedded", "external"]
    stream_index: int | None = None
    subtitle_index: int | None = None
    filename: str | None = None
    codec: str
    language: str | None = None
    title: str | None = None
    is_default: bool = False
    is_forced: bool = False
    text_based: bool = True


class ChapterInfo(StrictStreamModel):
    id: str
    title: str
    start_sec: float
    end_sec: float
    category: ChapterCategory


class MediaInfo(StrictStreamModel):
    file_path: str
    duration: float | None = None
    container_ext: str
    video_codec: str | None = None
    width: int | None = None
    height: int | None = None
    can_direct_play: bool = True
    audio_tracks: list[AudioTrackInfo]
    subtitle_tracks: list[SubtitleTrackInfo]
    chapters: list[ChapterInfo]


def _resolve_bin(configured: str) -> str | None:
    if os.path.isfile(configured):
        return configured
    return shutil.which(configured)


def _windows_startupinfo() -> subprocess.STARTUPINFO | None:  # type: ignore[name-defined]
    if os.name == "nt":
        info = subprocess.STARTUPINFO()  # type: ignore[attr-defined]
        info.dwFlags |= subprocess.STARTF_USESHOWWINDOW  # type: ignore[attr-defined]
        return info
    return None


def classify_chapter_category(title: str) -> ChapterCategory:
    """Classify a chapter title into a skip-rule category."""
    cleaned = title.strip()
    if not cleaned:
        return "main"
    if _INTRO_RE.search(cleaned):
        return "intro"
    if _RECAP_RE.search(cleaned):
        return "recap"
    if _PREVIEW_RE.search(cleaned):
        return "preview"
    if _CREDITS_RE.search(cleaned):
        return "credits"
    if _OUTRO_RE.search(cleaned):
        return "outro"
    return "main"


def _parse_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
        return parsed if parsed >= 0 else None
    except (TypeError, ValueError):
        return None


def _parse_external_subtitles(video_path: str) -> list[SubtitleTrackInfo]:
    """Find external sidecar subtitles matching video stem in the same directory."""
    parent_dir = Path(video_path).parent
    stem = Path(video_path).stem
    stem_lower = stem.lower()
    tracks: list[SubtitleTrackInfo] = []

    try:
        entries = sorted(os.scandir(parent_dir), key=lambda e: e.name.lower())
    except OSError:
        return tracks

    for entry in entries:
        try:
            if not entry.is_file(follow_symlinks=True):
                continue
        except OSError:
            continue

        ext = Path(entry.name).suffix.lower()
        if ext not in EXTERNAL_SUBTITLE_EXTENSIONS:
            continue

        entry_stem = Path(entry.name).stem
        entry_stem_lower = entry_stem.lower()
        if not entry_stem_lower.startswith(stem_lower):
            continue
        if len(entry_stem_lower) > len(stem_lower) and entry_stem_lower[len(stem_lower)] not in {
            ".",
            "_",
            "-",
            " ",
        }:
            continue

        suffix_meta = entry_stem[len(stem) :].strip("._- ")
        parts = [p for p in re.split(r"[._-]+", suffix_meta) if p] if suffix_meta else []
        is_forced = any(p.lower() == "forced" for p in parts)
        lang_candidates = [p for p in parts if p.lower() not in {"forced", "sdh", "cc"}]
        language = lang_candidates[0] if lang_candidates else None

        safe_name = sanitize_display_name(entry.name)
        label = safe_name
        if language:
            label = f"{language.upper()} ({ext.lstrip('.')})"
        elif suffix_meta:
            label = f"{suffix_meta} ({ext.lstrip('.')})"

        tracks.append(
            SubtitleTrackInfo(
                id=f"ext:{entry.name}",
                source="external",
                filename=entry.name,
                codec=ext.lstrip("."),
                language=language,
                title=label,
                is_default=False,
                is_forced=is_forced,
                text_based=True,
            )
        )

    return tracks


def parse_ffprobe_media_info(file_path: str, data: dict[str, Any]) -> MediaInfo:
    """Transform raw ffprobe JSON dict into structured MediaInfo."""
    canon_path = canonicalize_path(file_path)
    ext = Path(canon_path).suffix.lower()
    format_info = data.get("format") or {}
    streams = data.get("streams") or []
    raw_chapters = data.get("chapters") or []

    duration = _parse_optional_float(format_info.get("duration"))
    video_codec: str | None = None
    width: int | None = None
    height: int | None = None

    audio_tracks: list[AudioTrackInfo] = []
    subtitle_tracks: list[SubtitleTrackInfo] = []

    audio_idx = 0
    sub_idx = 0

    for stream in streams:
        if not isinstance(stream, dict):
            continue
        codec_type = str(stream.get("codec_type") or "").lower()
        codec_name = str(stream.get("codec_name") or "unknown").lower()
        tags = stream.get("tags") or {}
        disposition = stream.get("disposition") or {}
        is_default = bool(disposition.get("default"))
        is_forced = bool(disposition.get("forced"))

        lang = tags.get("language") or tags.get("LANGUAGE")
        title = tags.get("title") or tags.get("TITLE")
        clean_title = sanitize_display_name(str(title)) if title else None
        clean_lang = sanitize_display_name(str(lang)) if lang else None

        if codec_type == "video" and video_codec is None:
            video_codec = codec_name
            w_raw = stream.get("width")
            h_raw = stream.get("height")
            width = int(w_raw) if isinstance(w_raw, int) else None
            height = int(h_raw) if isinstance(h_raw, int) else None
            if duration is None:
                duration = _parse_optional_float(stream.get("duration"))
        elif codec_type == "audio":
            channels_raw = stream.get("channels")
            channels = int(channels_raw) if isinstance(channels_raw, int) else None
            layout_raw = stream.get("channel_layout")
            audio_tracks.append(
                AudioTrackInfo(
                    audio_index=audio_idx,
                    stream_index=int(stream.get("index", audio_idx)),
                    codec=codec_name,
                    language=clean_lang,
                    title=clean_title,
                    channels=channels,
                    channel_layout=str(layout_raw) if layout_raw else None,
                    is_default=is_default,
                    browser_compatible=codec_name in BROWSER_AUDIO_CODECS,
                )
            )
            audio_idx += 1
        elif codec_type == "subtitle":
            is_text = codec_name in TEXT_SUBTITLE_CODECS
            subtitle_tracks.append(
                SubtitleTrackInfo(
                    id=f"emb:{sub_idx}",
                    source="embedded",
                    stream_index=int(stream.get("index", sub_idx)),
                    subtitle_index=sub_idx,
                    codec=codec_name,
                    language=clean_lang,
                    title=clean_title,
                    is_default=is_default,
                    is_forced=is_forced,
                    text_based=is_text,
                )
            )
            sub_idx += 1

    subtitle_tracks.extend(_parse_external_subtitles(canon_path))

    chapters: list[ChapterInfo] = []
    for idx, ch in enumerate(raw_chapters):
        if not isinstance(ch, dict):
            continue
        start_sec = _parse_optional_float(ch.get("start_time"))
        end_sec = _parse_optional_float(ch.get("end_time"))
        if start_sec is None or end_sec is None or end_sec <= start_sec:
            continue
        ch_tags = ch.get("tags") or {}
        raw_title = ch_tags.get("title") or ch_tags.get("TITLE") or f"Chapter {idx + 1}"
        clean_ch_title = sanitize_display_name(str(raw_title))
        chapters.append(
            ChapterInfo(
                id=f"ch-{idx}",
                title=clean_ch_title,
                start_sec=start_sec,
                end_sec=end_sec,
                category=classify_chapter_category(clean_ch_title),
            )
        )

    default_audio = next((a for a in audio_tracks if a.is_default), None) or (
        audio_tracks[0] if audio_tracks else None
    )
    can_direct_play = (
        ext in BROWSER_CONTAINERS
        and (video_codec is None or video_codec in BROWSER_VIDEO_CODECS)
        and (default_audio is None or default_audio.browser_compatible)
    )

    return MediaInfo(
        file_path=canon_path,
        duration=duration,
        container_ext=ext,
        video_codec=video_codec,
        width=width,
        height=height,
        can_direct_play=can_direct_play,
        audio_tracks=audio_tracks,
        subtitle_tracks=subtitle_tracks,
        chapters=chapters,
    )


def inspect_media_streams(file_path: str) -> MediaInfo:
    """Probe streams, chapters, and sidecar subtitles for a media file."""
    canon_path = canonicalize_path(file_path)
    ext = Path(canon_path).suffix.lower()
    ffprobe_bin = _resolve_bin(get_settings().ffprobe_executable)

    if not ffprobe_bin:
        return MediaInfo(
            file_path=canon_path,
            duration=None,
            container_ext=ext,
            can_direct_play=ext in BROWSER_CONTAINERS,
            audio_tracks=[],
            subtitle_tracks=_parse_external_subtitles(canon_path),
            chapters=[],
        )

    cmd = [
        ffprobe_bin,
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-show_chapters",
        "-of",
        "json",
        canon_path,
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_PROBE_TIMEOUT_SEC,
            startupinfo=_windows_startupinfo(),
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.warning("ffprobe stream inspection failed for %s: %s", canon_path, exc)
        return MediaInfo(
            file_path=canon_path,
            container_ext=ext,
            can_direct_play=ext in BROWSER_CONTAINERS,
            audio_tracks=[],
            subtitle_tracks=_parse_external_subtitles(canon_path),
            chapters=[],
        )

    if result.returncode != 0 or not result.stdout.strip():
        return MediaInfo(
            file_path=canon_path,
            container_ext=ext,
            can_direct_play=ext in BROWSER_CONTAINERS,
            audio_tracks=[],
            subtitle_tracks=_parse_external_subtitles(canon_path),
            chapters=[],
        )

    try:
        raw_json = json.loads(result.stdout)
    except json.JSONDecodeError:
        raw_json = {}

    return parse_ffprobe_media_info(canon_path, raw_json)


def convert_srt_to_vtt(srt_text: str) -> str:
    """Convert raw SRT text into WebVTT format."""
    normalized = srt_text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    converted = _SRT_TIMESTAMP_RE.sub(r"\1.\2 --> \3.\4", normalized)
    return f"WEBVTT\n\n{converted.strip()}\n"


def _read_text_with_fallback(path: Path) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def extract_subtitle_payload(
    file_path: str,
    track_id: str,
    output_format: Literal["vtt", "ass"] = "vtt",
) -> str:
    """Return WebVTT or raw ASS/SSA payload for an embedded or external subtitle track."""
    canon_path = canonicalize_path(file_path)
    file_hash = generate_file_hash(canon_path)
    try:
        mtime = os.path.getmtime(canon_path)
    except OSError:
        mtime = 0.0

    cache_key = (file_hash, track_id, output_format, mtime)
    with _vtt_cache_lock:
        cached = _vtt_cache.get(cache_key)
        if cached is not None:
            _vtt_cache.move_to_end(cache_key)
            return cached

    ffmpeg_fmt: Literal["webvtt", "ass"] = "ass" if output_format == "ass" else "webvtt"
    output: str
    if track_id.startswith("ext:"):
        filename = track_id[4:]
        if not filename or "/" in filename or "\\" in filename or filename in {".", ".."}:
            raise ValueError("Invalid external subtitle track identifier.")
        sub_path = (Path(canon_path).parent / filename).resolve()
        if sub_path.parent != Path(canon_path).parent.resolve() or not sub_path.is_file():
            raise FileNotFoundError("External subtitle file not found.")

        ext = sub_path.suffix.lower()
        if output_format == "ass":
            if ext in {".ass", ".ssa"}:
                output = _read_text_with_fallback(sub_path).lstrip("\ufeff")
            elif ext in {".srt", ".vtt"}:
                ffmpeg_bin = _resolve_bin(get_settings().ffmpeg_executable)
                if not ffmpeg_bin:
                    raise RuntimeError("FFmpeg is required to convert subtitles to ASS.")
                output = _run_ffmpeg_subtitle(
                    ffmpeg_bin, str(sub_path), subtitle_idx=0, output_format="ass"
                )
            else:
                raise ValueError("Unsupported subtitle extension.")
        elif ext == ".vtt":
            raw = _read_text_with_fallback(sub_path).lstrip("\ufeff")
            output = raw if raw.lstrip().startswith("WEBVTT") else f"WEBVTT\n\n{raw}"
        elif ext == ".srt":
            output = convert_srt_to_vtt(_read_text_with_fallback(sub_path))
        elif ext in {".ass", ".ssa"}:
            ffmpeg_bin = _resolve_bin(get_settings().ffmpeg_executable)
            if not ffmpeg_bin:
                raise RuntimeError("FFmpeg is required to convert ASS/SSA subtitles.")
            output = _run_ffmpeg_subtitle(
                ffmpeg_bin, str(sub_path), subtitle_idx=0, output_format="webvtt"
            )
        else:
            raise ValueError("Unsupported subtitle extension.")
    elif track_id.startswith("emb:"):
        idx_str = track_id[4:]
        if not idx_str.isdigit():
            raise ValueError("Invalid embedded subtitle track index.")
        sub_idx = int(idx_str)

        info = inspect_media_streams(canon_path)
        matching = next((t for t in info.subtitle_tracks if t.id == track_id), None)
        if matching is None:
            raise FileNotFoundError("Embedded subtitle track not found.")
        if not matching.text_based:
            raise ValueError(
                f"Subtitle codec '{matching.codec}' is image-based and cannot be rendered as text."
            )

        ffmpeg_bin = _resolve_bin(get_settings().ffmpeg_executable)
        if not ffmpeg_bin:
            raise RuntimeError("FFmpeg is required to extract embedded subtitles.")
        output = _run_ffmpeg_subtitle(
            ffmpeg_bin,
            canon_path,
            subtitle_idx=sub_idx,
            output_format=ffmpeg_fmt,
        )
    else:
        raise ValueError("Invalid subtitle track ID format.")

    with _vtt_cache_lock:
        _vtt_cache[cache_key] = output
        _vtt_cache.move_to_end(cache_key)
        while len(_vtt_cache) > _VTT_CACHE_MAX_ENTRIES:
            _vtt_cache.popitem(last=False)

    return output


def extract_webvtt_subtitles(file_path: str, track_id: str) -> str:
    """Return WebVTT payload for an embedded ('emb:N') or external ('ext:name') subtitle track."""
    return extract_subtitle_payload(file_path, track_id, output_format="vtt")


def _run_ffmpeg_subtitle(
    ffmpeg_bin: str,
    input_path: str,
    subtitle_idx: int,
    output_format: Literal["webvtt", "ass"] = "webvtt",
) -> str:
    cmd = [
        ffmpeg_bin,
        "-v",
        "error",
        "-i",
        input_path,
        "-map",
        f"0:s:{subtitle_idx}",
        "-f",
        output_format,
        "pipe:1",
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=_PROBE_TIMEOUT_SEC,
            startupinfo=_windows_startupinfo(),
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise RuntimeError(f"Subtitle extraction failed: {exc}") from exc

    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError(f"Failed to extract subtitle track as {output_format}.")
    return result.stdout


def build_transcode_command(
    ffmpeg_bin: str,
    file_path: str,
    audio_index: int = 0,
    start_sec: float = 0.0,
    video_codec: str | None = None,
) -> list[str]:
    """Construct ffmpeg command to output a fragmented MP4 stream for browser playback."""
    clamped_start = max(0.0, start_sec)
    cmd = [ffmpeg_bin, "-v", "error"]
    if clamped_start > 0.0:
        cmd.extend(["-ss", f"{clamped_start:.3f}"])
    cmd.extend(["-i", file_path, "-map", "0:v:0", "-map", f"0:a:{max(0, audio_index)}?"])

    if video_codec and video_codec.lower() == "h264":
        cmd.extend(["-c:v", "copy"])
    else:
        cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"])

    cmd.extend(
        [
            "-c:a",
            "aac",
            "-ac",
            "2",
            "-b:a",
            "192k",
            "-f",
            "mp4",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1",
        ]
    )
    return cmd


def _iter_ffmpeg_stream(cmd: list[str]) -> Iterator[bytes]:
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        startupinfo=_windows_startupinfo(),
    )
    try:
        assert proc.stdout is not None
        while True:
            chunk = proc.stdout.read(_STREAM_CHUNK_SIZE)
            if not chunk:
                break
            yield chunk
    finally:
        if proc.stdout is not None:
            try:
                proc.stdout.close()
            except OSError:
                pass
        if proc.poll() is None:
            proc.kill()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            pass


def stream_transcoded_video(
    file_path: str,
    audio_index: int = 0,
    start_sec: float = 0.0,
) -> Response:
    """Stream fragmented MP4 via ffmpeg for multi-audio or non-native containers."""
    ffmpeg_bin = _resolve_bin(get_settings().ffmpeg_executable)
    if not ffmpeg_bin:
        raise RuntimeError("FFmpeg is not installed or configured on this host.")

    info = inspect_media_streams(file_path)
    cmd = build_transcode_command(
        ffmpeg_bin=ffmpeg_bin,
        file_path=file_path,
        audio_index=audio_index,
        start_sec=start_sec,
        video_codec=info.video_codec,
    )
    return StreamingResponse(
        _iter_ffmpeg_stream(cmd),
        status_code=200,
        media_type="video/mp4",
        headers={"Cache-Control": "no-store"},
    )

