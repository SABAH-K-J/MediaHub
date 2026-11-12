"""Desktop (PyWebView) and standalone server entrypoint for CameoDist."""

from __future__ import annotations

import argparse
import faulthandler
import logging
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from typing import Any

import uvicorn

# Ensure project root is on sys.path whether executed as
# `python backend/main.py` or `-m backend.main`
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.api import app  # noqa: E402
from backend.config import get_default_data_dir, get_settings  # noqa: E402

_active_window: Any = None
_log_stream: Any = None


def _configure_desktop_logging() -> None:
    """Ensure windowed PyInstaller binaries have writable streams, logging, and crash hooks."""
    global _log_stream
    data_dir = get_default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    log_path = data_dir / "cameodist.log"

    if sys.stdout is None or sys.stderr is None:
        _log_stream = open(log_path, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
        if sys.stdout is None:
            sys.stdout = _log_stream  # type: ignore[assignment]
        if sys.stderr is None:
            sys.stderr = _log_stream  # type: ignore[assignment]
        try:
            faulthandler.enable(file=_log_stream, all_threads=True)
        except Exception:  # noqa: S110
            pass

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            handlers=[logging.StreamHandler(_log_stream)],
            force=True,
        )

        def _log_unhandled(
            exc_type: type[BaseException],
            exc_val: BaseException,
            exc_tb: Any,
        ) -> None:
            logging.critical("Unhandled exception", exc_info=(exc_type, exc_val, exc_tb))

        sys.excepthook = _log_unhandled


def _pick_available_port(host: str, preferred_port: int) -> int:
    """Return preferred_port if bindable, otherwise an available ephemeral port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, preferred_port))
            return preferred_port
        except OSError:
            pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _wait_for_server(url: str, timeout_sec: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as resp:  # noqa: S310
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.2)
    return False


class DesktopBridge:
    """JavaScript-to-Python bridge exposed to PyWebView as window.pywebview.api.

    Keep zero instance attributes referencing Window/WinForms objects so PyWebView's
    JS serializer never recurses into .NET AccessibilityObject properties.
    """

    def pick_folder(self) -> str | None:
        """Open a native OS directory picker dialog and return the chosen path."""
        win = _active_window
        if win is None:
            return None

        import webview  # type: ignore[import-untyped]

        dialog_type = (
            webview.FileDialog.FOLDER
            if hasattr(webview, "FileDialog")
            else webview.FOLDER_DIALOG
        )

        result_holder: list[Any] = [None]

        def _invoke_dialog() -> Any:
            result_holder[0] = win.create_file_dialog(dialog_type)
            return None

        if os.name == "nt":
            try:
                import webview.platforms.winforms as wf  # type: ignore[import-untyped]
                from System import Func, Type  # type: ignore[import-untyped]

                native_view = wf.BrowserView.instances.get(win.uid)
                if native_view is not None and native_view.InvokeRequired:
                    native_view.Invoke(Func[Type](_invoke_dialog))
                else:
                    _invoke_dialog()
            except Exception:
                logging.exception("Folder dialog failed on WinForms UI thread")
                return None
        else:
            _invoke_dialog()

        chosen = result_holder[0]
        if chosen and len(chosen) > 0:
            return str(chosen[0])
        return None


def start_server(host: str, port: int, log_level: str) -> None:
    """Start the FastAPI Uvicorn server."""
    is_tty = bool(sys.stdout is not None and hasattr(sys.stdout, "isatty") and sys.stdout.isatty())
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=log_level.lower(),
        access_log=False,
        log_config=uvicorn.config.LOGGING_CONFIG if is_tty else None,
    )


def main() -> None:
    global _active_window
    _configure_desktop_logging()

    parser = argparse.ArgumentParser(description="CameoDist runtime launcher")
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

    port = _pick_available_port(settings.host, settings.port)
    server_thread = threading.Thread(
        target=start_server,
        args=(settings.host, port, settings.log_level),
        daemon=True,
    )
    server_thread.start()

    health_url = f"http://{settings.host}:{port}/api/health"
    if not _wait_for_server(health_url, timeout_sec=15.0):
        raise RuntimeError(f"CameoDist backend failed to become ready at {health_url}")

    import webview  # type: ignore[import-untyped]

    webview_cache = get_default_data_dir() / "webview_cache"
    webview_cache.mkdir(parents=True, exist_ok=True)

    bridge = DesktopBridge()
    app_url = f"http://{settings.host}:{port}"
    _active_window = webview.create_window(
        "CameoDist",
        app_url,
        width=1400,
        height=900,
        resizable=True,
        fullscreen=False,
        min_size=(1024, 768),
        background_color="#0c0d10",
        text_select=True,
        js_api=bridge,
    )
    webview.start(
        debug=False,
        private_mode=False,
        storage_path=str(webview_cache),
    )


if __name__ == "__main__":
    main()
