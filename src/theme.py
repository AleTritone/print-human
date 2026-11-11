"""Shared palettes for site UI, syntax highlighting, maps and social controls."""

THEMES = {
    "green": {
        "label": "Green",
        "accent": "#71C7A6",
        "portrait_filter": "none",
    },
    "blue": {
        "label": "Blue",
        "accent": "#5AA9FF",
        "portrait_filter": "hue-rotate(56deg) saturate(1.08)",
    },
    "rose": {
        "label": "Rose",
        "accent": "#F06A93",
        "portrait_filter": "hue-rotate(184deg) saturate(1.10)",
    },
    "violet": {
        "label": "Violet",
        "accent": "#9B7BFF",
        "portrait_filter": "hue-rotate(116deg) saturate(1.08)",
    },
}

DEFAULT_THEME = "green"
THEME_ACCENT = THEMES[DEFAULT_THEME]["accent"]


def normalize_theme(value: str | None) -> str:
    return value if value in THEMES else DEFAULT_THEME


def theme_accent(theme: str | None = None) -> str:
    return THEMES[normalize_theme(theme)]["accent"]


def theme_portrait_filter(theme: str | None = None) -> str:
    return THEMES[normalize_theme(theme)]["portrait_filter"]


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def _rgb_to_hex(rgb) -> str:
    return "#" + "".join(
        f"{max(0, min(255, int(round(component)))):02X}"
        for component in rgb
    )


def mix_hex(color_a: str, color_b: str, amount: float) -> str:
    """Mix color_a toward color_b by amount in [0, 1]."""
    amount = max(0.0, min(1.0, float(amount)))
    a = _hex_to_rgb(color_a)
    b = _hex_to_rgb(color_b)
    return _rgb_to_hex(
        first + (second - first) * amount
        for first, second in zip(a, b)
    )


def accent_rgb(theme: str | None = None) -> tuple[int, int, int]:
    return _hex_to_rgb(theme_accent(theme))


def accent_rgba(alpha: float, theme: str | None = None) -> str:
    r, g, b = accent_rgb(theme)
    return f"rgba({r}, {g}, {b}, {alpha})"


def theme_variants(theme: str | None = None) -> dict[str, str]:
    """Semantic-map color variants derived from the selected palette."""
    accent = theme_accent(theme)
    return {
        "accent": accent,
        "soft": mix_hex(accent, "#0D1117", 0.46),
        "mid": mix_hex(accent, "#E6EDF3", 0.24),
        "light": mix_hex(accent, "#E6EDF3", 0.52),
        "bright": mix_hex(accent, "#FFFFFF", 0.72),
        "neural": mix_hex(accent, "#FFFFFF", 0.62),
        "pulse": mix_hex(accent, "#FFFFFF", 0.84),
    }


def semantic_theme_replacements(source_theme: str, target_theme: str) -> dict[str, str]:
    """Return color substitutions between two palettes."""
    source = theme_variants(source_theme)
    target = theme_variants(target_theme)
    return {source[key]: target[key] for key in source}
