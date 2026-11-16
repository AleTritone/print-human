import logging
import re
import time

import streamlit as st
import streamlit.components.v1 as components

from src.i18n import content_text, ui
from src.semantic_map_state import current_source_signature, load_current_map
from src.theme import accent_rgb, semantic_theme_replacements, theme_accent


logger = logging.getLogger(__name__)


@st.fragment(run_every=60)
def watch_publications(signature, include_future=False, retry_at=None):
    if retry_at is not None:
        if time.monotonic() >= retry_at:
            st.rerun()
    elif current_source_signature(include_future) != signature:
        st.rerun()


def render_semantic_map(language="it", theme="green", include_future=False):
    """Render the semantic-map page."""

    source = content_text(language, "semantic_map.md").strip()
    blocks = [block.strip() for block in source.split("\n\n") if block.strip()]
    title = "semantic_map.py"
    intro = ""

    if blocks and blocks[0].startswith("# "):
        title = blocks[0][2:].strip()
        intro = " ".join(blocks[1:])
    else:
        intro = " ".join(blocks)

    st.html(
        f"""
        <style>
        .semantic-page-intro {{
            margin: 0 0 1rem 0;
        }}

        .semantic-page-intro h1 {{
            margin-bottom: .45rem;
        }}

        .semantic-page-intro p {{
            color: var(--color-muted);
            margin: 0;
            font-size: .92rem;
            line-height: 1.6;
        }}

        [data-testid="stIFrame"] {{
            display: block;
            width: 100%;
            margin: 0;
            border: 0;
            border-radius: 14px;
            overflow: hidden;
            background: transparent;
        }}

        @media (max-width: 700px) {{
            .semantic-page-intro {{
                margin-bottom: .85rem;
            }}
        }}
        </style>
        <div class="semantic-page-intro">
            <h1>{title}</h1>
            <p>{intro}</p>
        </div>
        <script>
        (function() {{
            try {{ localStorage.setItem("print-human-map-language", "{language}"); }} catch (error) {{}}
            window.dispatchEvent(new CustomEvent("print-human-languagechange", {{detail: {{language: "{language}"}}}}));
        }})();
        </script>
        """
    )

    try:
        with st.spinner(ui(language, "map_updating")):
            snapshot = load_current_map(include_future=include_future)
    except Exception:
        logger.exception("Could not refresh the semantic map")
        st.error(ui(language, "map_update_failed"))
        if st.button(ui(language, "map_retry"), key="retry-semantic-map"):
            st.rerun()
        watch_publications(None, include_future, retry_at=time.monotonic() + 60)
        return

    watch_publications(snapshot.signature, include_future)
    preview_html = snapshot.html

    # Preview palette
    primary_match = re.search(r'"primary"\s*:\s*"(#[0-9A-Fa-f]{6})"', preview_html)
    if primary_match:
        generated_accent = primary_match.group(1)
        old_hex = generated_accent.lstrip("#")
        old_rgb = tuple(int(old_hex[i:i + 2], 16) for i in (0, 2, 4))
        selected_accent = theme_accent(theme)
        new_rgb = accent_rgb(theme)

        preview_html = preview_html.replace(generated_accent, selected_accent)
        preview_html = preview_html.replace(generated_accent.lower(), selected_accent)
        preview_html = preview_html.replace(
            f"rgba({old_rgb[0]}, {old_rgb[1]}, {old_rgb[2]},",
            f"rgba({new_rgb[0]}, {new_rgb[1]}, {new_rgb[2]},",
        )
        preview_html = preview_html.replace(
            f"rgba({old_rgb[0]},{old_rgb[1]},{old_rgb[2]},",
            f"rgba({new_rgb[0]},{new_rgb[1]},{new_rgb[2]},",
        )
        preview_html = preview_html.replace(
            f"%23{old_hex.upper()}",
            f"%23{selected_accent.lstrip('#').upper()}",
        )
        preview_html = preview_html.replace(
            f"%23{old_hex.lower()}",
            f"%23{selected_accent.lstrip('#').lower()}",
        )

        # Tonal variants
        for source_color, target_color in semantic_theme_replacements("green", theme).items():
            source_hex = source_color.lstrip("#")
            target_hex = target_color.lstrip("#")
            preview_html = preview_html.replace(source_color, target_color)
            preview_html = preview_html.replace(source_color.lower(), target_color)
            preview_html = preview_html.replace(f"%23{source_hex.upper()}", f"%23{target_hex.upper()}")
            preview_html = preview_html.replace(f"%23{source_hex.lower()}", f"%23{target_hex.lower()}")

    language_bootstrap = (
        '<script>'
        'try { localStorage.setItem("print-human-map-language", "' + language + '"); } catch (error) {}'
        '</script>'
    )

    preview_html = preview_html.replace(
        '<head><meta charset="utf-8" /></head>',
        '<head><meta charset="utf-8" />' + language_bootstrap + '</head>',
        1,
    )

    preview_html = preview_html.replace(
        'let currentLanguage = (() => {\n        try {\n            return localStorage.getItem("print-human-map-language") === "it"\n                ? "it"\n                : "en";\n        } catch (error) {\n            return "en";\n        }\n    })();',
        f'let currentLanguage = "{language}";',
        1,
    )

    components.html(
        preview_html,
        height=1280,
        scrolling=True,
    )
