"""One-step build script: builds frontend bundle then packages CameoDist executable."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"


def main() -> None:
    npm_bin = shutil.which("npm.cmd" if os.name == "nt" else "npm") or shutil.which("npm")
    if not npm_bin:
        print("Error: npm not found on PATH.", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("CameoDist Quick Build")
    print("=" * 60)

    print("\n[1/2] Building React frontend...")
    subprocess.run([npm_bin, "run", "build"], cwd=str(FRONTEND_DIR), check=True)

    print("\n[2/2] Packaging standalone executable...")
    subprocess.run([sys.executable, "build.py"], cwd=str(ROOT_DIR), check=True)


if __name__ == "__main__":
    main()
