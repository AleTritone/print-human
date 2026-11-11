import html
import json
import re
from base64 import b64encode
from urllib.parse import quote, urlencode

import streamlit as st
import streamlit.components.v1 as components

from src.config import (
    ASSETS_DIR,
    BASE,
    AUTHOR_NAME,
    SHARE_SITE_URL,
    SITE_NAME
)
from src.i18n import format_date_for_language, ui
from src.markdown_renderer import render_markdown
from src.theme import THEMES, normalize_theme, theme_accent
from src.posts import filter_posts


def build_href(language="it", **params):
    query = {}

    current_theme = normalize_theme(st.query_params.get("theme"))
    query["theme"] = current_theme

    for key, value in params.items():
        if value is None or value == "":
            continue
        query[key] = value

    query["lang"] = language
    return "?" + urlencode(query, doseq=True)


def tag_links(tags, language="it"):
    return " ".join(
        (
            f'<a class="tag" '
            f'href="{build_href(language, tag=tag)}" '
            f'target="_self">'
            f'{html.escape(tag)}'
            f'</a>'
        )
        for tag in tags
    )


def _current_query_with_language(language):
    query = {}

    for key in st.query_params:
        value = st.query_params.get(key)
        if isinstance(value, list):
            if value:
                query[key] = value[0]
        elif value is not None:
            query[key] = value

    query["lang"] = language
    return "?" + urlencode(query, doseq=True)



def _current_query_with_theme(theme):
    query = {}

    for key in st.query_params:
        value = st.query_params.get(key)
        if isinstance(value, list):
            if value:
                query[key] = value[0]
        elif value is not None:
            query[key] = value

    query["theme"] = normalize_theme(theme)
    if "lang" not in query:
        query["lang"] = "it"
    return "?" + urlencode(query, doseq=True)


def render_page_chrome(language="it", theme="green", back_label=None):
    """Render centered page navigation, language switch, and theme palette."""

    theme = normalize_theme(theme)
    back_html = (
        f'<a class="page-back-link" href="{build_href(language)}" target="_self">{html.escape(back_label)}</a>'
        if back_label
        else '<span class="page-back-spacer" aria-hidden="true"></span>'
    )

    en_href = _current_query_with_language("en")
    it_href = _current_query_with_language("it")

    theme_buttons = []
    for theme_key, theme_data in THEMES.items():
        theme_buttons.append(
            f'<a class="theme-dot {"is-active" if theme_key == theme else ""}" '
            f'href="{_current_query_with_theme(theme_key)}" target="_self" '
            f'aria-label="{html.escape(theme_data["label"])} theme" '
            f'title="{html.escape(theme_data["label"])}" '
            f'style="--dot-color:{theme_data["accent"]};"></a>'
        )

    st.html(
        (
            '<div class="page-chrome">'
            f'{back_html}'
            '<div class="page-preferences">'
            '<div class="theme-palette" aria-label="Theme color">'
            f'{"".join(theme_buttons)}'
            '</div>'
            '<div class="global-language-switch" aria-label="Site language preference">'
            f'<a class="global-language-button {"is-active" if language == "en" else ""}" href="{en_href}" target="_self">EN</a>'
            f'<a class="global-language-button {"is-active" if language == "it" else ""}" href="{it_href}" target="_self">IT</a>'
            '</div>'
            '</div>'
            '</div>'
        )
    )

