# MediaHub - Build Script
# This script packages the MediaHub application into a standalone executable

import PyInstaller.__main__
import shutil
import os
from pathlib import Path

def build():
    """Build MediaHub executable using PyInstaller"""
    
    print("=" * 60)
    print("Building MediaHub Windows Application")
    print("=" * 60)
    
    # Check if frontend is built
    if not os.path.exists('frontend/dist'):
        print("\n❌ ERROR: Frontend not built!")
        print("Please run: cd frontend && npm run build")
        return False
    
    # Clean previous builds
    print("\n🧹 Cleaning previous builds...")
    if os.path.exists('dist'):
        shutil.rmtree('dist')
    if os.path.exists('build'):
        shutil.rmtree('build')
    
    # PyInstaller arguments
    print("\n📦 Packaging application...")
    args = [
        'backend/main.py',  # Entry point
        '--name=MediaHub',  # Executable name
        '--onefile',  # Single executable
        '--windowed',  # No console window (GUI only)
        '--add-data=frontend/dist;frontend/dist',  # Include frontend build
        '--hidden-import=uvicorn.logging',
        '--hidden-import=uvicorn.loops',
        '--hidden-import=uvicorn.loops.auto',
        '--hidden-import=uvicorn.protocols',
        '--hidden-import=uvicorn.protocols.http',
        '--hidden-import=uvicorn.protocols.http.auto',
        '--hidden-import=uvicorn.protocols.websockets',
        '--hidden-import=uvicorn.protocols.websockets.auto',
        '--hidden-import=uvicorn.lifespan',
        '--hidden-import=uvicorn.lifespan.on',
        '--collect-all=fastapi',
        '--collect-all=sqlmodel',
        '--collect-all=cinemagoer',
        '--collect-all=lxml',
        '--noconfirm',  # Overwrite without asking
    ]
    
    # Add icon if exists
    if os.path.exists('icon.ico'):
        args.append('--icon=icon.ico')
    
    try:
        PyInstaller.__main__.run(args)
        print("\n✅ Build complete!")
        print(f"\n📂 Executable location: {os.path.abspath('dist/MediaHub.exe')}")
        print("\n🎉 You can now run MediaHub.exe as a standalone application!")
        return True
    except Exception as e:
        print(f"\n❌ Build failed: {e}")
        return False

if __name__ == '__main__':
    build()

