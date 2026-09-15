import markdown
import streamlit as st

from src.config import ASSETS_DIR
from src.utils import read_text_any


def load_styles() -> None:
    files = (
        ASSETS_DIR / "tokens.css",
        ASSETS_DIR / "styles.css",
    )

    for path in files:
        if path.exists():
            st.html(
                f"<style>{read_text_any(path)}</style>"
            )


def markdown_to_html(text: str) -> str:
    return markdown.markdown(
        text,
        extensions=[
            "fenced_code",
            "codehilite",
            "tables",
            "sane_lists"
        ],
        extension_configs={
            "codehilite": {
                "guess_lang": False,
                "css_class": "highlight",
                "noclasses": False,
                "linenums": False
            }
        }
    )


def render_markdown(text: str) -> None:
    st.html(
        markdown_to_html(text)
    )