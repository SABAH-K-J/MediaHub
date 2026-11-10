"""Filesystem path security, root containment, and input validation helpers."""

from __future__ import annotations

import base64
import binascii
import os
import re
from collections.abc import Sequence
from typing import Optional

VIDEO_EXTENSIONS: frozenset[str] = frozenset(
    {".mkv", ".mp4", ".avi", ".mov", ".wmv", ".webm", ".m4v"}
)

_SHA256_HEX_RE = re.compile(r"^[a-f0-9]{64}$")
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")


def canonicalize_path(raw_path: str) -> str:
    """Resolve symlinks and return an absolute canonical filesystem path."""
    if not raw_path or "\x00" in raw_path:
        raise ValueError("Path must be a non-empty string without null bytes.")
    return os.path.realpath(os.path.abspath(raw_path))


def normalize_for_compare(path: str) -> str:
    """Return platform-normalized canonical path for case-insensitive Windows comparisons."""
    return os.path.normcase(canonicalize_path(path))


def is_path_within_root(target_path: str, root_path: str) -> bool:
    """Return True if target_path resides at or beneath root_path."""
    try:
        norm_target = normalize_for_compare(target_path)
        norm_root = normalize_for_compare(root_path)
        return os.path.commonpath([norm_target, norm_root]) == norm_root
    except ValueError:
        # Different Windows drives or invalid paths
        return False


def find_containing_root(target_path: str, roots: Sequence[str]) -> Optional[str]:
    """Return the deepest registered root containing target_path, or None."""
    canon_target = canonicalize_path(target_path)
    best_root: Optional[str] = None
    best_len = -1

    for root in roots:
        try:
            canon_root = canonicalize_path(root)
        except ValueError:
            continue
        if is_path_within_root(canon_target, canon_root):
            norm_len = len(normalize_for_compare(canon_root))
            if norm_len > best_len:
                best_len = norm_len
                best_root = canon_root
    return best_root


def ensure_within_roots(target_path: str, roots: Sequence[str]) -> str:
    """Verify target_path is within at least one registered root, returning canonical path."""
    if not roots:
        raise PermissionError("No library roots are registered.")
    canon_target = canonicalize_path(target_path)
    if find_containing_root(canon_target, roots) is None:
        raise PermissionError("Access denied: path is outside registered library roots.")
    return canon_target


def decode_b64_path(encoded: str) -> str:
    """Decode standard or URL-safe Base64 UTF-8 path string into a raw filesystem path."""
    if not encoded or not isinstance(encoded, str):
        raise ValueError("Invalid path encoding.")
    cleaned = encoded.strip()
    if not cleaned:
        raise ValueError("Invalid path encoding.")

    # Support both standard and URL-safe Base64 with or without padding
    normalized = cleaned.replace("+", "-").replace("/", "_")
    padding = "=" * (-len(normalized) % 4)
    try:
        decoded_bytes = base64.urlsafe_b64decode(normalized + padding)
        decoded = decoded_bytes.decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("Invalid path encoding.") from exc

    if not decoded or "\x00" in decoded:
        raise ValueError("Invalid path encoding.")
    return decoded


def encode_b64_path(path: str) -> str:
    """Encode a filesystem path as URL-safe UTF-8 Base64."""
    return base64.urlsafe_b64encode(path.encode("utf-8")).decode("ascii")


def validate_file_hash(file_hash: str) -> str:
    """Validate SHA-256 hex digest string used for thumbnail lookups."""
    if not isinstance(file_hash, str) or not _SHA256_HEX_RE.fullmatch(file_hash):
        raise ValueError("Invalid thumbnail hash format.")
    return file_hash


def is_allowed_video(path: str) -> bool:
    """Return True if path has an allowed video extension."""
    _, ext = os.path.splitext(path)
    return ext.lower() in VIDEO_EXTENSIONS


def sanitize_display_name(name: str) -> str:
    """Strip ASCII control characters from filenames before returning to clients."""
    return _CONTROL_CHAR_RE.sub("", name)