def render_sidebar(tags, show_filters=True, language="it", theme="green"):
    st.sidebar.markdown(
        f'<div class="site-name">{html.escape(SITE_NAME)}</div>',
        unsafe_allow_html=True
    )

    nav_html = (
        '<div class="sidebar-nav">'
        f'<a class="sidebar-nav-item" href="{build_href(language, page="about")}" target="_self">'
        '<span class="sidebar-nav-link">__about__.py</span>'
        f'<span class="sidebar-nav-desc">{html.escape(ui(language, "sidebar_about_desc"))}</span>'
        '</a>'
        f'<a class="sidebar-nav-item" href="{build_href(language, page="semantic-map")}" target="_self">'
        '<span class="sidebar-nav-link">__semantic_map__.py</span>'
        f'<span class="sidebar-nav-desc">{html.escape(ui(language, "sidebar_map_desc"))}</span>'
        '</a>'
        '</div>'
    )

    image_path = ASSETS_DIR / "me.jpg"

    if image_path.exists():
        encoded = b64encode(image_path.read_bytes()).decode("ascii")
        mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"

        st.sidebar.markdown(
            (
                '<div class="author-profile">'
                f'<div class="author-image author-image-{normalize_theme(theme)}">'
                f'<img src="data:{mime};base64,{encoded}">'
                '</div>'
                '<div class="author-name">'
                f'<strong>{html.escape(AUTHOR_NAME)}</strong>'
                f'{nav_html}'
                '</div>'
                '</div>'
            ),
            unsafe_allow_html=True
        )
    else:
        st.sidebar.markdown(
            (
                '<div class="author-profile">'
                '<div class="author-name">'
                f'<strong>{html.escape(AUTHOR_NAME)}</strong>'
                f'{nav_html}'
                '</div>'
                '</div>'
            ),
            unsafe_allow_html=True
        )

    st.sidebar.markdown(
        (
            '<div class="site-tagline">'
            f'{html.escape(ui(language, "site_tagline"))}'
            '</div>'
        ),
        unsafe_allow_html=True
    )

    search = ""
    selected_tag = ui(language, "all_tags")

    if show_filters:
        search = st.sidebar.text_input(
            ui(language, "search"),
            placeholder=ui(language, "search_placeholder")
        )

        options = [ui(language, "all_tags")] + tags

        query_tag = st.query_params.get("tag")

        if isinstance(query_tag, list):
            query_tag = query_tag[0] if query_tag else None

        selected_index = 0
        if query_tag in tags:
            selected_index = options.index(query_tag)

        selected_tag = st.sidebar.selectbox(
            ui(language, "tags"),
            options,
            index=selected_index
        )

    st.sidebar.markdown("---")

    st.sidebar.markdown(
        (
            '<div class="sidebar-signature">'
            'life is a line<br>'
            '<span class="sidebar-signature-brand">'
            'print("human")'
            '</span>'
            '</div>'
        ),
        unsafe_allow_html=True
    )

    return search, selected_tag
def render_tags(tags, language="it"):
    if not tags:
        return

    st.html(
        (
            '<div class="post-tags">'
            f'{tag_links(tags, language=language)}'
            '</div>'
        )
    )


def render_translation(translation, language="it"):
    if not translation:
        return

    with st.expander(
        ui(language, "translation_expander"),
        expanded=False
    ):
        st.markdown(translation)


def render_reflection(reflection):
    if not reflection:
        return

    reflection_html = "<br>".join(
        html.escape(reflection).splitlines()
    )

    st.html(
        (
            '<div class="reflection">'
            '<div class="reflection-text">'
            f'{reflection_html}'
            '</div>'
            '<div class="reflection-signature">'
            'life is a line<br>'
            'print("human")'
            '</div>'
            '</div>'
        )
    )


