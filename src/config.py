from pathlib import Path
from zoneinfo import ZoneInfo


BASE = Path(__file__).resolve().parent.parent
POSTS_DIR = BASE / "posts"
ASSETS_DIR = BASE / "assets"
STATIC_DIR = BASE / "static"
SOCIAL_DIR = STATIC_DIR / "social"
ABOUT_PATH = BASE / "about.md"

SITE_NAME = 'print("human")'
SITE_TAGLINE = "Ogni riga un esperimento di umanità."
AUTHOR_NAME = "Alessandro M."

SITE_URL = "https://print-human.streamlit.app"
SHARE_SITE_URL = "https://aletritone.github.io/print-human"

ROME = ZoneInfo("Europe/Rome")