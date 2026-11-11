"""Development launcher starting the FastAPI backend and Vite dev server cleanly."""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"


def _wait_for_http(url: str, timeout_sec: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as resp:
                if resp.status < 500:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.25)
    return False


def _terminate_process_tree(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except OSError:
            proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def main() -> None:
    host = os.environ.get("MEDIAHUB_HOST", "127.0.0.1")
    port = os.environ.get("MEDIAHUB_PORT", "8000")

    npm_bin = shutil.which("npm.cmd" if os.name == "nt" else "npm") or shutil.which("npm")
    if not npm_bin:
        print("Error: npm not found on PATH.", file=sys.stderr)
        sys.exit(1)

    popen_kwargs: dict[str, object] = {}
    if os.name == "nt":
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["start_new_session"] = True

    backend_proc: subprocess.Popen[bytes] | None = None
    frontend_proc: subprocess.Popen[bytes] | None = None

    try:
        print("Starting CameoDist backend...")
        backend_proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "backend.api:app",
                "--host",
                host,
                "--port",
                port,
                "--reload",
                "--reload-dir",
                "backend",
            ],
            cwd=str(ROOT_DIR),
            **popen_kwargs,  # type: ignore[arg-type]
        )

        health_url = f"http://{host}:{port}/api/health"
        if not _wait_for_http(health_url, timeout_sec=15.0):
            print("Warning: backend health endpoint did not respond within 15s.", file=sys.stderr)
        if backend_proc.poll() is not None:
            print(
                f"Error: backend exited early (code {backend_proc.returncode}). "
                f"Ensure port {port} is not already in use by an older server.",
                file=sys.stderr,
            )
            sys.exit(1)

        print("Starting CameoDist Vite frontend...")
        frontend_proc = subprocess.Popen(
            [npm_bin, "run", "dev"],
            cwd=str(FRONTEND_DIR),
            **popen_kwargs,  # type: ignore[arg-type]
        )

        print(f"CameoDist dev servers running:\n  Frontend: http://localhost:5173\n  Backend:  http://{host}:{port}")
        print("Press Ctrl+C to stop both servers.")

        while True:
            if backend_proc.poll() is not None:
                print(f"Backend exited with code {backend_proc.returncode}", file=sys.stderr)
                break
            if frontend_proc.poll() is not None:
                print(f"Frontend exited with code {frontend_proc.returncode}", file=sys.stderr)
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nShutting down CameoDist dev servers...")
    finally:
        _terminate_process_tree(frontend_proc)
        _terminate_process_tree(backend_proc)


if __name__ == "__main__":
    main()
