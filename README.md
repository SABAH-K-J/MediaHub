# 🎬 MediaHub

A beautiful, production-ready Windows desktop application for managing your media library with automatic metadata fetching, watch progress tracking, and a stunning modern UI.

![MediaHub](https://img.shields.io/badge/platform-Windows-blue)
![Python](https://img.shields.io/badge/python-3.8+-blue)
![React](https://img.shields.io/badge/react-18+-61dafb)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- 🎨 **Premium UI** - Glassmorphism, animated gradients, smooth transitions
- 📚 **Smart Library** - Automatic scanning and categorization (Movies, Series, Anime)
- 🌐 **Metadata Fetching** - Posters, descriptions, ratings from Wikipedia + IMDb
- 📺 **Watch Tracking** - Mark episodes as watched, track progress
- 🖼️ **Thumbnails** - Auto-generated video previews with FFmpeg
- 🎮 **Media Players** - VLC and PotPlayer integration
- 📦 **Standalone** - Single `.exe` file, no dependencies required

## 🚀 Quick Start

### For Users (Standalone Executable)

1. Download `MediaHub.exe` from [Releases](../../releases)
2. Double-click to run
3. Click "Scan Library" and select your media folder
4. Enjoy your organized media library!

### For Developers

#### Prerequisites

- Python 3.8+
- Node.js 16+
- FFmpeg (for thumbnails)
- VLC or PotPlayer (for playback)

#### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/MediaHub.git
cd MediaHub

# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..
```

#### Development

```bash
# Run in development mode
python launch.py
# OR
run.bat
```

This starts:
- Backend (FastAPI) on `http://localhost:8000`
- Frontend (Vite) on `http://localhost:5173`

#### Building

```bash
# Quick build (recommended)
python quick_build.py

# Manual build
cd frontend
npm run build
cd ..
python build.py
```

The executable will be created at `dist/MediaHub.exe`

## 🏗️ Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SQLModel** - SQL database ORM
- **PyWebView** - Desktop window wrapper
- **Cinemagoer** - IMDb metadata
- **FFmpeg** - Video thumbnail generation

### Frontend
- **React** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Axios** - API client

### Build
- **PyInstaller** - Python executable packaging
- **Vite** - Frontend optimization

## 📁 Project Structure

```
MediaHub/
├── backend/
│   ├── main.py          # Entry point
│   ├── api.py           # FastAPI routes
│   ├── database.py      # Database models
│   ├── scanner.py       # Media scanner
│   ├── metadata.py      # Metadata fetcher
│   └── player.py        # Media player launcher
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


Project Link: [https://github.com/SABAH-K-J/MediaHub](https://github.com/SABAH-K-J/MediaHub.git)
