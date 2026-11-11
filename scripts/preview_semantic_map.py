import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote

import plotly.graph_objects as go
import plotly.io as pio


ROOT = Path(__file__).resolve().parent.parent

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config import SITE_URL
from src.i18n import semantic_map_copy
from src.theme import THEME_ACCENT, accent_rgba, theme_variants


DEFAULT_INPUT = ROOT / "data" / "semantic_map.json"
DEFAULT_OUTPUT = ROOT / "data" / "semantic_map_preview.html"

NEURAL_JS_PATH = ROOT / "assets" / "semantic_map_neural.js"
AMBIENT_JS_PATH = ROOT / "assets" / "semantic_map_ambient.js"
EXPLANATIONS_JS_PATH = ROOT / "assets" / "semantic_map_explanations.js"
MAIN_JS_PATH = ROOT / "assets" / "semantic_map.js"
INTERACTION_JS_PATH = ROOT / "assets" / "semantic_map_interaction.js"

BRAIN_ASSET_PATH = ROOT / "assets" / "brain.svg"


BACKGROUND = "#0D1117"
SURFACE = "#161B22"
TEXT = "#E6EDF3"
MUTED = "#8B949E"
PRIMARY = THEME_ACCENT
BORDER = "#30363D"

BRAIN_COLOR = THEME_ACCENT
BRAIN_OPACITY = 0.13

THEME_VARIANTS = theme_variants()
NODE_BASE = THEME_VARIANTS["accent"]
NODE_MID = THEME_VARIANTS["mid"]
NODE_LIGHT = THEME_VARIANTS["light"]
NODE_BRIGHT = THEME_VARIANTS["bright"]
NODE_WHITE = "#F8FBFF"

# Connection gradients use theme-colored light tones and white.
NEURAL_COLOR = THEME_VARIANTS["neural"]
NEURAL_PULSE = "#F8FBFF"

# Ambient node colors use multiple tonal levels from the theme palette.
AMBIENT_PALETTE = [
    THEME_VARIANTS["soft"],
    THEME_VARIANTS["accent"],
    THEME_VARIANTS["mid"],
    THEME_VARIANTS["light"],
]

AXIS_COLOR = accent_rgba(0.06)
ANCHOR_EDGE_COLOR = accent_rgba(0.12)

TAG_EDGE_COLORS = {
    "weak": "rgba(139, 148, 158, 0.06)",
    "medium": "rgba(139, 148, 158, 0.11)",
    "strong": "rgba(139, 148, 158, 0.18)",
}


# Initial viewport


INITIAL_X_RANGE = [
    -1.22,
    1.22,
]

INITIAL_Y_RANGE = [
    -1.40,
    1.40,
]


# =========================================================
# Maximum zoom-out
#
# 1.00 = initial scale
# 0.50 = twice the visible width
# 0.25 = four times the visible width
# =========================================================


MAX_ZOOM_OUT_SCALE = 0.25


INITIAL_X_CENTER = (
    INITIAL_X_RANGE[0]
    +
    INITIAL_X_RANGE[1]
) / 2.0

INITIAL_Y_CENTER = (
    INITIAL_Y_RANGE[0]
    +
    INITIAL_Y_RANGE[1]
) / 2.0


INITIAL_X_HALF_WIDTH = (
    INITIAL_X_RANGE[1]
    -
    INITIAL_X_RANGE[0]
) / 2.0

INITIAL_Y_HALF_HEIGHT = (
    INITIAL_Y_RANGE[1]
    -
    INITIAL_Y_RANGE[0]
) / 2.0


MAX_X_HALF_WIDTH = (
    INITIAL_X_HALF_WIDTH
    /
    MAX_ZOOM_OUT_SCALE
)

MAX_Y_HALF_HEIGHT = (
    INITIAL_Y_HALF_HEIGHT
    /
    MAX_ZOOM_OUT_SCALE
)


MAX_X_RANGE = [
    INITIAL_X_CENTER
    -
    MAX_X_HALF_WIDTH,

    INITIAL_X_CENTER
    +
    MAX_X_HALF_WIDTH,
]


MAX_Y_RANGE = [
    INITIAL_Y_CENTER
    -
    MAX_Y_HALF_HEIGHT,

    INITIAL_Y_CENTER
    +
    MAX_Y_HALF_HEIGHT,
]


# Node sizing


NODE_SIZE_SCALE = 0.68

NODE_MIN_SIZE = 6.0

