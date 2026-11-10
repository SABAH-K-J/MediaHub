# MediaHub (`Streamin-Serve`) Rebuild Plan

## 1. Overview & Confirmed Scope
Rebuild **MediaHub** into a production-ready, self-contained local media library manager and player workspace following `.antigravity/RULES.md`, Context7 current APIs, and `impeccable` `operate`-mode design standards.

Confirmed product decisions:
- **Core Product:** Clean local folder library & progress tracker (no external IMDb/Wikipedia scraping, no dead `scanner.py` categorization).
- **Hybrid Playback & Runtime:** External `mpv` IPC launcher (with automatic position sync & resume) **plus** HTTP `206 Partial Content` range streaming (`/api/stream`) with an in-browser HTML5 `<video>` player fallback (works in browser, headless, Linux, and Docker), optional `PyWebView` desktop wrapper, and multi-stage non-root Docker image.
- **Frontend Stack & Visual Redesign:** React 18 + TypeScript + Vite + Tailwind CSS v4 (`@tailwindcss/vite`) + Zod runtime API validation + Vitest / React Testing Library, redesigned under `impeccable` `operate` mode (degraded `concept-seed` roll — assigned index `4`, no external challengers/boards).

---

## 2. Architecture

### 2.1 Backend (`backend/`)
All backend modules will live cleanly as a package (`backend/`), configurable via typed Pydantic Settings / environment variables (`.env` / OS env, zero hardcoded paths or secrets):
- **`backend/config.py`**: Typed `Settings` (`pydantic.BaseModel` / env loader with `python-dotenv`) resolving:
  - `MEDIAHUB_HOST` (default `127.0.0.1`)
  - `MEDIAHUB_PORT` (default `8000`)
  - `MEDIAHUB_DB_PATH` (writable app data dir when frozen with PyInstaller, or project root/configured path in dev/Docker)
  - `MEDIAHUB_THUMBNAILS_DIR` (persistent writable dir, never `sys._MEIPASS`)
  - `MEDIAHUB_CORS_ORIGINS` (explicit allowlist, e.g. `http://localhost:5173,http://127.0.0.1:8000,http://localhost:8000`, never `*` with credentials)
  - `MPV_EXECUTABLE`, `FFMPEG_EXECUTABLE`, `FFPROBE_EXECUTABLE`, `MEDIAHUB_SCAN_MAX_DEPTH`, `MEDIAHUB_LOG_LEVEL`
- **`backend/security.py`**:
  - Canonical path resolution (`os.path.realpath` + `os.path.normcase` on Windows).
  - Strict root-containment guard `ensure_within_roots(target_path, roots)` using `os.path.commonpath` so no API endpoint can read, browse, stream, or execute `mpv` outside registered `LibraryRoot` directories.
  - Strict `file_hash` validation (`^[a-f0-9]{64}$` / SHA-256 hex) for `/api/thumbnails/{file_hash}` to eliminate path traversal.
  - XSS-safe filename/display helpers & strict media extension allowlist.
