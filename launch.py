# MediaHub Launcher
# This script starts both the backend and frontend servers

import subprocess
import sys
import time
import os

# Windows-specific constant for hiding console
if sys.platform == "win32":
    CREATE_NO_WINDOW = 0x08000000
else:
    CREATE_NO_WINDOW = 0

def main():
    print("🎬 Starting MediaHub...")
    
    # Start backend (FastAPI + PyWebView)
    backend_process = subprocess.Popen(
        [sys.executable, "backend/main.py"],
        cwd=os.getcwd(),
        creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    # Give backend time to start
    time.sleep(2)
    
    # Start frontend dev server
    frontend_process = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd="frontend",
        shell=True,
        creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    print("✅ MediaHub is running!")
    print("   The app window will open shortly...")
    print("\nPress Ctrl+C to stop...")
    
    try:
        # Wait for processes
        backend_process.wait()
        frontend_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Stopping MediaHub...")
        backend_process.terminate()
        frontend_process.terminate()
        print("✅ MediaHub stopped.")

if __name__ == '__main__':
    main()
