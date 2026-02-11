import os
import subprocess
import tempfile
import shutil
from typing import List
from sqlmodel import select, Session
from database import MediaFile, get_session, engine

def get_potplayer_path():
    """Tries to find PotPlayer executable."""
    potential_paths = [
        r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe",
        r"C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini.exe",
        r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\DAUM\PotPlayer\PotPlayerMini64.exe")
    ]
    
    # Check if in PATH
    if shutil.which("PotPlayerMini64.exe"):
        return "PotPlayerMini64.exe"
    if shutil.which("PotPlayerMini.exe"):
        return "PotPlayerMini.exe"
        
    for path in potential_paths:
        if os.path.exists(path):
            return path
            
    return None

def generate_playlist(files: List[str]) -> str:
    """Creates a temporary .m3u playlist file and returns its path."""
    fd, path = tempfile.mkstemp(suffix=".m3u")
    
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write("#EXTM3U\n")
        for file_path in files:
            f.write(f"{file_path}\n")
            
    return path

def play_media_file(file_id: int):
    with Session(engine) as session:
        media_file = session.get(MediaFile, file_id)
        if not media_file:
            print(f"File with ID {file_id} not found.")
            return

        playlist_files = []

        if media_file.media_item_id and media_file.season_num is not None:
            statement = select(MediaFile).where(
                MediaFile.media_item_id == media_file.media_item_id,
                MediaFile.season_num == media_file.season_num,
                MediaFile.episode_num >= media_file.episode_num
            ).order_by(MediaFile.episode_num)
            
            subsequent_episodes = session.exec(statement).all()
            playlist_files = [ep.file_path for ep in subsequent_episodes]
        else:
            playlist_files = [media_file.file_path]

        if not playlist_files:
            return

        playlist_path = generate_playlist(playlist_files)
        print(f"Generated playlist at: {playlist_path}")

        # Try PotPlayer first, then VLC
        potplayer = get_potplayer_path()
        if potplayer:
            print(f"Launching PotPlayer: {potplayer}")
            subprocess.Popen([potplayer, playlist_path])
            return

        # Fallback to VLC
        try:
            subprocess.Popen(['vlc', playlist_path])
        except FileNotFoundError:
            print("Neither PotPlayer nor VLC found. Please install one and add to PATH.")
