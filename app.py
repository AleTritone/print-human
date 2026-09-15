import os

import streamlit as st

from src.about import render_about
from src.components import render_home, render_post, render_sidebar
from src.config import SITE_NAME
from src.markdown_renderer import load_styles
from src.posts import find_post_by_slug, get_all_tags, load_posts
from src.social_cards import ensure_social_cards
from src.utils import get_query_param


st.set_page_config(
    page_title=SITE_NAME,
    page_icon="🐍",
    layout="centered"
)

load_styles()

preview_mode = (
    os.getenv("PRINT_HUMAN_PREVIEW", "")
    .strip()
    .lower()
    in {"1", "true", "yes", "on"}
)

posts = load_posts(
    include_future=preview_mode
)

ensure_social_cards(posts)

tags = get_all_tags(posts)

search, selected_tag = render_sidebar(tags)

slug = get_query_param("p")
page = get_query_param("page")

if preview_mode:
    st.caption("PREVIEW MODE — sono visibili anche i post futuri")

if page == "about":
    if st.button("← Torna alla home"):
        st.query_params.clear()
        st.rerun()

    render_about()

elif slug:
    post = find_post_by_slug(
        posts,
        slug
    )

    if post:
        if st.button("← Torna alla lista"):
            st.query_params.clear()
            st.rerun()

        render_post(
            post,
            posts
        )

    else:
        st.warning(
            "Post non trovato."
        )

        if st.button("← Torna alla home"):
            st.query_params.clear()
            st.rerun()

else:
    render_home(
        posts,
        search,
        selected_tag
    )