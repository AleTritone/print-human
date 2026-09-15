import streamlit as st

from src.config import ABOUT_PATH
from src.markdown_renderer import render_markdown
from src.utils import read_text_any


def render_about():
    if ABOUT_PATH.exists():
        render_markdown(
            read_text_any(ABOUT_PATH)
        )
    else:
        st.warning(
            "Pagina about non trovata."
        )