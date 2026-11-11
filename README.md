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
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── api.js       # API client
│   │   └── index.css    # Styles & animations
│   └── dist/            # Production build
├── build.py             # Build script
├── quick_build.py       # One-command build
├── launch.py            # Development launcher
├── requirements.txt     # Python dependencies
└── README.md
```

## 🎨 Screenshots

> Add screenshots of your application here

## 📖 Documentation

- [Build Instructions](BUILD.md) - Detailed build guide
- [API Documentation](docs/API.md) - Backend API reference
- [Contributing](CONTRIBUTING.md) - Contribution guidelines

## 🔧 Configuration

### Media Players

MediaHub auto-detects VLC and PotPlayer. Ensure one is installed:
- **VLC**: `C:\Program Files\VideoLAN\VLC\vlc.exe`
- **PotPlayer**: `C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe`

### Database

SQLite database stored at `backend/library.db`. Delete to reset.

## 🐛 Known Issues

- Windows Defender may flag the executable (false positive)
- Some media may not have metadata available

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Cinemagoer](https://cinemagoer.github.io/)
- [PyWebView](https://pywebview.flowrl.com/)

## 📧 Contact

Your Name - [@yourtwitter](https://twitter.com/yourtwitter)

Project Link: [https://github.com/yourusername/MediaHub](https://github.com/yourusername/MediaHub)

---

Made with ❤️ and ☕