def render_share_links(post, language="it", theme="green"):
    meta = post["meta"]

    slug = meta["slug"]
    title = meta["title"]

    share_url = (
        f"{SHARE_SITE_URL}/share/"
        f"{quote(slug)}/"
    )

    encoded_url = quote(
        share_url,
        safe=""
    )

    encoded_title = quote(
        title,
        safe=""
    )

    linkedin_url = (
        "https://www.linkedin.com/"
        "sharing/share-offsite/"
        f"?url={encoded_url}"
    )

    x_url = (
        "https://twitter.com/intent/tweet"
        f"?text={encoded_title}"
        f"&url={encoded_url}"
    )

    title_js = json.dumps(title)
    share_url_js = json.dumps(share_url)

    linkedin_html = html.escape(
        linkedin_url,
        quote=True
    )

    x_html = html.escape(
        x_url,
        quote=True
    )

    st.markdown(ui(language, "share"))

    accent = theme_accent(theme)

    components.html(
        f"""
        <div class="share-row">
            <a
                class="share-button"
                href="{linkedin_html}"
                target="_blank"
                rel="noopener noreferrer"
            >
                LinkedIn
            </a>

            <a
                class="share-button"
                href="{x_html}"
                target="_blank"
                rel="noopener noreferrer"
            >
                X
            </a>

            <button
                id="native-share"
                class="share-button"
                type="button"
            >
                {html.escape(ui(language, "share_link"))}
            </button>
        </div>

        <script>
        const button = document.getElementById("native-share");
        const title = {title_js};
        const url = {share_url_js};

        async function copyLink() {{
            try {{
                await navigator.clipboard.writeText(url);

                const originalText = button.textContent;
                button.textContent = {json.dumps(ui(language, "link_copied"))};

                setTimeout(() => {{
                    button.textContent = originalText;
                }}, 1600);
            }} catch (error) {{
                window.prompt({json.dumps(ui(language, "copy_link_prompt"))}, url);
            }}
        }}

        button.addEventListener("click", async () => {{
            if (navigator.share) {{
                try {{
                    await navigator.share({{
                        title: title,
                        url: url
                    }});
                }} catch (error) {{
                    if (error.name !== "AbortError") {{
                        await copyLink();
                    }}
                }}
            }} else {{
                await copyLink();
            }}
        }});
        </script>

        <style>
        html,
        body {{
            margin: 0;
            padding: 0;
            background: transparent;
        }}

        .share-row {{
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }}

        .share-button {{
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            justify-content: center;

            height: 42px;
            padding: 0 16px;

            border: 1px solid #30363d;
            border-radius: 8px;

            background: #161b22;
            color: {accent};

            font-family:
                ui-monospace,
                SFMono-Regular,
                Menlo,
                Monaco,
                Consolas,
                "Liberation Mono",
                monospace;

            font-size: 16px;
            font-weight: 400;
            line-height: 1;

            text-decoration: none;
            white-space: nowrap;

            cursor: pointer;
        }}

        .share-button:hover {{
            border-color: {accent};
            color: {accent};
            box-shadow: 0 0 0 1px {accent}22 inset;
        }}

        .share-button:active {{
            transform: translateY(1px);
        }}
        </style>
        """,
        height=52
    )


def render_post_navigation(post, posts, language="it"):
    try:
        index = posts.index(post)
    except ValueError:
        return

    previous_post = (
        posts[index + 1]
        if index < len(posts) - 1
        else None
    )

    next_post = (
        posts[index - 1]
        if index > 0
        else None
    )

    previous_html = ""

    if previous_post:
        previous_slug = previous_post["meta"]["slug"]
        previous_title = html.escape(
            previous_post["meta"]["title"]
        )
        previous_html = (
            f'<a href="{build_href(language, p=previous_slug)}" '
            'target="_self">'
            f'← {previous_title}'
            '</a>'
        )

    next_html = ""

    if next_post:
        next_slug = next_post["meta"]["slug"]
        next_title = html.escape(
            next_post["meta"]["title"]
        )
        next_html = (
            f'<a href="{build_href(language, p=next_slug)}" '
            'target="_self">'
            f'{next_title} →'
            '</a>'
        )

    st.html(
        (
            '<div class="post-navigation">'
            '<div class="post-navigation-cell post-navigation-prev">'
            f'{previous_html}'
            '</div>'
            '<div class="post-navigation-cell post-navigation-home">'
            f'<a href="{build_href(language)}" target="_self">{html.escape(ui(language, "post_home"))}</a>'
            '</div>'
            '<div class="post-navigation-cell post-navigation-next">'
            f'{next_html}'
            '</div>'
            '</div>'
        )
    )


