"""Desktop (PyWebView) and standalone server entrypoint for MediaHub."""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import urllib.error
import urllib.request

import uvicorn

# Ensure project root is on sys.path whether executed as `python backend/main.py` or `-m backend.main`
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.api import app  # noqa: E402
from backend.config import get_settings  # noqa: E402


def _wait_for_server(url: str, timeout_sec: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.2)
    return False


def start_server(host: str, port: int, log_level: str) -> None:
    """Start the FastAPI Uvicorn server."""
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=log_level.lower(),
        access_log=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="MediaHub runtime launcher")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run FastAPI server only without opening a PyWebView window",
    )
    args = parser.parse_args()

    settings = get_settings()
    if args.headless:
        start_server(settings.host, settings.port, settings.log_level)
        return

    server_thread = threading.Thread(
        target=start_server,
        args=(settings.host, settings.port, settings.log_level),
        daemon=True,
    )
    server_thread.start()

    health_url = f"http://{settings.host}:{settings.port}/api/health"
    if not _wait_for_server(health_url, timeout_sec=15.0):
        raise RuntimeError(f"MediaHub backend failed to become ready at {health_url}")

    import webview  # type: ignore[import-untyped]

    app_url = f"http://{settings.host}:{settings.port}"
    webview.create_window(
        "MediaHub",
        app_url,
        width=1400,
        height=900,
        resizable=True,
        fullscreen=False,
        min_size=(1024, 768),
        background_color="#0c0d10",
        text_select=False,
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()