SELECTED_HIGHLIGHT_SIZE = 30

NEIGHBOR_HIGHLIGHT_SIZE = 22


# Brain dimensions


BRAIN_X_RADIUS = 1.06

BRAIN_Y_RADIUS = (
    BRAIN_X_RADIUS
    *
    (
        1402.0
        /
        1122.0
    )
)


# Anchor positioning


FAMILY_ANCHOR_Y_OFFSET = 0.18
WORK_ANCHOR_Y_OFFSET = -0.18

FAMILY_ICON_Y_OFFSET = 0.17
WORK_ICON_Y_OFFSET = -0.17

SIDE_ANCHOR_X_OFFSET = 0.12

# CLI


def parse_args():
    parser = argparse.ArgumentParser(
        description='Preview the print("human") semantic map.'
    )

    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
    )

    parser.add_argument(
        "--open",
        action="store_true",
    )

    return parser.parse_args()


# Loading


def load_map(path):
    path = path.resolve()

    if not path.exists():
        raise FileNotFoundError(
            "Semantic map JSON not found: "
            f"{path}\n"
            "Build it first with: "
            "python scripts/build_semantic_map.py --include-future"
        )

    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )


def read_javascript(
    path,
    required=False,
):
    if not path.exists():
        if required:
            raise FileNotFoundError(
                f"Semantic map JavaScript not found: {path}"
            )

        return ""

    source = path.read_text(
        encoding="utf-8"
    )

    return (
        "\n"
        f"/* =====================================================\n"
        f"   {path.name}\n"
        f"   ===================================================== */\n"
        f"{source}\n"
    )


def load_javascript_bundle():
    """
    JavaScript loading order:

    1. semantic_map_neural.js
    2. semantic_map_ambient.js
    3. semantic_map_explanations.js
    4. semantic_map.js
    5. semantic_map_interaction.js
    """

    parts = [
        read_javascript(
            NEURAL_JS_PATH,
            required=True,
        ),

        read_javascript(
            AMBIENT_JS_PATH,
            required=True,
        ),

        read_javascript(
            EXPLANATIONS_JS_PATH,
            required=True,
        ),

        read_javascript(
            MAIN_JS_PATH,
            required=True,
        ),

        read_javascript(
            INTERACTION_JS_PATH,
            required=False,
        ),
    ]

    return "".join(
        part
        for part in parts
        if part
    )


# Data helpers


def build_node_lookup(data):
    return {
        node["tag"]: node
        for node in data.get(
            "nodes",
            [],
        )
    }


def build_anchor_lookup(data):
    return {
        anchor["name"]: anchor
        for anchor in data.get(
            "anchors",
            [],
        )
    }


def ordered_anchors(data):
    lookup = build_anchor_lookup(
        data
    )

    anchors = [
        lookup[name]
        for name in data.get(
            "anchor_order",
            [],
        )
        if name in lookup
    ]

    return (
        anchors
        or
        data.get(
            "anchors",
            [],
        )
    )


# Colors / markers


def marker_size(
    weight,
    level,
):
    base_size = max(
        10
        +
        float(weight)
        *
        4.8
        -
        level
        *
        1.1,

        9,
    )

    return max(
        base_size
        *
        NODE_SIZE_SCALE,

        NODE_MIN_SIZE,
    )


def hex_to_rgb(value):
    value = value.lstrip("#")

    return tuple(
        int(
            value[index:index + 2],
            16,
        )
        for index in (
            0,
            2,
            4,
        )
    )


def rgb_to_hex(rgb):
    return "#" + "".join(
        f"{max(0, min(255, int(round(component)))):02X}"
        for component in rgb
    )


def mix_color(
    color_a,
    color_b,
    t,
):
    rgb_a = hex_to_rgb(
        color_a
    )

    rgb_b = hex_to_rgb(
        color_b
    )

    result = [
        a + (b - a) * t
        for a, b in zip(
            rgb_a,
            rgb_b,
        )
    ]

    return rgb_to_hex(
        result
    )


def weight_range(nodes):
    weights = [
        float(
            node.get(
                "weight",
                1.0,
            )
        )
        for node in nodes
    ]

    if not weights:
        return (
            1.0,
            1.0,
        )

    return (
        min(weights),
        max(weights),
    )


