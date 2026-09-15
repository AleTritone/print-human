from datetime import datetime

import frontmatter

from src.config import POSTS_DIR, ROME
from src.utils import (
    normalize_published,
    normalize_tags,
    parse_date_any,
    read_text_any
)


def load_posts(include_future: bool = False) -> list[dict]:
    posts = []

    if not POSTS_DIR.exists():
        return posts

    for path in sorted(POSTS_DIR.glob("*.md")):
        try:
            post = frontmatter.loads(
                read_text_any(path)
            )

            meta = dict(post.metadata)

            post_date = parse_date_any(
                meta.get("date")
            )

            if post_date is None:
                post_date = datetime.fromtimestamp(
                    path.stat().st_mtime,
                    tz=ROME
                ).date()

            title = str(
                meta.get("title", "")
            ).strip()

            if not title:
                title = (
                    path.stem
                    .replace("-", " ")
                    .replace("_", " ")
                    .title()
                )

            meta["title"] = title

            meta["slug"] = (
                str(meta.get("slug", "")).strip()
                or path.stem
            )

            meta["date"] = post_date

            meta["summary"] = str(
                meta.get("summary", "")
            ).strip()

            meta["featured_line"] = str(
                meta.get("featured_line", "")
            ).strip()

            meta["translation"] = str(
                meta.get("translation", "")
            ).strip()

            meta["reflection"] = str(
                meta.get("reflection", "")
            ).strip()

            meta["tags"] = normalize_tags(
                meta.get("tags")
            )

            meta["published"] = normalize_published(
                meta.get("published", True)
            )

            posts.append({
                "meta": meta,
                "body": post.content,
                "path": path
            })

        except Exception:
            continue

    today = datetime.now(ROME).date()

    posts = [
        post
        for post in posts
        if post["meta"]["published"]
        and (
            include_future
            or post["meta"]["date"] <= today
        )
    ]

    posts.sort(
        key=lambda post: post["meta"]["date"],
        reverse=True
    )

    return posts


def get_all_tags(posts: list[dict]) -> list[str]:
    return sorted(
        {
            tag
            for post in posts
            for tag in post["meta"]["tags"]
        },
        key=str.lower
    )


def find_post_by_slug(
    posts: list[dict],
    slug: str
) -> dict | None:
    return next(
        (
            post
            for post in posts
            if post["meta"]["slug"] == slug
        ),
        None
    )


def filter_posts(
    posts: list[dict],
    search: str | None = None,
    tag: str | None = None
) -> list[dict]:

    result = posts

    if tag and tag != "(tutti)":
        result = [
            post
            for post in result
            if tag in post["meta"]["tags"]
        ]

    if search:
        query = search.casefold()

        result = [
            post
            for post in result
            if (
                query in post["meta"]["title"].casefold()
                or query in post["body"].casefold()
                or query in post["meta"]["summary"].casefold()
                or query in post["meta"]["featured_line"].casefold()
                or query in post["meta"]["translation"].casefold()
                or query in post["meta"]["reflection"].casefold()
                or any(
                    query in item.casefold()
                    for item in post["meta"]["tags"]
                )
            )
        ]

    return result