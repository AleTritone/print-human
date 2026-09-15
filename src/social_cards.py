import os
import time
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFont

from src.config import SOCIAL_DIR
from src.utils import format_date_it


WIDTH = 1200
HEIGHT = 630

BG = "#0D1117"
SURFACE = "#10161F"
BORDER = "#29313A"
TEXT = "#E6EDF3"
MUTED = "#8B949E"
PRIMARY = "#71C7A6"
CODE_BG = "#161B22"


def load_font(size: int, bold: bool = False):
    if bold:
        candidates = (
            "C:/Windows/Fonts/consolab.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
            "DejaVuSansMono-Bold.ttf",
        )
    else:
        candidates = (
            "C:/Windows/Fonts/consola.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "DejaVuSansMono.ttf",
        )

    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass

    return ImageFont.load_default()


def text_width(draw, text, font):
    box = draw.textbbox(
        (0, 0),
        text,
        font=font
    )

    return box[2] - box[0]


def line_height(draw, font):
    box = draw.textbbox(
        (0, 0),
        "Ag",
        font=font
    )

    return box[3] - box[1] + 10


def wrap_text(draw, text, font, max_width):
    lines = []

    for paragraph in text.splitlines():
        paragraph = paragraph.strip()

        if not paragraph:
            continue

        current = ""

        for word in paragraph.split():
            candidate = f"{current} {word}".strip()

            if text_width(draw, candidate, font) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)

                current = word

        if current:
            lines.append(current)

    return lines


def truncate_lines(lines, maximum):
    if len(lines) <= maximum:
        return lines

    lines = lines[:maximum]
    lines[-1] = lines[-1].rstrip(" .,:;-") + "…"

    return lines


def draw_lines(draw, x, y, lines, font, color):
    height = line_height(draw, font)

    for line in lines:
        draw.text(
            (x, y),
            line,
            font=font,
            fill=color
        )
        y += height

    return y


def filename_from_slug(slug: str) -> str:
    value = "".join(
        char if char.isalnum() or char in "-_" else "-"
        for char in slug.lower()
    )

    value = value.replace("_", "-").strip("-")

    return f"{value or 'post'}.png"


def social_card_path(post: dict) -> Path:
    slug = post["meta"]["slug"]
    return SOCIAL_DIR / filename_from_slug(slug)


def card_needs_update(post: dict, output: Path) -> bool:
    if not output.exists():
        return True

    generator_mtime = Path(__file__).stat().st_mtime
    post_mtime = post["path"].stat().st_mtime
    output_mtime = output.stat().st_mtime

    return max(generator_mtime, post_mtime) > output_mtime


def save_image(image: Image.Image, output: Path) -> None:
    output.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    temporary = output.with_name(
        f".{output.stem}.{uuid4().hex}.tmp.png"
    )

    image.save(
        str(temporary),
        format="PNG"
    )

    last_error = None

    for _ in range(6):
        try:
            os.replace(
                str(temporary),
                str(output)
            )
            return
        except OSError as error:
            last_error = error
            time.sleep(0.15)

    if temporary.exists():
        temporary.unlink()

    if output.exists():
        return

    raise last_error


def generate_social_card(post: dict, output: Path) -> None:
    meta = post["meta"]

    image = Image.new(
        "RGB",
        (WIDTH, HEIGHT),
        BG
    )

    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle(
        (
            32,
            32,
            WIDTH - 32,
            HEIGHT - 32
        ),
        radius=24,
        fill=SURFACE,
        outline=BORDER,
        width=2
    )

    title_font = load_font(46, bold=True)
    date_font = load_font(22)
    code_font = load_font(27)
    summary_font = load_font(27)
    translation_font = load_font(21)
    signature_font = load_font(25)

    left = 76
    right = WIDTH - 76
    max_width = right - left

    y = 76

    title_lines = truncate_lines(
        wrap_text(
            draw,
            meta["title"],
            title_font,
            max_width
        ),
        2
    )

    y = draw_lines(
        draw,
        left,
        y,
        title_lines,
        title_font,
        PRIMARY
    )

    y += 4

    draw.text(
        (left, y),
        format_date_it(meta["date"]),
        font=date_font,
        fill=MUTED
    )

    y += line_height(draw, date_font) + 46

    featured = meta.get("featured_line", "").strip()

    if featured:
        code_lines = truncate_lines(
            wrap_text(
                draw,
                featured,
                code_font,
                max_width - 36
            ),
            2
        )

        code_line_height = line_height(draw, code_font)

        code_height = (
            len(code_lines) * code_line_height
            + 22
        )

        widest = max(
            text_width(draw, line, code_font)
            for line in code_lines
        )

        code_width = min(
            widest + 36,
            max_width
        )

        draw.rounded_rectangle(
            (
                left,
                y,
                left + code_width,
                y + code_height
            ),
            radius=9,
            fill=CODE_BG,
            outline=BORDER,
            width=1
        )

        draw_lines(
            draw,
            left + 18,
            y + 11,
            code_lines,
            code_font,
            TEXT
        )

        y += code_height

    y += 52

    marker_x = left
    content_x = left + 26
    content_width = right - content_x

    summary_text = meta.get("summary", "").strip()
    translation_text = meta.get("translation", "").strip()

    summary_lines = truncate_lines(
        wrap_text(
            draw,
            summary_text,
            summary_font,
            content_width
        ),
        3
    )

    summary_line_height = line_height(draw, summary_font)
    summary_height = len(summary_lines) * summary_line_height

    translation_lines = []
    translation_height = 0
    translation_gap = 0

    if translation_text:
        translation_lines = truncate_lines(
            wrap_text(
                draw,
                translation_text,
                translation_font,
                content_width
            ),
            2
        )

        translation_line_height = line_height(draw, translation_font)
        translation_height = len(translation_lines) * translation_line_height
        translation_gap = 18
    else:
        translation_line_height = line_height(draw, translation_font)

    marker_height = summary_height + translation_gap + translation_height

    draw.rounded_rectangle(
        (
            marker_x,
            y,
            marker_x + 4,
            y + marker_height - 6
        ),
        radius=2,
        fill=PRIMARY
    )

    content_y = draw_lines(
        draw,
        content_x,
        y,
        summary_lines,
        summary_font,
        TEXT
    )

    if translation_lines:
        content_y += translation_gap

        content_y = draw_lines(
            draw,
            content_x,
            content_y,
            translation_lines,
            translation_font,
            MUTED
        )

    signature_y = content_y + 26

    signature_line_1 = "life is a line"
    signature_line_2 = 'print("human")'

    signature_right_anchor = right - 70

    signature_1_x = signature_right_anchor - text_width(
        draw,
        signature_line_1,
        signature_font
    )

    signature_2_x = signature_right_anchor - text_width(
        draw,
        signature_line_2,
        signature_font
    )

    draw.text(
        (
            signature_1_x,
            signature_y
        ),
        signature_line_1,
        font=signature_font,
        fill=MUTED
    )

    signature_y += line_height(draw, signature_font) - 3

    draw.text(
        (
            signature_2_x,
            signature_y
        ),
        signature_line_2,
        font=signature_font,
        fill=PRIMARY
    )

    save_image(image, output)


def ensure_social_cards(posts: list[dict]) -> None:
    SOCIAL_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    for post in posts:
        output = social_card_path(post)

        if card_needs_update(post, output):
            generate_social_card(post, output)

        post["meta"]["social_card"] = output.name