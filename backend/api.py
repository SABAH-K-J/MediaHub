from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List
import shutil
import subprocess
import hashlib
from pathlib import Path
from database import get_session, MediaItem, MediaFile, create_db_and_tables, engine
from scanner import scan_library
from player import play_media_file
from metadata import fetch_metadata
import os
import sys
import threading


app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static frontend files for production
def get_static_path():
    """Get the path to static files (frontend/dist)"""
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        base_path = sys._MEIPASS
    else:
        # Running in development
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    static_path = os.path.join(base_path, 'frontend', 'dist')
    return static_path if os.path.exists(static_path) else None

# Mount static files if they exist
static_path = get_static_path()
if static_path:
    app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")
    
    # Serve index.html for the root path
    
    @app.get("/")
    async def serve_frontend():
        return FileResponse(os.path.join(static_path, "index.html"))


# Ensure thumbnails directory exists
THUMBNAILS_DIR = Path("backend/thumbnails")
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# Mount thumbnails as static files
app.mount("/thumbnails", StaticFiles(directory=THUMBNAILS_DIR), name="thumbnails")

def generate_thumbnail(video_path: str, output_path: Path):
    """Generates a thumbnail using ffmpeg."""
    if output_path.exists():
        return

    try:
        # Seek to 10% of the video or 30 seconds to capture a frame
        cmd = [
            'ffmpeg', '-y', '-ss', '00:00:30', 
            '-i', video_path, 
            '-vframes', '1', 
            '-q:v', '2', 
            '-vf', 'scale=300:-1', # Scale width to 300px, keep aspect ratio
            str(output_path)
        ]
        # Run silently
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

def process_metadata_and_thumbnails(items: List[dict]):
    """Background task to generate thumbnails and fetch metadata."""
    # Create a new session for background task
    with Session(engine) as bg_session:
        for item in items:
            # 1. Thumbnails
            video_path = None
            if item['type'] == 'movie':
                video_path = item.get('file_path')
            elif item['type'] == 'series' and item.get('episodes'):
                video_path = item['episodes'][0].file_path
            elif item['type'] == 'anime' and item.get('episodes'):
                video_path = item['episodes'][0].file_path
            elif item['type'] == 'anime':
                video_path = item.get('file_path')
            
            if video_path:
                path_hash = hashlib.md5(item['path'].encode('utf-8')).hexdigest()
                output_path = THUMBNAILS_DIR / f"{path_hash}.jpg"
                generate_thumbnail(video_path, output_path)
            
            # 2. Metadata (IMDb)
            # Find the item in DB to update
            db_item = bg_session.exec(select(MediaItem).where(MediaItem.path == item['path'])).first()
            if db_item:
                # Fetch if description is missing
                # Also, if we have a poster_url from metadata, use it?
                # The user wants "thumbnails and info".
                # Maybe we use the IMDb poster as `poster_url` and use the generated thumbnail as fallback in frontend?
                # Or store local thumbnail path in a separate field? 
                # For now, let's keep `poster_url` for Remote Poster. 
                # Local thumbnails are accessed via hash.
                
                if not db_item.description: 
                    meta = fetch_metadata(db_item.title, db_item.media_type)
                    if meta:
                        db_item.description = meta.get('description')
                        db_item.rating = meta.get('rating')
                        db_item.year = meta.get('year')
                        db_item.genre = meta.get('genres')
                        if meta.get('poster_url'):
                            db_item.poster_url = meta.get('poster_url')
                        
                        bg_session.add(db_item)
                        bg_session.commit()

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

