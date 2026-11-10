# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary user:** A local media collector / viewer managing video folders on a personal Windows PC or local Docker/LAN server.
- **Situation & job:** Browsing nested folders of movies, shows, and clips; launching playback quickly (via external `mpv` with live IPC resume, or browser `<video>` fallback); tracking watched vs. in-progress status; and continuing the most recent unfinished video in one action.

## Product Purpose

MediaHub (`Streamin-Serve`) turns local video directories into a fast, self-hosted media workspace with automated FFmpeg thumbnail/metadata extraction, `mpv` IPC playback synchronization, HTTP byte-range streaming fallback, and reliable watch-progress persistence in SQLite.

Success means:
- Navigating library roots and nested video folders with zero stale-state races, path-traversal gaps, or dead controls.
- Resuming any video where the user left off (via `mpv` or browser player) and marking items watched/unwatched cleanly.
- Shipping a hardened, tested, containerized FastAPI + React/TypeScript application ready for both local desktop (`PyWebView`) and web/Docker operation.

## Positioning

Unlike bloated media servers that require account clouds, external scrapers, or rigid folder naming, MediaHub works directly over arbitrary local folders while still tracking frame-accurate `mpv` progress, FFmpeg thumbnails, and browser fallback playback.

## Operating Context

- **Desktop / Local Dev:** Windows workstation running FastAPI (`uvicorn`), Vite/React frontend, `mpv` via IPC named pipe (or Unix socket on Linux/Docker), and `ffmpeg`/`ffprobe` for thumbnails and media inspection.
- **Containerized / Headless:** Multi-stage non-root Docker container serving the built SPA and API with HTTP range streaming (`/api/stream`) when local `mpv` is unavailable.
- **Optional Desktop Window:** `PyWebView` wrapper (`backend/main.py`) opening the locally served application.

## Capabilities and Constraints

- **Library Roots:** Add, list, validate, and remove allowed root directories. All browse, thumbnail, stream, watch, and playback APIs enforce canonical realpath containment within registered roots.
- **Folder Browsing & Filtering:** Browse folders containing videos (with symlink-safe cycle protection), search/filter items, sort, and view file size, resolution, duration, and thumbnail previews.
- **Dual Playback:** Launch external `mpv` with CLI `--` option separator and IPC progress polling; provide HTTP `206 Partial Content` range streaming + browser `<video>` player modal/view with progress sync.
- **Watch Tracking:** Mark videos watched/unwatched, auto-mark watched at >= 90% progress, and surface a one-click "Continue Watching" action for the latest in-progress video.
- **Security & Offline Reliability:** Zero external CDN font/asset dependencies, strict Pydantic/Zod validation, explicit CORS allowlist, parameterized SQLModel queries, and non-root Docker execution.

## Brand Commitments

- **Product Name:** MediaHub
- **Language:** English UI, concise operational labels, zero placeholder lore or fake marketing claims.

## Evidence on Hand

- Existing FastAPI + SQLModel backend (`backend/`), React + Vite frontend (`frontend/`), FFmpeg/FFprobe metadata extractor, and `mpv` IPC controller in the repository.

## Product Principles

1. **Speed to playback:** Finding a folder and pressing play takes minimal clicks and instant visual confirmation.
2. **Filesystem safety by construction:** Every path operation resolves canonically and stays strictly inside user-approved library roots.
3. **Truthful state:** Progress bars, watched badges, thumbnails, and active player indicators reflect real backend/disk state without silent failures.
4. **Offline-first & self-contained:** Fonts, icons, and assets bundle locally so the desktop and Docker builds work identically without internet access.

## Accessibility & Inclusion

- Semantic landmarks, native `<button>`/`<label>` controls, keyboard navigation across folders/videos/modals, visible focus indicators, descriptive `alt` text, and WCAG AA contrast.