def node_marker_color(
    weight,
    minimum,
    maximum,
):
    """Theme-derived discrete ramp: accent -> pale accent -> near white.

    Keep every emitted color on the named theme palette.  The semantic-map
    page can then replace the complete green palette with blue/rose/violet
    without leaving interpolated green RGB values behind.
    """
    if maximum <= minimum:
        return NODE_BASE

    t = (float(weight) - minimum) / (maximum - minimum)
    t = max(0.0, min(1.0, t))
    # Expand lower attraction values to retain visible tonal differences.
    t = t ** 0.35

    if t < 0.20:
        return NODE_BASE
    if t < 0.42:
        return NODE_MID
    if t < 0.66:
        return NODE_LIGHT
    if t < 0.86:
        return NODE_BRIGHT
    return NODE_WHITE


# Brain SVG


def _strip_svg_namespace(tag):
    return tag.rsplit(
        "}",
        1,
    )[-1]


def _parse_svg_dimension(
    value,
    fallback,
):
    if value is None:
        return float(
            fallback
        )

    cleaned = str(
        value
    ).strip()

    for suffix in (
        "px",
        "pt",
        "cm",
        "mm",
        "in",
    ):
        if cleaned.endswith(
            suffix
        ):
            cleaned = cleaned[
                :-len(suffix)
            ]

            break

    try:
        return float(
            cleaned
        )

    except ValueError:
        return float(
            fallback
        )


def load_brain_asset():
    if not BRAIN_ASSET_PATH.exists():
        raise FileNotFoundError(
            f"Brain SVG not found: "
            f"{BRAIN_ASSET_PATH}"
        )

    svg_text = (
        BRAIN_ASSET_PATH
        .read_text(
            encoding="utf-8"
        )
    )

    root = ET.fromstring(
        svg_text
    )

    view_box = root.get(
        "viewBox"
    )

    if view_box:
        values = [
            float(value)
            for value in (
                view_box
                .replace(
                    ",",
                    " ",
                )
                .split()
            )
        ]

        if len(values) != 4:
            raise ValueError(
                f"Invalid SVG viewBox in "
                f"{BRAIN_ASSET_PATH}: "
                f"{view_box}"
            )

        (
            min_x,
            min_y,
            width,
            height,
        ) = values

    else:
        min_x = 0.0
        min_y = 0.0

        width = (
            _parse_svg_dimension(
                root.get(
                    "width"
                ),
                1122,
            )
        )

        height = (
            _parse_svg_dimension(
                root.get(
                    "height"
                ),
                1402,
            )
        )

        root.set(
            "viewBox",
            (
                f"0 0 "
                f"{width:g} "
                f"{height:g}"
            ),
        )

    paths = []
    group_transform = ""

    for element in root.iter():
        tag = (
            _strip_svg_namespace(
                element.tag
            )
        )

        if tag == "path":
            path_data = (
                element.get(
                    "d"
                )
                or
                ""
            ).strip()

            if path_data:
                paths.append(
                    path_data
                )

                element.set(
                    "fill",
                    BRAIN_COLOR,
                )

                element.set(
                    "stroke",
                    "none",
                )

        elif (
            tag == "g"
            and
            not group_transform
        ):
            transform = (
                element.get(
                    "transform"
                )
                or
                ""
            ).strip()

            if transform:
                group_transform = (
                    transform
                )

    if not paths:
        raise ValueError(
            f"No SVG paths found in "
            f"{BRAIN_ASSET_PATH}"
        )

    root.set(
        "preserveAspectRatio",
        "xMidYMid meet",
    )

    root.set(
        "width",
        f"{width:g}",
    )

    root.set(
        "height",
        f"{height:g}",
    )

    root.set(
        "style",
        "background:transparent",
    )

    for element in root.iter():
        if (
            _strip_svg_namespace(
                element.tag
            )
            ==
            "g"
        ):
            element.set(
                "opacity",
                f"{BRAIN_OPACITY:.3f}",
            )

            break

    styled_svg = (
        ET.tostring(
            root,
            encoding="unicode",
            short_empty_elements=True,
        )
    )

    return {
        "min_x": min_x,
        "min_y": min_y,
        "width": width,
        "height": height,
        "paths": paths,
        "path_transform": group_transform,
        "svg": styled_svg,
    }


def build_brain_svg_uri(
    brain_asset,
):
    return (
        "data:image/svg+xml;"
        "charset=utf-8,"
        +
        quote(
            brain_asset[
                "svg"
            ],
            safe="",
        )
    )


