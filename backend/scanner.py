import os
import re
from pathlib import Path
from typing import List, Optional, Dict
from database import MediaItem, MediaFile

# Supported video extensions
VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.mov', '.wmv'}

def is_video_file(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS

def clean_title(name: str) -> str:
    """Removes dots and underscores, returns title case"""
    # Remove resolution and common release group tags
    name = re.sub(r'[\(\[\{]?\d{4}[\)\]\}]?', '', name) # Year
    name = re.sub(r'(1080p|720p|480p|BluRay|WEB-DL|x264|x265|HEVC|AAC|Hindi|English|ESub).*', '', name, flags=re.IGNORECASE)
    return name.replace('.', ' ').replace('_', ' ').strip()

def parse_episode_info(filename: str) -> Optional[tuple[int, int]]:
    # Pattern: S01E01, s1e1
    match = re.search(r'[sS](\d+)\s*[eE](\d+)', filename)
    if match:
        return int(match.group(1)), int(match.group(2))
    
    # Pattern: 1x01
    match = re.search(r'(\d+)x(\d+)', filename)
    if match:
        return int(match.group(1)), int(match.group(2))

    # Pattern: Ep01, E01
    match = re.search(r'(?:[eE]p?|[eE])(\d+)', filename)
    if match:
        return None, int(match.group(1))
        
    return None

def scan_library(root_dir: str) -> List[dict]:
    root = Path(root_dir)
    if not root.exists():
        print(f"Directory not found: {root_dir}")
        return []

    series_map: Dict[str, dict] = {}
    movies: List[dict] = []

    for path in root.rglob('*'):
        if path.is_file() and is_video_file(path):
            filename = path.name
            parent = path.parent
            grandparent = parent.parent
            root_check = str(path)
            
            # Determine Type based on folder structure first
            is_anime = "anime" in root_check.lower()
            is_series_folder = "tv shows" in root_check.lower() or "series" in root_check.lower()
            is_movie_folder = "movie" in root_check.lower()

            # 1. Check file name for Episode Pattern
            season_num, episode_num = parse_episode_info(filename) or (None, None)
            
            is_series_file = False
            series_name = None
            derived_season = 1

            parent_name = parent.name.lower()
            
            # Logic:
            # If explicit episode pattern found -> It's a series/anime
            # If inside "Anime" folder -> It's Anime
            # If inside "Movies" folder -> It's Movie
            
            if season_num is not None or episode_num is not None:
                is_series_file = True
            
            # Refine series name
            if is_series_file:
                if re.match(r'^(s|season)\s*\d+$', parent_name):
                     # Parent is Season folder
                     series_name = clean_title(grandparent.name)
                     s_match = re.search(r'\d+', parent_name)
                     if s_match:
                         derived_season = int(s_match.group(0))
                else:
                    # Parent is likely Series Name
                    series_name = clean_title(parent_name)
                    if season_num:
                        derived_season = season_num

            # Final Classification
            if is_anime:
                media_type = "anime"
                # Even if no episode pattern, if in Anime folder, treat as anime series usually?
                # or anime movie? Hard to say. 
                # Improving robustness: If file has S01E01, it's anime series.
                # If just a file in Anime/MovieName/Movie.mkv -> Anime Movie?
                # Let's stick to: if episode pattern OR is_series_file -> Anime Series. Else Anime Movie?
                if is_series_file:
                     pass # handled below
                else:
                    # Treat as Anime Movie? or just generic Anime Item
                    # Let's try to detect if it's a series by having multiple files in folder?
                    # For now, simplistic:
                    if not is_series_file:
                         movies.append({
                            "type": "anime_movie", # Custom type or just 'movie' with genre 'anime'?
                            # User asked for 3 categories: Anime, Series, Movies.
                            # So type='anime' is good.
                            "type": "anime", 
                            "title": clean_title(path.stem),
                            "path": str(parent),
                            "file_path": str(path.absolute())
                        })
                         continue

            elif is_series_folder:
                 media_type = "series"
                 is_series_file = True # Force series if in TV Shows folder?
                 if not series_name and not re.match(r'^(s|season)\s*\d+$', parent_name):
                      series_name = clean_title(parent.name)

            elif is_movie_folder:
                 media_type = "movie"
                 is_series_file = False
            
            else:
                # Default Logic based on file pattern
                if is_series_file:
                    media_type = "series"
                else:
                    media_type = "movie"

            if is_series_file and series_name:
                # Override type if Anime
                if is_anime:
                    media_type = "anime"
                
                key = f"{media_type}_{series_name}"
                if key not in series_map:
                    series_map[key] = {
                        "type": media_type,
                        "title": series_name,
                        "path": str(grandparent) if re.match(r'^(s|season)\s*\d+$', parent_name) else str(parent),
                        "episodes": []
                    }
                
                final_season = season_num if season_num is not None else derived_season
                final_episode = episode_num if episode_num is not None else 0
                
                series_map[key]["episodes"].append(MediaFile(
                    season_num=final_season,
                    episode_num=final_episode,
                    file_path=str(path.absolute())
                ))
            elif media_type == "movie":
                 movies.append({
                    "type": "movie",
                    "title": clean_title(path.stem),
                    "path": str(path.parent),
                    "file_path": str(path.absolute())
                })

    return movies + list(series_map.values())
