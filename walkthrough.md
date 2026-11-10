# MediaHub (`Streamin-Serve`) Rebuild Walkthrough

## 1. Architecture & Key Decisions
- **Backend Package (`backend/`):**
  - `backend/config.py`: Typed `Settings` (`pydantic.BaseModel`, `extra="forbid"`) loading `.env` / OS environment variables and resolving persistent writable directories outside `sys._MEIPASS` when frozen.
  - `backend/database.py`: `SQLModel` models (`LibraryRoot`, `VideoProgress`) with `check_same_thread=False`, SQLite `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, `PRAGMA foreign_keys=ON`, and non-destructive `ALTER TABLE` column migrations for pre-existing databases.
  - `backend/security.py`: Canonical realpath resolution (`os.path.realpath` + `os.path.normcase`), `ensure_within_roots` containment via `os.path.commonpath`, strict SHA-256 hex validation (`^[a-f0-9]{64}$`) for thumbnails, URL-safe/standard UTF-8 Base64 decoding with null-byte rejection, and video extension allowlisting.
  - `backend/metadata.py`: Deduplicated `ffprobe`/`ffmpeg` extraction (`_in_flight_lock`), 15s subprocess timeouts, empty-streams guard, duration-clamped seek timestamps for short clips, and deterministic SHA-256 thumbnail paths.
  - `backend/player.py`: Cross-platform `mpv` discovery & IPC socket/pipe naming, `--` CLI option delimiter before the file path, race-free `MPV_SESSIONS` cleanup using `session_id`, and `>= 90%` auto-watched persistence.
  - `backend/streaming.py`: HTTP `206 Partial Content` / `200 OK` / `416 Range Not Satisfiable` byte-range streaming for in-browser playback.
  - `backend/api.py`: FastAPI `lifespan` context manager, strict Pydantic v2 schemas (`extra="forbid"`), explicit CORS allowlist, symlink-cycle-protected `_contains_video` with `(st_dev, st_ino)` tracking & depth limit, root-clamped `parent_path` & `breadcrumbs`, and SPA static asset serving.
  - `backend/main.py`: Polls `/api/health` readiness before opening the `PyWebView` window and supports `--headless` mode.
- **Frontend (`frontend/`):**
  - Migrated to **React 18 + TypeScript + Vite 5 + Tailwind CSS v4 (`@tailwindcss/vite`) + Zod + Vitest / React Testing Library**.
  - Removed external Google Fonts CDN `@import` and deprecated `unescape()`, using `TextEncoder`/`TextDecoder` URL-safe Base64 encoding and `AbortSignal` on GET requests.
  - Implemented the dark-room "Screening Room Program & Cue Index" layout (`Sidebar`, `HeaderBar`, `MediaRow`, `BrowserPlayerModal`, `SettingsModal`, `ToastContainer`) with accessible controls, inline delete confirmation, and `aria-live` toast feedback.
- **Tooling, Packaging & DevOps:**
  - Updated `launch.py`, `build.py`, `quick_build.py`, `MediaHub.spec`, `run.bat`, `.gitignore`, `.env.example`, `Dockerfile` (multi-stage non-root), `.dockerignore`, `docker-compose.yml`, `pyproject.toml`, `requirements.txt`, `requirements-dev.txt`, `DESIGN.md`, `README.md`, `BUILD.md`, and `.github/workflows/ci.yml`.
  - Removed dead `backend/scanner.py` and superseded `.jsx`/Tailwind v3 files.

## 2. Security Measures Verified
- All browse, thumbnail, stream, progress, watch/unwatch, and `mpv` endpoints enforce `ensure_within_roots` against registered `LibraryRoot` rows (`403` on traversal or outside-root access).
- `/api/thumbnails/{file_hash}` validates strict 64-char lowercase hex SHA-256 digests (`400` on invalid hash).
- `mpv` command builder passes `--` before the file path to prevent CLI option injection.
- CORS uses an explicit origin list (`MEDIAHUB_CORS_ORIGINS`), rejecting `*`.
- All API payloads are validated server-side with Pydantic v2 (`extra="forbid"`) and client-side with Zod.

## 3. Verification Output
- **Backend Tests (`python -m pytest tests/backend -v`):**
  - `tests/backend/test_metadata_and_streaming.py` (3 tests)
  - `tests/backend/test_playback_and_progress.py` (3 tests)
  - `tests/backend/test_roots_and_browse.py` (3 tests)
  - `tests/backend/test_security.py` (6 tests)
  - Result: **15 passed in 0.86s**
- **Frontend Checks (`frontend/`):**
  - `npm run lint`: passed (0 errors, 0 warnings)
  - `npm run typecheck` (`tsc --noEmit`): passed
  - `npm test` (`vitest run`): **4 test files, 5 passed** (`encoding.test.ts`, `schemas.test.ts`, `BrowserPlayerModal.test.tsx`, `Dashboard.test.tsx`)
  - `npm run build`: passed (`dist/index.html`, `dist/assets/index-CiJOVOLa.css`, `dist/assets/index-Bpvfpcbw.js`)
- **Impeccable UI Detector (`impeccable detect --json`):** `[]` (0 findings)
- **Live Browser Verification (`http://127.0.0.1:8099` via Chrome DevTools MCP):**
  - Verified desktop (`1440x900`) and mobile (`390x844`) responsive layouts, registering a local media root, FFmpeg thumbnail & `360p` metadata extraction, folder navigation & breadcrumbs, HTTP range streaming inside `BrowserPlayerModal` (`role="dialog"`), and watched/unwatched toggling.

