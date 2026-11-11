import os

import streamlit as st

from src.about import render_about
from src.components import render_home, render_page_chrome, render_post, render_sidebar
from src.config import SITE_NAME
from src.i18n import normalize_language, ui
from src.markdown_renderer import load_styles
from src.posts import find_post_by_slug, get_all_tags, load_posts
from src.semantic_map_page import render_semantic_map
from src.social_cards import ensure_social_cards
from src.theme import normalize_theme
from src.utils import get_query_param


st.set_page_config(
    page_title=SITE_NAME,
    page_icon="🐍",
    layout="centered"
)

preview_mode = (
    os.getenv("PRINT_HUMAN_PREVIEW", "")
    .strip()
    .lower()
    in {"1", "true", "yes", "on"}
)

page = get_query_param("page")
slug = get_query_param("p")
language = normalize_language(get_query_param("lang"))
theme = normalize_theme(get_query_param("theme"))

load_styles(theme=theme)

posts = load_posts(
    include_future=preview_mode,
    language=language
)

if page not in {"about", "semantic-map"}:
    social_posts = (
        posts
        if language == "it"
        else load_posts(
            include_future=preview_mode,
            language="it"
        )
    )
    ensure_social_cards(social_posts)

all_tags = get_all_tags(posts)

hide_sidebar_filters = page == "semantic-map"

search, selected_tag = render_sidebar(
    all_tags,
    show_filters=not hide_sidebar_filters,
    language=language,
    theme=theme,
)

if preview_mode:
    st.caption(ui(language, "preview_mode"))

if page == "about":
    render_page_chrome(language=language, theme=theme, back_label=ui(language, "back_home"))
    render_about(language=language, theme=theme)

elif page == "semantic-map":
    render_page_chrome(language=language, theme=theme, back_label=ui(language, "back_home"))
    render_semantic_map(language=language, theme=theme)

elif slug:
    post = find_post_by_slug(
        posts,
        slug
    )

    if post:
        render_page_chrome(language=language, theme=theme, back_label=ui(language, "back_home"))
        render_post(
            post,
            posts,
            language=language,
            theme=theme
        )

    else:
        render_page_chrome(language=language, theme=theme, back_label=ui(language, "back_home"))
        st.warning(
            ui(language, "post_not_found")
        )

else:
    render_page_chrome(language=language, theme=theme)
    render_home(
        posts,
        search,
        selected_tag,
        language=language,
        theme=theme,
    )
