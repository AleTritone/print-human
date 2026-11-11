import unittest
from unittest.mock import patch

from src.i18n import ui
from src.posts import filter_posts


class PostFilterTests(unittest.TestCase):
    def setUp(self):
        self.posts = [
            {
                "meta": {"title": "Care", "tags": ["care", "life"]},
                "body": "A shared home.",
            },
            {
                "meta": {"title": "Peace", "tags": ["peace"]},
                "body": "Another idea.",
            },
        ]

    def test_default_sidebar_option_shows_all_posts_in_each_language(self):
        for language in ("it", "en"):
            with self.subTest(language=language):
                self.assertEqual(
                    filter_posts(
                        self.posts,
                        tag=ui(language, "all_tags"),
                        language=language,
                    ),
                    self.posts,
                )

    def test_all_option_follows_the_translation(self):
        with patch("src.posts.ui", return_value="Qualsiasi idea"):
            self.assertEqual(
                filter_posts(self.posts, tag="Qualsiasi idea"),
                self.posts,
            )

    def test_empty_and_legacy_all_options_still_show_all_posts(self):
        for tag in (None, "", "(tutti)", "(all)"):
            with self.subTest(tag=tag):
                self.assertEqual(filter_posts(self.posts, tag=tag), self.posts)

    def test_a_real_tag_still_filters_posts(self):
        self.assertEqual(filter_posts(self.posts, tag="care"), self.posts[:1])

    def test_search_is_applied_with_the_localized_all_option(self):
        self.assertEqual(
            filter_posts(self.posts, search="HOME", tag=ui("it", "all_tags")),
            self.posts[:1],
        )


if __name__ == "__main__":
    unittest.main()