def add_background_layers(
    figure,
    brain_asset,
):
    figure.add_layout_image(
        dict(
            source=(
                build_brain_svg_uri(
                    brain_asset
                )
            ),

            xref="x",
            yref="y",

            x=-BRAIN_X_RADIUS,
            y=BRAIN_Y_RADIUS,

            sizex=(
                2
                *
                BRAIN_X_RADIUS
            ),

            sizey=(
                2
                *
                BRAIN_Y_RADIUS
            ),

            xanchor="left",
            yanchor="top",

            sizing="contain",

            opacity=1.0,

            layer="below",
        )
    )


# Anchor icons


def build_anchor_icon_svg_uri(
    name,
):
    common = (
        f'fill="none" '
        f'stroke="{PRIMARY}" '
        f'stroke-width="3" '
        f'stroke-linecap="round" '
        f'stroke-linejoin="round"'
    )

    icons = {
        "self": (
            f'<circle '
            f'cx="32" '
            f'cy="21" '
            f'r="8" '
            f'{common}/>'
            f'<path '
            f'd="M17 51 '
            f'C19 39 25 35 32 35 '
            f'C39 35 45 39 47 51" '
            f'{common}/>'
        ),

        "family": (
            f'<path '
            f'd="M10 31 '
            f'L32 12 '
            f'L54 31 '
            f'V53 '
            f'H10 '
            f'Z" '
            f'{common}/>'
            f'<path '
            f'd="M25 53 '
            f'V38 '
            f'H39 '
            f'V53" '
            f'{common}/>'
        ),

        "relationships": (
            f'<circle '
            f'cx="18" '
            f'cy="32" '
            f'r="8" '
            f'{common}/>'
            f'<circle '
            f'cx="46" '
            f'cy="32" '
            f'r="8" '
            f'{common}/>'
            f'<path '
            f'd="M26 32 H38" '
            f'{common}/>'
            f'<path '
            f'd="M31 27 '
            f'L38 32 '
            f'L31 37" '
            f'{common}/>'
        ),

        "society": (
            f'<circle '
            f'cx="32" '
            f'cy="17" '
            f'r="6" '
            f'{common}/>'
            f'<circle '
            f'cx="16" '
            f'cy="42" '
            f'r="6" '
            f'{common}/>'
            f'<circle '
            f'cx="48" '
            f'cy="42" '
            f'r="6" '
            f'{common}/>'
            f'<path '
            f'd="M29 22 '
            f'L20 37 '
            f'M35 22 '
            f'L44 37 '
            f'M22 42 '
            f'H42" '
            f'{common}/>'
        ),

        "work": (
            f'<rect '
            f'x="10" '
            f'y="22" '
            f'width="44" '
            f'height="32" '
            f'rx="4" '
            f'{common}/>'
            f'<path '
            f'd="M23 22 '
            f'V16 '
            f'H41 '
            f'V22 '
            f'M10 34 '
            f'H54 '
            f'M27 34 '
            f'V39 '
            f'H37 '
            f'V34" '
            f'{common}/>'
        ),

        "nature": (
            f'<path '
            f'd="M51 12 '
            f'C31 13 18 23 15 39 '
            f'C13 50 21 56 31 53 '
            f'C45 49 51 31 51 12 '
            f'Z" '
            f'{common}/>'
            f'<path '
            f'd="M17 53 '
            f'C25 42 33 33 47 20" '
            f'{common}/>'
        ),
    }

    svg = (
        '<svg '
        'xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 64 64">'
        +
        icons.get(
            name,
            icons["self"],
        )
        +
        '</svg>'
    )

    return (
        "data:image/svg+xml;"
        "charset=utf-8,"
        +
        quote(
            svg,
            safe="",
        )
    )


# Anchor positioning


def anchor_display_position(
    anchor,
):
    x = float(
        anchor["x"]
    )

    y = float(
        anchor["y"]
    )

    if (
        anchor["name"]
        ==
        "family"
    ):
        y += (
            FAMILY_ANCHOR_Y_OFFSET
        )

    elif (
        anchor["name"]
        ==
        "work"
    ):
        y += (
            WORK_ANCHOR_Y_OFFSET
        )

    elif (
        anchor["name"]
        in (
            "self",
            "nature",
        )
    ):
        x += (
            SIDE_ANCHOR_X_OFFSET
        )

    elif (
        anchor["name"]
        in (
            "relationships",
            "society",
        )
    ):
        x -= (
            SIDE_ANCHOR_X_OFFSET
        )

    return (
        x,
        y,
    )

