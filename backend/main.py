import uvicorn
import webview
import threading
import sys
import os

# Add backend directory to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from api import app

def start_server():
    """Start FastAPI server with minimal logging"""
    uvicorn.run(
        app, 
        host="127.0.0.1", 
        port=8000,
        log_level="error",  # Minimize console output
        access_log=False    # Disable access logs
    )

if __name__ == "__main__":
    # Start Backend in a separate thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Wait a moment for server to start
    import time
    time.sleep(1)
    
    # Always use localhost - FastAPI will serve the frontend
    url = "http://localhost:8000"
    
    # Create Window with production settings
    window = webview.create_window(
        "MediaHub",
        url,
        width=1400,
        height=900,
        resizable=True,
        fullscreen=False,
        min_size=(1024, 768),
        background_color='#0a0a0a',
        text_select=False
    )
    
    # Start webview WITHOUT debug mode (hides devtools)
    webview.start(debug=False)