@app.get("/api/media", response_model=List[MediaItem])
def read_media_items(skip: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    media_items = session.exec(select(MediaItem).offset(skip).limit(limit)).all()
    
    base_url = "http://localhost:8000/thumbnails"
    for item in media_items:
        if not item.poster_url:
             path_hash = hashlib.md5(item.path.encode('utf-8')).hexdigest()
             thumb_path = THUMBNAILS_DIR / f"{path_hash}.jpg"
             if thumb_path.exists():
                 item.poster_url = f"{base_url}/{path_hash}.jpg"
                 
    return media_items

@app.get("/api/media/{media_id}", response_model=MediaItem)
def read_media_item(media_id: int, session: Session = Depends(get_session)):
    media_item = session.get(MediaItem, media_id)
    if not media_item:
        raise HTTPException(status_code=404, detail="MediaItem not found")
        
    path_hash = hashlib.md5(media_item.path.encode('utf-8')).hexdigest()
    thumb_path = THUMBNAILS_DIR / f"{path_hash}.jpg"
    if thumb_path.exists():
         media_item.poster_url = f"http://localhost:8000/thumbnails/{path_hash}.jpg"
         
    return media_item

@app.get("/api/media/{media_id}/episodes", response_model=List[MediaFile])
def read_media_episodes(media_id: int, session: Session = Depends(get_session)):
    episodes = session.exec(select(MediaFile).where(MediaFile.media_item_id == media_id).order_by(MediaFile.season_num, MediaFile.episode_num)).all()
    return episodes

@app.post("/api/scan")
def trigger_scan(root_dir: str, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    if not os.path.exists(root_dir):
        raise HTTPException(status_code=400, detail="Directory not found")

    scanned_items = scan_library(root_dir)
    
    count = 0
    updated_count = 0
    
    for item_data in scanned_items:
        existing = session.exec(select(MediaItem).where(MediaItem.path == item_data['path'])).first()
        
        if existing:
            # Update existing item if type changed (e.g. movie -> anime)
            if existing.media_type != item_data['type']:
                existing.media_type = item_data['type']
                existing.title = item_data['title'] # Update title too if cleaner logic changed
                session.add(existing)
                updated_count += 1
        else:
            # Create MediaItem
            media_item = MediaItem(
                title=item_data['title'],
                media_type=item_data['type'],
                path=item_data['path']
            )
            session.add(media_item)
            session.commit()
            session.refresh(media_item)
            
            if 'episodes' in item_data:
                for ep in item_data['episodes']:
                    ep.media_item_id = media_item.id
                    session.add(ep)
            elif 'file_path' in item_data:
                media_file = MediaFile(
                    media_item_id=media_item.id,
                    file_path=item_data['file_path']
                )
                session.add(media_file)
            
            count += 1
            
    session.commit()
    
    # Trigger background processing
    background_tasks.add_task(process_metadata_and_thumbnails, scanned_items)
    
    return {"status": "scan complete", "new_items": count, "updated_items": updated_count}

@app.post("/api/play/{file_id}")
def play_media(file_id: int, session: Session = Depends(get_session)):
    # Mark as watched when playing
    media_file = session.get(MediaFile, file_id)
    if media_file:
        from datetime import datetime
        media_file.watched = True
        media_file.watch_date = datetime.now().isoformat()
        media_file.watch_progress = 1.0  # Assume complete on play
        session.add(media_file)
        session.commit()
    
    play_media_file(file_id)
    return {"status": "playback started"}

@app.post("/api/media/file/{file_id}/watch")
def mark_as_watched(file_id: int, session: Session = Depends(get_session)):
    """Mark a file as watched"""
    media_file = session.get(MediaFile, file_id)
    if not media_file:
        raise HTTPException(status_code=404, detail="MediaFile not found")
    
    from datetime import datetime
    media_file.watched = True
    media_file.watch_date = datetime.now().isoformat()
    media_file.watch_progress = 1.0
    session.add(media_file)
    session.commit()
    return {"status": "marked as watched"}

@app.post("/api/media/file/{file_id}/unwatch")
def mark_as_unwatched(file_id: int, session: Session = Depends(get_session)):
    """Mark a file as unwatched"""
    media_file = session.get(MediaFile, file_id)
    if not media_file:
        raise HTTPException(status_code=404, detail="MediaFile not found")
    
    media_file.watched = False
    media_file.watch_date = None
    media_file.watch_progress = 0.0
    session.add(media_file)
    session.commit()
    return {"status": "marked as unwatched"}
