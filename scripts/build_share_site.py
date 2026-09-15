import html
import shutil
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config import SITE_NAME, SITE_TAGLINE, SITE_URL
from src.posts import load_posts
from src.social_cards import ensure_social_cards, social_card_path


PAGES_URL = "https://aletritone.github.io/print-human"
OUTPUT_DIR = ROOT / "_site"


def escape(value) -> str:
    return html.escape(
        str(value),
        quote=True
    )


def post_url(slug: str) -> str:
    return f"{SITE_URL}/?p={quote(slug)}"


def share_url(slug: str) -> str:
    return f"{PAGES_URL}/share/{quote(slug)}/"


def social_image_url(filename: str) -> str:
    return f"{PAGES_URL}/social/{quote(filename)}"


def build_share_page(post: dict) -> str:
    meta = post["meta"]

    title = meta["title"]
    slug = meta["slug"]
    summary = (
        meta.get("summary", "").strip()
        or SITE_TAGLINE
    )

    card = social_card_path(post)

    destination = post_url(slug)
    public_share_url = share_url(slug)
    image_url = social_image_url(card.name)

    return f"""<!doctype html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>{escape(title)} · {escape(SITE_NAME)}</title>

    <meta name="description" content="{escape(summary)}">

    <meta property="og:type" content="article">
    <meta property="og:locale" content="it_IT">
    <meta property="og:site_name" content="{escape(SITE_NAME)}">
    <meta property="og:title" content="{escape(title)}">
    <meta property="og:description" content="{escape(summary)}">
    <meta property="og:url" content="{escape(public_share_url)}">
    <meta property="og:image" content="{escape(image_url)}">
    <meta property="og:image:secure_url" content="{escape(image_url)}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{escape(title)}">
    <meta name="twitter:description" content="{escape(summary)}">
    <meta name="twitter:image" content="{escape(image_url)}">

    <link rel="canonical" href="{escape(destination)}">

    <script>
        window.location.replace({destination!r});
    </script>
</head>
<body>
    <p>
        <a href="{escape(destination)}">
            Apri {escape(title)}
        </a>
    </p>
</body>
</html>
"""


def build_root_page() -> str:
    return f"""<!doctype html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>{escape(SITE_NAME)}</title>
    <meta name="description" content="{escape(SITE_TAGLINE)}">

    <script>
        window.location.replace({SITE_URL!r});
    </script>
</head>
<body>
    <p>
        <a href="{escape(SITE_URL)}">
            Apri {escape(SITE_NAME)}
        </a>
    </p>
</body>
</html>
"""


def build_site() -> None:
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    posts = load_posts()

    ensure_social_cards(posts)

    social_output = OUTPUT_DIR / "social"
    social_output.mkdir(
        parents=True,
        exist_ok=True
    )

    for post in posts:
        source = social_card_path(post)

        shutil.copy2(
            source,
            social_output / source.name
        )

        slug = post["meta"]["slug"]

        page_dir = (
            OUTPUT_DIR
            / "share"
            / slug
        )

        page_dir.mkdir(
            parents=True,
            exist_ok=True
        )

        page = build_share_page(post)

        (
            page_dir
            / "index.html"
        ).write_text(
            page,
            encoding="utf-8"
        )

    (
        OUTPUT_DIR
        / "index.html"
    ).write_text(
        build_root_page(),
        encoding="utf-8"
    )

    (
        OUTPUT_DIR
        / ".nojekyll"
    ).write_text(
        "",
        encoding="utf-8"
    )

    print(
        f"Generated {len(posts)} share pages."
    )

    for post in posts:
        slug = post["meta"]["slug"]
        print(share_url(slug))


if __name__ == "__main__":
    build_site()