- **`backend/database.py`**:
  - `SQLModel` (`0.0.32` / SQLAlchemy `2.0.45`) with `connect_args={"check_same_thread": False}` for SQLite, plus SQLite `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, and `PRAGMA foreign_keys=ON` via SQLAlchemy `connect` event listener.
  - Clean session generator (`get_session`) with proper rollback on exceptions.
- **`backend/metadata.py`**:
  - SHA-256 canonical path hash (`generate_file_hash`) for deterministic thumbnails across Windows case differences.
  - Deduplicated in-flight job tracking (`_in_flight_lock` + `set[str]`) so 5s UI polling or concurrent `/api/browse` calls never spawn duplicate `ffprobe`/`ffmpeg` jobs or trigger SQLite `IntegrityError` races.
  - Safe `ffprobe` / `ffmpeg` execution with `timeout=15`, `streams` empty-list guard, `duration < 10s` seek-time clamp (`max(1.0, duration * 0.1)` capped below duration), non-zero exit handling, and graceful degradation when `ffmpeg`/`ffprobe` is absent.
- **`backend/player.py`**:
  - Cross-platform `mpv` discovery (`shutil.which` + OS-specific fallback paths) and IPC socket/pipe naming (`\\.\pipe\...` on Windows, `/tmp/mediahub_mpv_...` on POSIX).
  - CLI option injection defense: passes `--` before `self.file_path` in `subprocess.Popen`.
  - Race-free `MPV_SESSIONS` tracking using a unique `session_id` token so terminating an older session never pops a newly launched session from `MPV_SESSIONS`.
  - Updates `last_position_sec`, `duration` (only when valid `> 0`), `progress_ratio`, `watched` (`ratio >= 0.9`, or resets/updates cleanly on manual watch/unwatch), and UTC ISO timestamp `watch_date`.
- **`backend/streaming.py`**:
  - HTTP `Range` (`bytes=start-end`) streaming generator returning `206 Partial Content` (`Accept-Ranges: bytes`, `Content-Range`, `Content-Length`, proper `video/*` MIME type) or `200 OK` full stream, plus `416 Range Not Satisfiable` on invalid ranges, strictly gated by `ensure_within_roots`.
- **`backend/api.py`**:
  - FastAPI `lifespan` async context manager (replaces deprecated `@app.on_event("startup")`).
  - Strict Pydantic v2 request/response models (`model_config = {"extra": "forbid"}`).
  - Endpoints:
    - `GET /api/health` (returns service status, `mpv_available`, `ffmpeg_available`, version)
    - `GET /api/roots`, `POST /api/roots`, `DELETE /api/roots/{root_id}`
    - `GET /api/browse?path=<urlsafe_b64>&q=<search>&status=<all|unwatched|in_progress|watched>&sort=<name|size|duration|recent>` (symlink-cycle-protected recursive `contains_video` with visited `(st_dev, st_ino)` set and `max_depth`, `parent_path` clamped at registered `LibraryRoot`)
    - `GET /api/thumbnails/{file_hash}`
    - `GET /api/last-watched` (and `GET /api/recent` for Continue Watching list)
    - `POST /api/play` (external `mpv` launch; returns `503` cleanly if `mpv` unavailable so frontend can offer browser fallback)
    - `GET /api/play/progress?path=<b64>`
    - `GET /api/stream?path=<b64>` (HTTP range streaming for in-browser `<video>` playback)
    - `POST /api/file/progress` (browser `<video>` playback progress sync: updates `last_position_sec`, `duration`, `progress_ratio`, `watched`, `watch_date`)
    - `POST /api/file/watch`, `POST /api/file/unwatch`
  - Serves built SPA (`frontend/dist`) including static assets, `/vite.svg` or custom SVG favicon, and catch-all SPA route (excluding `/api/*`).

### 2.2 Frontend (`frontend/`)
- **TypeScript + React 18 + Vite 5 + Tailwind CSS v4**:
  - Migrate to TypeScript (`tsconfig.json`, `src/**/*.ts`, `src/**/*.tsx`), replace `@tailwindcss/postcss` v3 directives with `@tailwindcss/vite` + `@import "tailwindcss";` in `src/index.css`.
  - Remove external Google Fonts CDN `@import` so desktop/offline/Docker builds never fail or block rendering; use crisp local/system sans + tabular monospace stacks.
  - Add Vite `/api` dev proxy (`vite.config.ts`) and `VITE_API_URL` env support.
- **Runtime Validation & API Client (`src/api/client.ts`, `src/api/schemas.ts`)**:
  - Replace deprecated `unescape()` with `TextEncoder`/`TextDecoder` UTF-8 URL-safe Base64 helpers.
  - Validate every API response and user input with **Zod** schemas.
  - Support `AbortSignal` on all GET calls so rapid navigation or 5s polling never causes stale-response overwrites.
- **UI Redesign (`impeccable` `operate` mode — Candidate 4: "Screening Room Program & Cue Index")**:
  - **Committed Visual World:** Dark-room obsidian/graphite surface (`#0c0d10` canvas, `#15171c` elevated rail/cards, `#232730` hairline borders), crisp alabaster ink (`#f3f4f6`), muted pewter metadata (`#9ca3af`), burnt-tangerine screening accent (`#f97316`), emerald watched state (`#22c55e`), amber in-progress state (`#f59e0b`).
  - **Shell & Work Areas:**
    - **Left Library Rail** (responsive collapsible drawer on mobile): Add Root form (with visible `<label>` and validation), Library Roots list with active indicator and delete button (with confirmation), and a "Continue Watching" cue card showing the active unfinished video with resume progress bar.
    - **Top Operational Toolbar:** Breadcrumb trail clamped to the active root (clickable path segments + Back to Roots), live search input, status filter pills (`All`, `Unwatched`, `In Progress`, `Watched`), sort selector, and a System Status / Settings popover (`mpv` & `ffmpeg` availability from `/api/health`, default player mode toggle: `Auto / mpv / Browser`).
    - **Main Media Index Grid/List:** Folders and video cards/rows with thumbnails (or clean film fallback), tabular metadata pills (`size`, `resolution`, `duration`), **signature timecode progress scrubber bar** with percentage/timestamp readout, primary Play button (`mpv` or Browser Player), and explicit **Mark Watched / Unwatched** toggle button.
    - **In-Browser Screening Modal (`BrowserPlayerModal.tsx`):** Accessible modal (`role="dialog"`, focus trap, `Escape` to close, keyboard shortcuts) streaming `/api/stream` in `<video controls>` starting at `last_position_sec`, periodically syncing progress via `POST /api/file/progress`.
    - **Non-blocking Toast Notifications:** Replaces all `window.alert()` calls with accessible `aria-live` toast banners.
    - **Full Accessibility:** Native `<button>`/`<a>`/`<label>` elements, visible `:focus-visible` outlines, descriptive `alt` attributes, `44x44`+ hit targets, semantic `<header>`, `<nav>`, `<main>`, `<aside>`.

