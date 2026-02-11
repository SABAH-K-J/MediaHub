import requests
import re
from imdb import Cinemagoer

ia = Cinemagoer()

def clean_title_for_search(title: str) -> str:
    # Remove release year (e.g. (2022) or 2022)
    title = re.sub(r'[\(\[\{]?\d{4}[\)\]\}]?', '', title)
    title = re.sub(r'(1080p|720p|480p|BluRay|WEB-DL|x264|x265|HEVC|AAC|Hindi|English|ESub).*', '', title, flags=re.IGNORECASE)
    title = title.replace('.', ' ').replace('_', ' ').strip()
    return title

from lxml import html

def get_metadata_from_wikipedia(title):
    """
    Searches Wikipedia for the title and returns:
    - imdb_id (str or None)
    - poster_url (str or None)
    """
    try:
        print(f"DEBUG: Wikipedia Searching: {title}")
        search_url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "opensearch",
            "search": title,
            "limit": 1,
            "namespace": 0,
            "format": "json"
        }
        headers = {
            "User-Agent": "MediaHub/1.0 (contact@example.com)"
        }
        r = requests.get(search_url, params=params, headers=headers, timeout=10)
        data = r.json()
        
        if not data[1]:
            print("DEBUG: No Wikipedia results found.")
            return None, None, None
            
        page_url = data[3][0]
        print(f"DEBUG: Found Wikipedia Page: {page_url}")
        
        # Fetch page content
        page_r = requests.get(page_url, headers=headers, timeout=10)
        content = page_r.text
        
        # 1. Look for IMDb ID
        imdb_id = None
        match = re.search(r'imdb\.com/title/tt(\d+)', content)
        if match:
             imdb_id = match.group(1)
             
        # 2. Look for Poster & Genre in Infobox
        poster_url = None
        genres = None
        try:
            tree = html.fromstring(content)
            
            # Poster
            img_src = tree.xpath('//table[contains(@class, "infobox")]//td[contains(@class, "infobox-image")]//img/@src')
            if not img_src:
                img_src = tree.xpath('//table[contains(@class, "infobox")]//img/@src')
            
            if img_src:
                url = img_src[0]
                if url.startswith('//'):
                    url = "https:" + url
                poster_url = url
                print(f"DEBUG: Found Wikipedia Poster: {poster_url}")
                
            # Genre
            # Ideally look for th with "Genre" and get next td
            genre_td = tree.xpath('//table[contains(@class, "infobox")]//th[contains(text(), "Genre")]/../td')
            if genre_td:
                genres = genre_td[0].text_content().strip()
                # Clean up footnotes [1][2] etc
                genres = re.sub(r'\[\d+\]', '', genres)
                print(f"DEBUG: Found Wikipedia Genres: {genres}")
                
        except Exception as e:
            print(f"DEBUG: Wiki extract error: {e}")
            
        return imdb_id, poster_url, genres
            
    except Exception as e:
        print(f"Wikipedia Search error: {e}")
        
    return None, None, None

def fetch_metadata(title: str, media_type: str = None):
    try:
        clean_title = clean_title_for_search(title)
        print(f"DEBUG: Metadata lookup for: {clean_title} ({media_type})")
        
        imdb_id, wiki_poster, wiki_genres = get_metadata_from_wikipedia(clean_title)
        
        movie = None
        if imdb_id:
            print(f"DEBUG: Found IMDb ID: {imdb_id}")
            try:
                movie = ia.get_movie(imdb_id)
            except Exception as e:
                print(f"Error fetching movie by ID: {e}")
        
        # Fallback to direct search (which we know fails generally but keep as backup)
        if not movie:
             pass 

        if not movie and not wiki_poster and not wiki_genres:
            print("DEBUG: No metadata found.")
            return None

        # Extract data
        
        description = None
        rating = None
        year = None
        genres = None
        imdb_poster = None
        
        if movie:
             description = movie.get('plot outline') or (movie.get('plot')[0] if movie.get('plot') else None)
             rating = movie.get('rating')
             year = movie.get('year')
             genres = ", ".join(movie.get('genres', [])) if movie.get('genres') else None
             imdb_poster = movie.get('full-size cover url')
             real_title = movie.get('title')
        else:
             real_title = clean_title

        # Use Wiki content if IMDb is missing
        final_poster = imdb_poster if imdb_poster else wiki_poster
        final_genres = genres if genres else wiki_genres

        metadata = {
            "title": real_title,
            "year": year,
            "rating": rating,
            "description": description,
            "poster_url": final_poster,
            "genres": final_genres
        }
        return metadata

    except Exception as e:
        print(f"Error fetching metadata for {title}: {e}")
        import traceback
        traceback.print_exc()
        return None
