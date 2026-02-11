# MediaHub Windows Application - Build Instructions

## Quick Build (Recommended)

Run this single command to build everything:

```bash
python quick_build.py
```

This will:
1. Build the frontend (React/Vite)
2. Package everything into MediaHub.exe

## Manual Build

If you prefer to build step-by-step:

### Step 1: Build Frontend
```bash
cd frontend
npm run build
cd ..
```

### Step 2: Build Executable
```bash
python build.py
```

## After Building

Your executable will be at: `dist/MediaHub.exe`

You can:
- ✅ Run it directly (double-click)
- ✅ Move it anywhere on your computer
- ✅ Create a desktop shortcut
- ✅ Share it with others (no Python required!)

## First Run

When you first run MediaHub.exe:
1. Click "Scan Library"
2. Enter the path to your media folder
3. Wait for scanning to complete
4. Enjoy your media!

## Requirements for Building

- Python 3.8+
- Node.js 16+
- All dependencies installed:
  ```bash
  pip install -r requirements.txt
  cd frontend && npm install
  ```

## Troubleshooting

**Build fails?**
- Make sure all dependencies are installed
- Check that frontend/dist exists after frontend build
- Try deleting `build` and `dist` folders and rebuilding

**Executable won't run?**
- Windows Defender might block it (it's a new executable)
- Right-click → Properties → Unblock
- Or add an exception in Windows Security
