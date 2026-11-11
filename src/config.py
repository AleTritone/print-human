from pathlib import Path
from zoneinfo import ZoneInfo


BASE = Path(__file__).resolve().parent.parent
POSTS_DIR = BASE / "posts"
ASSETS_DIR = BASE / "assets"
CONTENT_DIR = BASE / "content"
LOCALES_DIR = BASE / "locales"
STATIC_DIR = BASE / "static"
SOCIAL_DIR = STATIC_DIR / "social"

SITE_NAME = 'print("human")'
AUTHOR_NAME = "Alessandro M."

SITE_URL = "https://print-human.streamlit.app"
SHARE_SITE_URL = "https://aletritone.github.io/print-human"

ROME = ZoneInfo("Europe/Rome")