# MediaHub Desktop Build Instructions

## Quick Build

Run this single command from the repository root to build the React/TypeScript frontend and package the standalone executable:

```bash
python quick_build.py
```

## Manual Build

### 1. Build Frontend

```bash
cd frontend
npm run build
cd ..
```

### 2. Package Executable

```bash
python build.py
```

The packaged binary is written to `dist/MediaHub.exe` on Windows (or `dist/MediaHub` on Linux/macOS).

## Runtime Storage When Packaged

When running as a frozen PyInstaller executable, MediaHub stores `library.db` and `.thumbnails/` in a writable user data directory (`%LOCALAPPDATA%\MediaHub` on Windows, `~/.local/share/mediahub` on POSIX) rather than inside the temporary `_MEIPASS` bundle directory. You can override these locations with `MEDIAHUB_DB_PATH` and `MEDIAHUB_THUMBNAILS_DIR`.

## Requirements

- Python `3.10+` (`pip install -r requirements.txt`)
- Node.js `20+` (`cd frontend && npm install`)
- Optional on host PATH: `ffmpeg`, `ffprobe`, and `mpv`
