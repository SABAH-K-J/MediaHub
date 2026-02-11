from typing import Optional, List
from sqlmodel import Field, Session, SQLModel, create_engine, select

class MediaItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    media_type: str  # 'movie', 'series', 'anime'
    poster_url: Optional[str] = None
    path: str
    is_favorite: bool = False
    description: Optional[str] = None
    rating: Optional[float] = None
    year: Optional[int] = None
    genre: Optional[str] = None

class MediaFile(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    media_item_id: int = Field(foreign_key="mediaitem.id")
    file_path: str
    season_num: int | None = None
    episode_num: int | None = None
    watched: bool = Field(default=False)
    watch_date: str | None = None  # ISO format datetime string
    watch_progress: float = Field(default=0.0)  # 0.0 to 1.0

sqlite_file_name = "library.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

engine = create_engine(sqlite_url)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