### 2.3 Tooling, Packaging, Containerization & CI
- **Desktop Launcher (`backend/main.py`, `launch.py`, `build.py`, `quick_build.py`, `MediaHub.spec`, `run.bat`)**:
  - `backend/main.py` polls `/api/health` readiness instead of blind `time.sleep(1)` and binds configurable port.
  - `launch.py` avoids `shell=True` orphaned Vite processes on Windows (`CREATE_NEW_PROCESS_GROUP` / `taskkill /T /F` cleanup on Windows), streams errors cleanly instead of silent `DEVNULL`, and shuts down cleanly on exit.
  - `build.py` & `MediaHub.spec` use `os.pathsep` cross-platform data separator and include required PyInstaller hidden imports.
- **Repo Hygiene & DevOps (`.antigravity/RULES.md` §4)**:
  - Exhaustive `.gitignore` (covering `.thumbnails/`, `backend/thumbnails/`, `*.db`, `.env`, `dist/`, `build/`, `coverage/`, `.pytest_cache/`, `node_modules/`, etc.).
  - Typed `.env.example` with documented defaults and zero secrets.
  - Multi-stage non-root `Dockerfile` (Stage 1: Node 22 builds `frontend/dist`; Stage 2: Python 3.10-slim + `ffmpeg` runtime running as non-root `mediahub` user with `HEALTHCHECK`).
  - `.dockerignore` and `docker-compose.yml` (optional convenient volume mount template) or documented `docker run`.
  - `.github/workflows/ci.yml`: Runs Python lint (`ruff`), Python typecheck (`mypy`), Python tests (`pytest`), Frontend lint (`eslint`), Frontend typecheck (`tsc --noEmit`), Frontend tests (`vitest`), Frontend production build, and secret scan (`gitleaks` or regex/detect-secrets check).

---

## 3. Data & API Schema

