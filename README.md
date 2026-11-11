# CameoDist (`Streamin-Serve`)

A self-contained, local-first media library manager and player workspace built with **FastAPI**, **SQLModel**, **React 18**, **TypeScript**, and **Tailwind CSS v4**.

## Capabilities

- **Local Folder Library:** Register local media roots and browse nested video directories with symlink-cycle protection and strict canonical path containment.
- **Automated Metadata & Thumbnails:** Extracts duration, resolution, file size, and JPEG thumbnails asynchronously via `ffprobe` and `ffmpeg`.
- **Hybrid Playback:**
  - **External `mpv` IPC Launcher:** Launches `mpv` with live IPC position polling and automatic resume/watched tracking (`>= 90%` progress).
  - **In-Browser Fallback Player:** Streams video via HTTP `206 Partial Content` byte-range requests (`/api/stream`) with real-time progress sync.
- **Search, Filtering & Watch Controls:** Search current folders, filter by `All` / `Unwatched` / `In Progress` / `Watched`, sort by name/size/duration/recent, and manually toggle watched status.
- **Runtime Flexibility:** Runs in a browser, as a `PyWebView` desktop window, or inside a multi-stage non-root Docker container.

## Prerequisites

- **Python** `3.10+`
- **Node.js** `20+` (or `22+`)
- **FFmpeg / FFprobe** on `PATH` (optional, for thumbnail and metadata extraction)
- **mpv** on `PATH` or configured via `MPV_EXECUTABLE` (optional; browser streaming works without it)

## Quick Start (Development)

1. Copy `.env.example` to `.env` and adjust settings if needed.
2. Install Python dependencies:
   ```bash
   pip install -r requirements-dev.txt
   ```
3. Install frontend dependencies:
   ```bash
   cd frontend && npm install && cd ..
   ```
4. Launch both backend and frontend dev servers:
   ```bash
   python launch.py
   ```
   - Frontend: `http://localhost:5173`
   - Backend API: `http://127.0.0.1:8000`

## Docker Deployment

```bash
docker compose up --build
```

Edit `docker-compose.yml` to mount your local video directory into `/media:ro`, then add `/media` in the CameoDist sidebar.

## Testing & Quality Checks

```bash
# Backend tests
pytest tests/backend -v

# Frontend lint, typecheck, tests & production build
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
```

## Project Structure

```text
Streamin-Serve/
├── backend/
│   ├── __init__.py
│   ├── config.py        # Typed Pydantic settings & writable data paths
│   ├── security.py      # Canonical path resolution, root containment, hash validation
│   ├── database.py      # SQLModel schema & SQLite WAL engine
│   ├── metadata.py      # Deduplicated ffprobe/ffmpeg extraction
│   ├── player.py        # Cross-platform mpv IPC controller
│   ├── streaming.py     # HTTP 206 Partial Content video streaming
│   ├── api.py           # FastAPI endpoints & SPA static serving
│   └── main.py          # PyWebView desktop & headless entrypoint
├── frontend/
│   ├── src/
│   │   ├── api/         # Zod schemas & typed fetch client
│   │   ├── components/  # Sidebar, HeaderBar, MediaRow, Modals, Toasts
│   │   ├── pages/       # Dashboard workspace
│   │   └── utils/       # UTF-8 Base64 encoding & formatting helpers
├── tests/backend/       # Pytest unit & integration suite
├── Dockerfile           # Multi-stage non-root production container
├── .github/workflows/ci.yml
└── BUILD.md             # Desktop packaging instructions
```

## License

MIT — see [LICENSE](LICENSE).
