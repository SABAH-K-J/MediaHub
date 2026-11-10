"""HTTP Range (206 Partial Content) video streaming for browser playback."""

from __future__ import annotations

import os
import re
from collections.abc import Iterator
from typing import Optional

from fastapi import Response
from fastapi.responses import StreamingResponse

_CHUNK_SIZE = 64 * 1024
_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")

_MIME_TYPES: dict[str, str] = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".wmv": "video/x-ms-wmv",
}


class RangeNotSatisfiableError(ValueError):
    """Raised when an HTTP Range header cannot be satisfied for the file size."""


def guess_video_mime(file_path: str) -> str:
    """Return MIME type for a video filename."""
    _, ext = os.path.splitext(file_path)
    return _MIME_TYPES.get(ext.lower(), "application/octet-stream")


def parse_range_header(range_header: str, file_size: int) -> tuple[int, int]:
    """Parse a single byte-range header into inclusive (start, end) byte offsets."""
    if file_size <= 0:
        raise RangeNotSatisfiableError("Empty file has no satisfiable byte range.")

    match = _RANGE_RE.fullmatch(range_header.strip())
    if not match:
        raise RangeNotSatisfiableError("Malformed Range header.")

    start_str, end_str = match.groups()
    if not start_str and not end_str:
        raise RangeNotSatisfiableError("Empty Range bounds.")

    if not start_str:
        suffix_len = int(end_str)
        if suffix_len <= 0:
            raise RangeNotSatisfiableError("Suffix byte length must be positive.")
        start = max(file_size - suffix_len, 0)
        end = file_size - 1
        return start, end

    start = int(start_str)
    if start >= file_size:
        raise RangeNotSatisfiableError("Range start exceeds file size.")

    end = int(end_str) if end_str else (file_size - 1)
    if end >= file_size:
        end = file_size - 1
    if start > end:
        raise RangeNotSatisfiableError("Range start exceeds range end.")

    return start, end


def _iter_file_range(file_path: str, start: int, length: int) -> Iterator[bytes]:
    remaining = length
    with open(file_path, "rb") as fh:
        fh.seek(start)
        while remaining > 0:
            chunk = fh.read(min(_CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def stream_video_file(file_path: str, range_header: Optional[str]) -> Response:
    """Return a 200 or 206 StreamingResponse (or 416 Response) for a video file."""
    file_size = os.path.getsize(file_path)
    mime_type = guess_video_mime(file_path)

    if range_header is None:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
        return StreamingResponse(
            _iter_file_range(file_path, 0, file_size),
            status_code=200,
            media_type=mime_type,
            headers=headers,
        )

    try:
        start, end = parse_range_header(range_header, file_size)
    except RangeNotSatisfiableError:
        return Response(
            status_code=416,
            headers={
                "Content-Range": f"bytes */{file_size}",
                "Accept-Ranges": "bytes",
            },
        )

    content_length = end - start + 1
    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
    }
    return StreamingResponse(
        _iter_file_range(file_path, start, content_length),
        status_code=206,
        media_type=mime_type,
        headers=headers,
    )

