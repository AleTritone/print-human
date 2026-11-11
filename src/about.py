import html
import re

import streamlit as st

from src.i18n import content_text
from src.theme import theme_accent


INLINE_CODE_RE = re.compile(r"`([^`]+)`")
TEXT = "#E6EDF3"
MUTED = "#8B949E"
BORDER = "rgba(255,255,255,0.12)"


def _render_about_inline(text: str, accent: str) -> str:
    escaped = html.escape(text)

    def replace_code(match):
        value = match.group(1)
        if value == 'print(&quot;human&quot;)':
            return (
                f'<span style="color:{accent};font:inherit;'
                'font-size:inherit;font-weight:inherit;'
                'background:transparent;padding:0;">'
                f'{value}'
                '</span>'
            )

        return f'<code>{value}</code>'

    return INLINE_CODE_RE.sub(replace_code, escaped)


def render_about(language="it", theme="green"):
    accent = theme_accent(theme)
    source = content_text(language, "about.md").strip()
    blocks = [block.strip() for block in source.split("\n\n") if block.strip()]

    title = "Alessandro M."
    body_blocks = blocks

    if blocks and blocks[0].startswith("# "):
        title = blocks[0][2:].strip()
        body_blocks = blocks[1:]

    body_html = []

    for block in body_blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue

        rendered_lines = [_render_about_inline(line, accent) for line in lines]
        body_html.append(
            '<p style="margin:0 0 1.45rem 0;'
            f'color:{TEXT};font-size:1rem;line-height:1.85;">'
            + '<br>'.join(rendered_lines)
            + '</p>'
        )

    st.html(
        (
            '<section style="width:100%;">'
            f'<div style="margin:2.6rem 0 2rem 0;color:{accent};'
            'font-size:3.25rem;line-height:1.12;font-weight:400;'
            'letter-spacing:-0.045em;">'
            f'{html.escape(title)}'
            '</div>'
            '<div>'
            f'{"".join(body_html)}'
            '</div>'
            f'<div style="width:100%;border-top:1px solid {BORDER};'
            'margin:2.1rem 0 2.35rem 0;"></div>'
            '<div style="width:max-content;margin:0 12% 0 auto;'
            'display:flex;flex-direction:column;align-items:flex-start;'
            'font-size:1rem;line-height:1.65;text-align:left;">'
            f'<span style="color:{MUTED};font-size:1rem;">life is a line</span>'
            f'<span style="color:{accent};font-size:1rem;">print(&quot;human&quot;)</span>'
            '</div>'
            '</section>'
        )
    )
