import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from src.config import BASE, ROME
from src.map_anchors import MAP_EXCLUDED_TAGS
from src.posts import load_posts


class SemanticMapPublicationTests(unittest.TestCase):
    def test_generated_map_matches_the_published_corpus(self):
        posts = load_posts()
        data = json.loads((BASE / "data" / "semantic_map.json").read_text(encoding="utf-8"))
        expected = {}
        for post in posts:
            for tag in post["meta"]["tags"]:
                tag = tag.strip().lower()
                if tag and tag not in MAP_EXCLUDED_TAGS:
                    expected.setdefault(tag, set()).add(post["meta"]["slug"])

        self.assertEqual(data["post_count"], len(posts), "Rebuild the semantic map after changing posts.")
        self.assertEqual(
            {node["tag"]: set(node["posts"]) for node in data["nodes"]},
            expected,
            "The map must contain exactly the tags and references of published posts.",
        )

    def test_scheduled_posts_enter_the_build_only_when_their_date_arrives(self):
        today = datetime.now(ROME).date()
        tomorrow = today + timedelta(days=1)
        with tempfile.TemporaryDirectory() as directory:
            posts_dir = Path(directory)
            italian = posts_dir / "it"
            italian.mkdir()
            for slug, date, published in (
                ("available", today, "true"),
                ("scheduled", tomorrow, "true"),
                ("draft", today, "false"),
            ):
                (italian / f"{slug}.md").write_text(
                    f"---\ntitle: {slug}\nslug: {slug}\ndate: {date}\n"
                    f"published: {published}\ntags: [life]\n---\nContent.\n",
                    encoding="utf-8",
                )

            with patch("src.posts.POSTS_DIR", posts_dir):
                self.assertEqual([post["meta"]["slug"] for post in load_posts()], ["available"])
                with patch("src.posts.datetime") as clock:
                    clock.now.return_value = datetime.combine(tomorrow, datetime.min.time(), tzinfo=ROME)
                    self.assertEqual(
                        {post["meta"]["slug"] for post in load_posts()},
                        {"available", "scheduled"},
                    )


if __name__ == "__main__":
    unittest.main()