def anchor_icon_position(
    anchor,
):
    x, y = (
        anchor_display_position(
            anchor
        )
    )

    if (
        anchor["name"]
        ==
        "family"
    ):
        y += (
            FAMILY_ICON_Y_OFFSET
        )

    elif (
        anchor["name"]
        ==
        "work"
    ):
        y += (
            WORK_ICON_Y_OFFSET
        )

    return (
        x,
        y,
    )


def add_anchor_icons(
    figure,
    anchors,
):
    for anchor in anchors:
        x, y = (
            anchor_icon_position(
                anchor
            )
        )

        figure.add_layout_image(
            dict(
                source=(
                    build_anchor_icon_svg_uri(
                        anchor[
                            "name"
                        ]
                    )
                ),

                xref="x",
                yref="y",

                x=x,
                y=y,

                sizex=0.14,
                sizey=0.14,

                xanchor="center",
                yanchor="middle",

                sizing="contain",

                opacity=1.0,

                layer="above",
            )
        )


def anchor_text_position(
    name,
):
    return {
        "family": "top center",
        "relationships": "middle right",
        "society": "middle right",
        "work": "bottom center",
        "nature": "middle left",
        "self": "middle left",
    }.get(
        name,
        "top center",
    )


def add_anchor_nodes(
    figure,
    anchors,
):
    for anchor in anchors:
        x, y = (
            anchor_display_position(
                anchor
            )
        )

        figure.add_trace(
            go.Scatter(
                x=[x],
                y=[y],

                mode="markers+text",

                text=[
                    anchor["label"]
                ],

                textposition=(
                    anchor_text_position(
                        anchor[
                            "name"
                        ]
                    )
                ),

                textfont={
                    "size": 13,
                    "color": PRIMARY,
                },

                marker={
                    "size": 36,

                    "color": (
                        "rgba(0,0,0,0)"
                    ),

                    "line": {
                        "width": 0,
                    },
                },

                hoverinfo="skip",

                showlegend=False,

                meta={
                    "layer": "anchor",

                    "anchorName": (
                        anchor[
                            "name"
                        ]
                    ),
                },
            )
        )


# Axes


def add_axis_lines(
    figure,
    anchor_lookup,
):
    pairs = [
        (
            "family",
            "work",
        ),

        (
            "self",
            "society",
        ),

        (
            "relationships",
            "nature",
        ),
    ]

    x_values = []
    y_values = []

    for first, second in pairs:
        a = anchor_lookup.get(
            first
        )

        b = anchor_lookup.get(
            second
        )

        if (
            a is None
            or
            b is None
        ):
            continue

        ax, ay = (
            anchor_display_position(
                a
            )
        )

        bx, by = (
            anchor_display_position(
                b
            )
        )

        x_values.extend([
            ax,
            bx,
            None,
        ])

        y_values.extend([
            ay,
            by,
            None,
        ])

    if x_values:
        figure.add_trace(
            go.Scatter(
                x=x_values,
                y=y_values,

                mode="lines",

                line={
                    "width": 1,

                    "color": (
                        AXIS_COLOR
                    ),

                    "dash": "dot",
                },

                hoverinfo="skip",

                showlegend=False,

                meta={
                    "layer": "axis",
                },
            )
        )


# Tag edges


def edge_bucket(strength):
    strength = float(
        strength
    )

    if strength < 0.45:
        return "weak"

    if strength < 0.65:
        return "medium"

    return "strong"


def add_tag_edges(
    figure,
    data,
    node_lookup,
):
    buckets = {
        name: {
            "x": [],
            "y": [],
        }
        for name in (
            TAG_EDGE_COLORS
        )
    }

    for edge in data.get(
        "edges",
        [],
    ):
        source = (
            node_lookup.get(
                edge["source"]
            )
        )

        target = (
            node_lookup.get(
                edge["target"]
            )
        )

        if (
            source is None
            or
            target is None
        ):
            continue

        bucket = edge_bucket(
            edge.get(
                "strength",
                0.0,
            )
        )

        buckets[
            bucket
        ]["x"].extend([
            source["x"],
            target["x"],
            None,
        ])

        buckets[
            bucket
        ]["y"].extend([
            source["y"],
            target["y"],
            None,
        ])

    widths = {
        "weak": 0.7,
        "medium": 1.1,
        "strong": 1.6,
    }

    for name in (
        "weak",
        "medium",
        "strong",
    ):
        if not buckets[
            name
        ]["x"]:
            continue

        figure.add_trace(
            go.Scatter(
                x=(
                    buckets[
                        name
                    ]["x"]
                ),

                y=(
                    buckets[
                        name
                    ]["y"]
                ),

                mode="lines",

                line={
                    "width": (
                        widths[
                            name
                        ]
                    ),

                    "color": (
                        TAG_EDGE_COLORS[
                            name
                        ]
                    ),
                },

                hoverinfo="skip",

                showlegend=False,

                visible=False,

                meta={
                    "layer": (
                        "tag-edge"
                    ),

                    "strengthBucket": (
                        name
                    ),
                },
            )
        )