def render_post(post, posts, language="it", theme="green"):
    meta = post["meta"]

    st.title(
        meta["title"]
    )

    st.markdown(
        (
            '<span class="muted">'
            f'{format_date_for_language(meta["date"], language)}'
            '</span>'
        ),
        unsafe_allow_html=True
    )

    render_markdown(
        post["body"]
    )

    render_translation(
        meta.get("translation", ""),
        language=language
    )

    render_reflection(
        meta.get("reflection", "")
    )

    render_tags(
        meta.get(
            "tags",
            []
        ),
        language=language
    )

    render_share_links(
        post,
        language=language,
        theme=theme
    )

    render_post_navigation(
        post,
        posts,
        language=language
    )



def render_semantic_map_preview(language="it", theme="green"):
    """Render a lightweight home teaser without loading Plotly."""

    brain_path = ASSETS_DIR / "brain.svg"

    if not brain_path.exists():
        return

    brain_svg = brain_path.read_text(encoding="utf-8")
    accent = theme_accent(theme)

    def colored_brain(color):
        svg = brain_svg.replace('fill="#000000"', f'fill="{color}"')
        encoded = b64encode(svg.encode("utf-8")).decode("ascii")
        return f'data:image/svg+xml;base64,{encoded}'

    base_src = colored_brain("#C8CDD2")
    activity_src = colored_brain(accent)

    st.html(
        (
            f'<a class="semantic-preview-card" href="{build_href(language, page="semantic-map")}" target="_self">'
            '<div class="semantic-preview-visual" aria-hidden="true">'
            f'<img class="semantic-preview-brain semantic-preview-brain-base" src="{base_src}" alt="">'
            f'<img class="semantic-preview-brain semantic-preview-brain-activity semantic-preview-brain-activity-a" src="{activity_src}" alt="">'
            f'<img class="semantic-preview-brain semantic-preview-brain-activity semantic-preview-brain-activity-b" src="{activity_src}" alt="">'
            f'<img class="semantic-preview-brain semantic-preview-brain-activity semantic-preview-brain-activity-c" src="{activity_src}" alt="">'
            f'<img class="semantic-preview-brain semantic-preview-brain-activity semantic-preview-brain-activity-d" src="{activity_src}" alt="">'
            '</div>'
            '<div class="semantic-preview-copy">'
            '<div class="semantic-preview-kicker">semantic_map.py</div>'
            f'<p>{html.escape(ui(language, "preview_body"))}</p>'
            f'<span class="semantic-preview-cta">{html.escape(ui(language, "preview_cta"))}</span>'
            '</div>'
            '</a>'
        )
    )

def render_home(
    posts,
    search,
    selected_tag,
    language="it",
    theme="green"
):
    render_semantic_map_preview(language=language, theme=theme)

    filtered = filter_posts(
        posts,
        search,
        selected_tag,
        language=language
    )

    if not filtered:
        st.html(
            (
                '<div class="empty-posts">'
                f'{html.escape(ui(language, "empty_posts"))}'
                '</div>'
            )
        )

        return

    for post in filtered:
        meta = post["meta"]

        title = html.escape(
            meta["title"]
        )

        slug = quote(
            meta["slug"]
        )

        summary = html.escape(
            meta.get(
                "summary",
                ""
            )
        )

        featured_line = html.escape(
            meta.get(
                "featured_line",
                ""
            )
        )

        date_text = format_date_for_language(
            meta["date"],
            language
        )

        tags = tag_links(
            meta.get(
                "tags",
                []
            ),
            language=language
        )

        summary_html = ""

        if summary:
            summary_html = (
                f'<p>{summary}</p>'
            )

        featured_html = ""

        if featured_line:
            featured_html = (
                '<div class="featured-line">'
                f'<code>{featured_line}</code>'
                '</div>'
            )

        tags_html = ""

        if tags:
            tags_html = (
                '<div class="post-card-tags">'
                f'{tags}'
                '</div>'
            )

        st.html(
            (
                '<div class="post-card">'
                '<div class="post-card-title">'
                f'<a href="{build_href(language, p=slug)}" '
                'target="_self">'
                f'{title}'
                '</a>'
                '</div>'
                '<div class="post-card-date">'
                f'{date_text}'
                '</div>'
                f'{summary_html}'
                f'{featured_html}'
                f'{tags_html}'
                '</div>'
            )
        )