### 3.1 SQLite / SQLModel Schema
- **`LibraryRoot`**:
  - `id: int | None` (PK)
  - `path: str` (unique, indexed, canonical realpath)
  - `label: str | None` (optional display name)
  - `created_at: datetime` (UTC)
- **`VideoProgress`**:
  - `file_path: str` (PK, canonical realpath)
  - `file_hash: str` (indexed SHA-256 hex of normalized path)
  - `duration: float | None` (`>= 0`)
  - `last_position_sec: float | None` (`>= 0`)
  - `progress_ratio: float` (`0.0..1.0`)
  - `watched: bool` (`default=False`)
  - `watch_date: datetime | None` (UTC timestamp, stored properly for chronological sorting)
  - `resolution: str | None`
  - `size_bytes: int | None`
  - `thumbnail_path: str | None`

### 3.2 API Contract (Pydantic v2 + Zod)
- `GET /api/health` -> `{ status: "ok", version: str, mpv_available: bool, ffmpeg_available: bool }`
- `GET /api/roots` -> `LibraryRootRead[]`
- `POST /api/roots` (`{ path: string }`) -> `201/200 LibraryRootRead` | `400/422`
- `DELETE /api/roots/{root_id}` -> `{ status: "deleted", id: int }` | `404`
- `GET /api/browse?path=<b64>&q=&status=&sort=` -> `{ current_path, root_path, parent_path, breadcrumbs: {name, path}[], items: BrowseItem[] }` (`403` if outside roots, `404` if missing)
- `GET /api/thumbnails/{file_hash}` -> `image/jpeg` (`400` invalid hash, `404` missing)
- `GET /api/last-watched` -> `LastWatchedItem | null`
- `POST /api/play` (`{ file_path: b64 }`) -> `{ status: "playback started", mode: "mpv" }` (`403` outside roots, `404` not a file, `503` mpv unavailable)
- `GET /api/play/progress?path=<b64>` -> `{ active: bool, file_path?, time_pos?, duration?, progress? }`
- `GET /api/stream?path=<b64>` -> `200`/`206` video byte stream (`Accept-Ranges: bytes`)
- `POST /api/file/progress` (`{ file_path: b64, position_sec: float, duration_sec: float | None }`) -> `VideoProgressRead`
- `POST /api/file/watch` (`{ file_path: b64 }`) -> `VideoProgressRead`
- `POST /api/file/unwatch` (`{ file_path: b64 }`) -> `VideoProgressRead`

---

## 4. Planned File Changes

### Backend & Root
- **Modify/Rewrite:** `requirements.txt` (add `pytest`, `httpx`, `ruff`, `mypy`, `python-dotenv`; pin compatible versions matching installed Python 3.10 environment and clean unused `cinemagoer`/`wikipedia-api`/`lxml` if no longer used, or separate `requirements-dev.txt`), `backend/database.py`, `backend/api.py`, `backend/metadata.py`, `backend/player.py`, `backend/main.py`, `launch.py`, `build.py`, `quick_build.py`, `MediaHub.spec`, `run.bat`, `.gitignore`, `README.md`, `BUILD.md`.
- **Create:** `backend/__init__.py`, `backend/config.py`, `backend/security.py`, `backend/streaming.py`, `pyproject.toml` (pytest/ruff/mypy config), `.env.example`, `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`.
- **Remove:** `backend/scanner.py` (broken dead module referencing non-existent `MediaItem`/`MediaFile`).