# Anchor edges


def add_anchor_edges(
    figure,
    nodes,
    anchor_lookup,
):
    x_values = []
    y_values = []

    for node in nodes:
        for relation in node.get(
            "anchors",
            [],
        ):
            anchor = (
                anchor_lookup.get(
                    relation[
                        "name"
                    ]
                )
            )

            if anchor is None:
                continue

            (
                anchor_x,
                anchor_y,
            ) = (
                anchor_display_position(
                    anchor
                )
            )

            x_values.extend([
                node["x"],
                anchor_x,
                None,
            ])

            y_values.extend([
                node["y"],
                anchor_y,
                None,
            ])

    if x_values:
        figure.add_trace(
            go.Scatter(
                x=x_values,
                y=y_values,

                mode="lines",

                line={
                    "width": 0.8,

                    "color": (
                        ANCHOR_EDGE_COLOR
                    ),

                    "dash": "dot",
                },

                hoverinfo="skip",

                showlegend=False,

                meta={
                    "layer": (
                        "anchor-edge"
                    ),
                },
            )
        )


# Tag nodes


def add_tag_nodes(
    figure,
    nodes,
):
    (
        minimum,
        maximum,
    ) = weight_range(
        nodes
    )

    levels = sorted({
        int(
            node.get(
                "visibility_level",
                3,
            )
        )
        for node in nodes
    })

    for level in levels:
        group_nodes = [
            node
            for node in nodes
            if int(
                node.get(
                    "visibility_level",
                    3,
                )
            )
            ==
            level
        ]

        if not group_nodes:
            continue

        figure.add_trace(
            go.Scatter(
                x=[
                    node["x"]
                    for node
                    in group_nodes
                ],

                y=[
                    node["y"]
                    for node
                    in group_nodes
                ],

                mode="markers",

                marker={
                    "size": [
                        (
                            marker_size(
                                node["weight"],
                                level,
                            )
                            +
                            (
                                3.0
                                if node.get(
                                    "system_role"
                                ) == "core"
                                else 0.0
                            )
                        )
                        for node
                        in group_nodes
                    ],

                    "color": [
                        node_marker_color(
                            node["weight"],
                            minimum,
                            maximum,
                        )
                        for node
                        in group_nodes
                    ],

                    "opacity": (
                        0.96
                        -
                        level * 0.06
                    ),

                    "line": {
                        "color": [
                            (
                                PRIMARY
                                if node.get(
                                    "system_role"
                                ) == "core"
                                else BACKGROUND
                            )
                            for node
                            in group_nodes
                        ],

                        "width": [
                            (
                                1.8
                                if node.get(
                                    "system_role"
                                ) == "core"
                                else 1.0
                            )
                            for node
                            in group_nodes
                        ],
                    },
                },

                customdata=[
                    node["tag"]
                    for node
                    in group_nodes
                ],

                hoverinfo="none",

                showlegend=False,

                visible=True,

                meta={
                    "layer": "node",

                    "visibilityLevel": (
                        level
                    ),
                },
            )
        )


# Highlight traces


def add_highlight_traces(
    figure,
):
    figure.add_trace(
        go.Scatter(
            x=[],
            y=[],

            mode="markers",

            marker={
                "size": (
                    SELECTED_HIGHLIGHT_SIZE
                ),

                "symbol": (
                    "circle-open"
                ),

                "color": PRIMARY,

                "line": {
                    "width": 2.4,
                    "color": PRIMARY,
                },
            },

            hoverinfo="skip",

            showlegend=False,

            visible=False,

            meta={
                "layer": "highlight",
            },
        )
    )

    figure.add_trace(
        go.Scatter(
            x=[],
            y=[],

            mode="markers",

            marker={
                "size": (
                    NEIGHBOR_HIGHLIGHT_SIZE
                ),

                "symbol": (
                    "circle-open"
                ),

                "color": (
                    NEURAL_COLOR
                ),

                "opacity": 0.72,

                "line": {
                    "width": 1.4,

                    "color": (
                        NEURAL_COLOR
                    ),
                },
            },

            hoverinfo="skip",

            showlegend=False,

            visible=False,

            meta={
                "layer": (
                    "neighbor-highlight"
                ),
            },
        )
    )


