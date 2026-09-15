import html
import json
from base64 import b64encode
from urllib.parse import quote

import streamlit as st
import streamlit.components.v1 as components

from src.config import (
    ASSETS_DIR,
    AUTHOR_NAME,
    SHARE_SITE_URL,
    SITE_NAME,
    SITE_TAGLINE
)
from src.markdown_renderer import render_markdown
from src.posts import filter_posts
from src.utils import format_date_it


def tag_links(tags):
    return " ".join(
        (
            f'<a class="tag" '
            f'href="?tag={quote(tag)}" '
            f'target="_self">'
            f'{html.escape(tag)}'
            f'</a>'
        )
        for tag in tags
    )


def render_sidebar(tags):
    st.sidebar.markdown(
        f'<div class="site-name">{html.escape(SITE_NAME)}</div>',
        unsafe_allow_html=True
    )

    image_path = ASSETS_DIR / "me.jpg"

    if image_path.exists():
        encoded = b64encode(
            image_path.read_bytes()
        ).decode("ascii")

        mime = (
            "image/png"
            if image_path.suffix.lower() == ".png"
            else "image/jpeg"
        )

        st.sidebar.markdown(
            (
                '<div class="author-profile">'
                '<div class="author-image">'
                f'<img src="data:{mime};base64,{encoded}">'
                '</div>'
                '<div class="author-name">'
                f'<strong>{html.escape(AUTHOR_NAME)}</strong>'
                '<div class="author-about">'
                '<a href="?page=about" target="_self">'
                '__about__.py'
                '</a>'
                '</div>'
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
                '<div class="author-about">'
                '<a href="?page=about" target="_self">'
                '__about__.py'
                '</a>'
                '</div>'
                '</div>'
                '</div>'
            ),
            unsafe_allow_html=True
        )

    st.sidebar.markdown(
        (
            '<div class="site-tagline">'
            f'{html.escape(SITE_TAGLINE)}'
            '</div>'
        ),
        unsafe_allow_html=True
    )

    search = st.sidebar.text_input(
        "Cerca",
        placeholder="parole, concetti, sintassi..."
    )

    options = ["(tutti)"] + tags

    query_tag = st.query_params.get("tag")

    if isinstance(query_tag, list):
        query_tag = (
            query_tag[0]
            if query_tag
            else None
        )

    selected_index = 0

    if query_tag in tags:
        selected_index = options.index(query_tag)

    selected_tag = st.sidebar.selectbox(
        "Tag",
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


def render_tags(tags):
    if not tags:
        return

    st.html(
        (
            '<div class="post-tags">'
            f'{tag_links(tags)}'
            '</div>'
        )
    )


def render_translation(translation):
    if not translation:
        return

    with st.expander(
        "Note / traduzione",
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


def render_share_links(post):
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

    st.markdown("Condividi:")

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
                Condividi link
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
                button.textContent = "Link copiato";

                setTimeout(() => {{
                    button.textContent = originalText;
                }}, 1600);
            }} catch (error) {{
                window.prompt("Copia questo link:", url);
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
            color: #71c7a6;

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
            border-color: #71c7a6;
        }}

        .share-button:active {{
            transform: translateY(1px);
        }}
        </style>
        """,
        height=52
    )


def render_post_navigation(post, posts):
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
        previous_slug = quote(
            previous_post["meta"]["slug"]
        )

        previous_title = html.escape(
            previous_post["meta"]["title"]
        )

        previous_html = (
            f'<a href="?p={previous_slug}" '
            'target="_self">'
            f'← {previous_title}'
            '</a>'
        )

    next_html = ""

    if next_post:
        next_slug = quote(
            next_post["meta"]["slug"]
        )

        next_title = html.escape(
            next_post["meta"]["title"]
        )

        next_html = (
            f'<a href="?p={next_slug}" '
            'target="_self">'
            f'{next_title} →'
            '</a>'
        )

    st.html(
        (
            '<div class="post-navigation">'

            '<div class="post-navigation-cell '
            'post-navigation-prev">'
            f'{previous_html}'
            '</div>'

            '<div class="post-navigation-cell '
            'post-navigation-home">'
            '<a href="?" target="_self">'
            'home'
            '</a>'
            '</div>'

            '<div class="post-navigation-cell '
            'post-navigation-next">'
            f'{next_html}'
            '</div>'

            '</div>'
        )
    )


def render_post(post, posts):
    meta = post["meta"]

    st.title(
        meta["title"]
    )

    st.markdown(
        (
            '<span class="muted">'
            f'{format_date_it(meta["date"])}'
            '</span>'
        ),
        unsafe_allow_html=True
    )

    render_markdown(
        post["body"]
    )

    render_translation(
        meta.get(
            "translation",
            ""
        )
    )

    render_reflection(
        meta.get(
            "reflection",
            ""
        )
    )

    render_tags(
        meta.get(
            "tags",
            []
        )
    )

    render_share_links(
        post
    )

    render_post_navigation(
        post,
        posts
    )


def render_home(
    posts,
    search,
    selected_tag
):
    filtered = filter_posts(
        posts,
        search,
        selected_tag
    )

    if not filtered:
        st.html(
            '<div class="empty-posts">'
            'Nessun post trovato.'
            '</div>'
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

        date_text = format_date_it(
            meta["date"]
        )

        tags = tag_links(
            meta.get(
                "tags",
                []
            )
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
                f'<a href="?p={slug}" '
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