### Frontend (`frontend/`)
- **Modify/Rewrite:** `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.js` -> `frontend/vite.config.ts`, `frontend/src/index.css`, `frontend/src/main.jsx` -> `frontend/src/main.tsx`, `frontend/src/App.jsx` -> `frontend/src/App.tsx`, `frontend/src/components/Navbar.jsx` -> `frontend/src/components/HeaderBar.tsx`, `frontend/src/pages/Dashboard.jsx` -> `frontend/src/pages/Dashboard.tsx`.
- **Create:** `frontend/tsconfig.json`, `frontend/vitest.config.ts`, `frontend/src/api/schemas.ts`, `frontend/src/api/client.ts`, `frontend/src/utils/encoding.ts`, `frontend/src/utils/format.ts`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/MediaRow.tsx`, `frontend/src/components/BrowserPlayerModal.tsx`, `frontend/src/components/SettingsModal.tsx`, `frontend/src/components/ToastContainer.tsx`, `frontend/src/test/setup.ts`.
- **Remove:** `frontend/postcss.config.js` (replaced by `@tailwindcss/vite`), `frontend/tailwind.config.js` (v3 config), `frontend/src/App.css`, `frontend/src/api.js`, `frontend/src/components/StarRating.jsx` (dead orphan), old `.jsx` files superseded by `.tsx`.

### Tests & Documentation
- **Create:**
  - `tests/backend/conftest.py` (isolated temp SQLite DB + temp media root fixture)
  - `tests/backend/test_security.py` (root containment, Windows/POSIX path normalization, hash validation, traversal rejection)
  - `tests/backend/test_roots_and_browse.py` (add/duplicate/invalid/delete roots, browse filtering/sorting/search, symlink cycle protection, parent clamping at root)
  - `tests/backend/test_playback_and_progress.py` (watch/unwatch, browser progress sync, >=90% auto-watched, last-watched ordering, `mpv` CLI `--` delimiter, session replacement race test, `mpv` missing `503`)
  - `tests/backend/test_metadata_and_streaming.py` (ffprobe/ffmpeg mocked & boundary tests, deduplication, HTTP Range `206`/`416` streaming, outside-root `403`)
  - `frontend/src/__tests__/encoding.test.ts`, `frontend/src/__tests__/schemas.test.ts`, `frontend/src/__tests__/Dashboard.test.tsx`, `frontend/src/__tests__/BrowserPlayerModal.test.tsx`
  - `walkthrough.md` (created after Build & Test verification per `.antigravity/RULES.md` §2.4).

---

## 5. Verification Plan
1. **Backend:** `pytest` (all unit & integration tests passing), `ruff check`, `mypy backend`.
2. **Frontend:** `npm run lint`, `npx tsc --noEmit`, `npm test` (Vitest), `npm run build`.
3. **API Contract / Postman:** Verify OpenAPI schema & endpoint contracts (and run Postman collection / CLI checks if authenticated).
4. **Live Browser Verification (Mandatory per `RULES.md` §3):**
   - Start backend + frontend on `localhost` (`BypassSandbox: true` if user-facing or tested inside single command / outside sandbox for Chrome DevTools MCP).
   - Inspect desktop (`1440x900`) and mobile (`390x844`) responsive layouts using Chrome DevTools MCP (`new_page`, `resize_page`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `lighthouse_audit`).
   - Run `impeccable detect --json` on changed UI files.
   - Verify zero console errors, zero unhandled rejections, and working end-to-end flows (add root, browse, search/filter, play in browser `<video>`, progress sync, mark watched/unwatched, delete root).
5. **Docker Build Check (if Docker daemon is running):** Build multi-stage image or lint `Dockerfile`.

---

## 6. Risks & Mitigations
- **External binaries (`mpv`, `ffmpeg`, `ffprobe`) missing in CI or Docker:** Backend gracefully degrades (`503` for `mpv` with UI prompt to switch to Browser Player; `metadata.py` skips thumbnail/duration cleanly without crashing); `Dockerfile` installs `ffmpeg`.
- **SQLite concurrent writes (`BackgroundTasks` + `mpv` watcher thread + HTTP requests):** Mitigated via SQLite WAL mode, `busy_timeout=5000`, `check_same_thread=False`, and in-flight metadata deduplication lock.
- **Symlink/junction loops on Windows/Linux:** `contains_video` tracks visited `(st_dev, st_ino)` pairs and enforces `max_depth`.
- **Tailwind CSS v4 + Vite migration:** Use official `@tailwindcss/vite` plugin per Context7 docs and verify compiled CSS output in both Vite dev and `vite build`.