# JavaScript configuration


def build_javascript_config(
    data,
    brain_asset,
):
    nodes = data.get(
        "nodes",
        [],
    )

    (
        minimum,
        maximum,
    ) = weight_range(
        nodes
    )

    node_payload = []

    for node in nodes:
        node_payload.append({
            "tag": node["tag"],

            "x": node["x"],
            "y": node["y"],

            "weight": (
                node.get(
                    "weight",
                    1.0,
                )
            ),

            "attractionStrength": (
                node.get(
                    "attraction_strength"
                )
            ),

            "attractionVisual": (
                node.get(
                    "attraction_visual"
                )
            ),

            "attractionComponents": (
                node.get(
                    "attraction_components",
                    {},
                )
            ),

            "priority": (
                node.get(
                    "label_priority",
                    0.0,
                )
            ),

            "intensityComponents": (
                node.get(
                    "intensity_components",
                    {},
                )
            ),

            "priorityComponents": (
                node.get(
                    "priority_components",
                    {},
                )
            ),

            "level": (
                node.get(
                    "visibility_level",
                    3,
                )
            ),

            "posts": (
                node.get(
                    "posts",
                    [],
                )
            ),

            "count": (
                node.get(
                    "count",
                    0,
                )
            ),

            "systemId": (
                node.get(
                    "system_id",
                    node.get(
                        "cluster",
                        -1,
                    ),
                )
            ),

            "systemCoreTags": (
                node.get(
                    "system_core_tags",
                    [],
                )
            ),

            "systemSize": (
                node.get(
                    "system_size",
                    1,
                )
            ),

            "systemLabel": (
                node.get(
                    "system_label",
                    "",
                )
            ),

            "systemRole": (
                node.get(
                    "system_role",
                    "member",
                )
            ),

            "semanticNeighbors": (
                node.get(
                    "semantic_neighbors",
                    [],
                )
            ),

            "anchors": (
                node.get(
                    "anchors",
                    [],
                )
            ),

            "anchorScores": (
                node.get(
                    "anchor_scores",
                    [],
                )
            ),

            "neighbors": (
                node.get(
                    "neighbors",
                    [],
                )
            ),

            "context": (
                node.get(
                    "context",
                    [],
                )
            ),

            "color": (
                node_marker_color(
                    node.get(
                        "weight",
                        1.0,
                    ),
                    minimum,
                    maximum,
                )
            ),
        })

    javascript_anchors = []

    for anchor in data.get(
        "anchors",
        [],
    ):
        x, y = (
            anchor_display_position(
                anchor
            )
        )

        javascript_anchors.append({
            "name": (
                anchor["name"]
            ),

            "label": (
                anchor["label"]
            ),

            "x": x,
            "y": y,

            "seeds": (
                anchor.get(
                    "seeds",
                    [],
                )
            ),
        })

    return {
        "postCount": data.get("post_count", 0),
        "layoutEdges": data.get("layout_edges", []),
        "siteUrl": (
            SITE_URL.rstrip(
                "/"
            )
        ),

        "methodology": (
            data.get(
                "methodology",
                {},
            )
        ),

        "copy": {
            "it": semantic_map_copy("it"),
            "en": semantic_map_copy("en"),
        },

        "nodes": (
            node_payload
        ),

        "edges": [
            {
                "source": (
                    edge[
                        "source"
                    ]
                ),

                "target": (
                    edge[
                        "target"
                    ]
                ),

                "strength": (
                    edge.get(
                        "strength",
                        0.0,
                    )
                ),
            }
            for edge
            in data.get(
                "edges",
                [],
            )
        ],

        "anchors": [],

        "brainPaths": (
            brain_asset[
                "paths"
            ]
        ),

        "brainPathTransform": (
            brain_asset[
                "path_transform"
            ]
        ),

        "brainViewBox": {
            "minX": (
                brain_asset[
                    "min_x"
                ]
            ),

            "minY": (
                brain_asset[
                    "min_y"
                ]
            ),

            "width": (
                brain_asset[
                    "width"
                ]
            ),

            "height": (
                brain_asset[
                    "height"
                ]
            ),
        },

        "brainBounds": {
            "xRadius": (
                BRAIN_X_RADIUS
            ),

            "yRadius": (
                BRAIN_Y_RADIUS
            ),
        },

        "initialWidth": (
            INITIAL_X_RANGE[1]
            -
            INITIAL_X_RANGE[0]
        ),

        "colors": {
            "background": (
                BACKGROUND
            ),

            "surface": (
                SURFACE
            ),

            "text": (
                TEXT
            ),

            "muted": (
                MUTED
            ),

            "primary": (
                PRIMARY
            ),

            "border": (
                BORDER
            ),

            "neural": (
                NEURAL_COLOR
            ),

            "pulse": (
                NEURAL_PULSE
            ),

            "brain": (
                BRAIN_COLOR
            ),

            "ambientPalette": (
                AMBIENT_PALETTE
            ),
        },
    }


