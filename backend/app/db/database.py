import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from urllib.parse import quote, unquote
load_dotenv()

def _normalize_database_url(url: str) -> str:
    """Encode raw reserved characters in a PostgreSQL password from .env."""
    if "://" not in url or "@" not in url:
        return url

    scheme, remainder = url.split("://", 1)
    user_info, host = remainder.rsplit("@", 1)
    if ":" not in user_info:
        return url

    username, password = user_info.split(":", 1)
    return f"{scheme}://{username}:{quote(unquote(password), safe='')}@{host}"


DATABASE_URL = _normalize_database_url(os.getenv(
    "DATABASE_URL", 
    "postgresql+psycopg2://postgres:postgres@localhost:5432/postgres"
))

engine = create_engine(
    DATABASE_URL
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
