import markdown
import streamlit as st

from src.config import ASSETS_DIR
from src.theme import theme_accent, theme_portrait_filter
from src.utils import read_text_any


def load_styles(theme="green") -> None:
    replacements = {
        "__THEME_ACCENT__": theme_accent(theme),
        "__PORTRAIT_FILTER__": theme_portrait_filter(theme),
    }

    files = (
        ASSETS_DIR / "tokens.css",
        ASSETS_DIR / "styles.css",
    )

    for path in files:
        if not path.exists():
            continue

        css = read_text_any(path)
        for token, value in replacements.items():
            css = css.replace(token, value)

        st.html(f"<style>{css}</style>")


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
    st.html(markdown_to_html(text))