def build_post_script(
    data,
    brain_asset,
):
    config = (
        json.dumps(
            build_javascript_config(
                data,
                brain_asset,
            ),
            ensure_ascii=False,
        )
    )

    return (
        "window.__PRINT_HUMAN_MAP_CONFIG__ = "
        +
        config
        +
        ";\n"
        +
        load_javascript_bundle()
    )


# Figure


def build_figure(
    data,
    brain_asset,
):
    nodes = data.get(
        "nodes",
        [],
    )

    anchors = (
        ordered_anchors(
            data
        )
    )

    node_lookup = (
        build_node_lookup(
            data
        )
    )

    anchor_lookup = (
        build_anchor_lookup(
            data
        )
    )

    figure = go.Figure()

    add_background_layers(
        figure,
        brain_asset,
    )

    add_tag_edges(
        figure,
        data,
        node_lookup,
    )

    add_tag_nodes(
        figure,
        nodes,
    )

    add_highlight_traces(
        figure
    )

    figure.update_layout(
        title={
            "text": (
                'print("human") — '
                'semantic map lab'
            ),

            "x": 0.025,

            "xanchor": "left",

            "font": {
                "size": 20,
                "color": TEXT,
            },
        },

        paper_bgcolor=BACKGROUND,

        plot_bgcolor=BACKGROUND,

        font={
            "family": (
                "JetBrains Mono, "
                "Fira Code, "
                "IBM Plex Mono, "
                "monospace"
            ),

            "color": TEXT,
        },

        height=720,

        margin={
            "l": 48,
            "r": 48,
            "t": 68,
            "b": 48,
        },

        hovermode="closest",

        dragmode="pan",

        showlegend=False,

        uirevision=(
            "semantic-map"
        ),
    )

    figure.update_xaxes(
        visible=False,

        showgrid=False,

        zeroline=False,

        fixedrange=False,

        range=(
            INITIAL_X_RANGE
        ),

        minallowed=(
            MAX_X_RANGE[0]
        ),

        maxallowed=(
            MAX_X_RANGE[1]
        ),
    )

    figure.update_yaxes(
        visible=False,

        showgrid=False,

        zeroline=False,

        fixedrange=False,

        range=(
            INITIAL_Y_RANGE
        ),

        minallowed=(
            MAX_Y_RANGE[0]
        ),

        maxallowed=(
            MAX_Y_RANGE[1]
        ),

        scaleanchor="x",

        scaleratio=1,
    )

    return figure


# Main


def main():
    args = parse_args()

    input_path = (
        args.input.resolve()
    )

    output_path = (
        args.output.resolve()
    )

    data = load_map(
        input_path
    )

    brain_asset = (
        load_brain_asset()
    )

    figure = build_figure(
        data,
        brain_asset,
    )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    pio.write_html(
        figure,

        file=str(
            output_path
        ),

        include_plotlyjs=True,

        full_html=True,

        auto_open=(
            args.open
        ),

        post_script=(
            build_post_script(
                data,
                brain_asset,
            )
        ),

        config={
            "displaylogo": False,

            "responsive": True,

            "scrollZoom": True,

            "showTips": False,
        },
    )

    print()

    print(
        'print("human") '
        'semantic map preview'
    )

    print(
        "=" * 72
    )

    print(
        f'Posts: '
        f'{data.get("post_count", 0)}'
    )

    print(
        f'Tags:  '
        f'{data.get("tag_count", 0)}'
    )

    print()

    print(
        "HTML saved to:"
    )

    print(
        output_path
    )

    if args.open:
        print()

        print(
            "Opening preview "
            "in the browser..."
        )


if __name__ == "__main__":
    main()
