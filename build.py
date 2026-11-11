"""PyInstaller executable builder for CameoDist."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent


def build_exe() -> None:
    print("Building CameoDist standalone executable...")

    frontend_dist = ROOT_DIR / "frontend" / "dist"
    if not frontend_dist.is_dir():
        print("Error: frontend/dist not found! Build the frontend first:", file=sys.stderr)
        print("  cd frontend && npm run build", file=sys.stderr)
        sys.exit(1)

    for folder in ("dist", "build"):
        target = ROOT_DIR / folder
        if target.exists():
            print(f"Cleaning {folder}/...")
            shutil.rmtree(target)

    add_data_arg = f"{frontend_dist}{os.pathsep}frontend/dist"

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "backend/main.py",
        "--name=CameoDist",
        "--onefile",
        "--windowed",
        f"--add-data={add_data_arg}",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=dotenv",
        "--hidden-import=mpv_jsonipc",
        "--hidden-import=pythonnet",
        "--collect-all=fastapi",
        "--collect-all=sqlmodel",
        "--collect-all=pydantic",
        "--collect-all=webview",
        "--collect-all=clr_loader",
    ]

    icon_path = ROOT_DIR / "icon.ico"
    if icon_path.is_file():
        cmd.append(f"--icon={icon_path}")

    subprocess.run(cmd, cwd=str(ROOT_DIR), check=True)
    exe_name = "CameoDist.exe" if os.name == "nt" else "CameoDist"
    print(f"Build complete! Binary location: {ROOT_DIR / 'dist' / exe_name}")


if __name__ == "__main__":
    build_exe()
