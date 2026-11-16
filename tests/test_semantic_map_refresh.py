import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from scripts.preview_semantic_map import render_preview
from src import semantic_map_state as state
from src.config import ROME
from src.map_embeddings import MODEL_NAME
from src import semantic_map_page as page


def post(slug, *tags):
    return {"meta": {"slug": slug, "tags": list(tags)}}


class SemanticMapRefreshTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        root = Path(self.scratch.name)
        self.prebuilt = root / "prebuilt"
        self.runtime = root / "runtime"
        self.prebuilt.mkdir()
        self.visible = [post("first", "life")]
        self.all_posts = self.visible + [post("scheduled", "care")]
        terms = {tag: [float(index == position) for index in range(50)]
                 for position, tag in enumerate(("life", "care", "work"))}
        (self.prebuilt / "semantic_map_vectors.json").write_text(
            json.dumps({"model": MODEL_NAME, "terms": terms}), encoding="utf-8")
        for name, value in (("PREBUILT_DIR", self.prebuilt), ("RUNTIME_DIR", self.runtime)):
            guard = patch.object(state, name, value)
            guard.start()
            self.addCleanup(guard.stop)
        self.posts_guard = patch.object(state, "load_posts", side_effect=lambda include_future=False:
                                        self.all_posts if include_future else self.visible)
        self.posts_guard.start()
        self.addCleanup(self.posts_guard.stop)
        self.model_guard = patch("src.map_embeddings.load_embedding_model",
                                 side_effect=AssertionError("Known tags must not load the full model"))
        self.model = self.model_guard.start()
        self.addCleanup(self.model_guard.stop)

    def store_prebuilt(self, posts=None):
        posts = self.visible if posts is None else posts
        vectors = state.vectors_for_posts(self.all_posts, self.prebuilt)
        data = state.build_map_data(posts, vectors)
        html = render_preview(data)
        (self.prebuilt / "semantic_map.json").write_text(json.dumps(data), encoding="utf-8")
        (self.prebuilt / "semantic_map_preview.html").write_text(html, encoding="utf-8")
        return state.MapSnapshot(data, html)

    def test_current_prebuilt_map_is_served_without_rebuilding(self):
        expected = self.store_prebuilt()
        with patch.object(state, "build_map_data", side_effect=AssertionError("Unexpected rebuild")):
            actual = state.load_current_map()
        self.assertEqual(actual.signature, expected.signature)
        self.assertFalse(self.runtime.exists())

    def test_a_new_post_repairs_a_stale_map_without_waiting_for_ci(self):
        before = self.store_prebuilt()
        self.visible.append(post("second", "care"))
        actual = state.load_current_map()
        self.assertEqual(actual.data["post_count"], 2)
        self.assertEqual({node["tag"] for node in actual.data["nodes"]}, {"life", "care"})
        self.assertNotEqual(actual.signature, before.signature)
        self.assertEqual((self.prebuilt / "semantic_map_preview.html").read_text(encoding="utf-8"), before.html)
        self.model.assert_not_called()

    def test_changed_tags_are_detected_even_when_the_post_count_is_unchanged(self):
        before = self.store_prebuilt()
        self.visible = [post("first", "work")]
        actual = state.load_current_map()
        self.assertEqual(actual.data["post_count"], 1)
        self.assertEqual([node["tag"] for node in actual.data["nodes"]], ["work"])
        self.assertNotEqual(actual.signature, before.signature)

    def test_removed_posts_are_removed_from_the_map(self):
        self.visible.append(post("second", "care"))
        self.store_prebuilt()
        self.visible = self.visible[:1]
        self.assertEqual(state.load_current_map().data["post_count"], 1)

    def test_preview_mode_does_not_leak_scheduled_posts_into_the_public_map(self):
        self.store_prebuilt()
        future = state.load_current_map(include_future=True)
        public = state.load_current_map()
        self.assertEqual(future.data["post_count"], 2)
        self.assertEqual(public.data["post_count"], 1)
        self.assertNotEqual(future.signature, public.signature)

    def test_a_missing_or_corrupt_artifact_is_rebuilt(self):
        for damage in ("json", "html", "signature"):
            with self.subTest(damage=damage):
                self.store_prebuilt()
                if damage == "json":
                    (self.prebuilt / "semantic_map.json").write_text("{", encoding="utf-8")
                elif damage == "html":
                    (self.prebuilt / "semantic_map_preview.html").unlink()
                else:
                    (self.prebuilt / "semantic_map_preview.html").write_text(
                        '<html>"sourceSignature":"outdated"</html>', encoding="utf-8")
                with tempfile.TemporaryDirectory() as cache, patch.object(state, "RUNTIME_DIR", Path(cache)):
                    actual = state.load_current_map()
                self.assertEqual(actual.data["post_count"], 1)
                self.assertIn(actual.signature, actual.html)

    def test_a_cached_runtime_repair_is_reused_without_rebuilding(self):
        repaired = state.load_current_map()
        with patch.object(state, "build_map_data", side_effect=AssertionError("Repeated rebuild")):
            self.assertEqual(state.load_current_map().html, repaired.html)

    def test_concurrent_sessions_share_one_rebuild(self):
        with patch.object(state, "build_map_data", wraps=state.build_map_data) as build:
            with ThreadPoolExecutor(max_workers=4) as pool:
                snapshots = list(pool.map(lambda _: state.load_current_map(), range(4)))
        self.assertEqual(build.call_count, 1)
        self.assertEqual(len({snapshot.signature for snapshot in snapshots}), 1)

    def test_rebuild_failure_never_silently_returns_an_old_map(self):
        self.store_prebuilt()
        self.visible.append(post("second", "care"))
        with patch.object(state, "build_map_data", side_effect=RuntimeError("Build unavailable")):
            with self.assertRaisesRegex(RuntimeError, "Build unavailable"):
                state.load_current_map()
        self.assertFalse((self.runtime / "semantic_map.json").exists())
        self.assertEqual(state.load_current_map().data["post_count"], 2)

    def test_a_new_uncached_tag_extracts_its_vector_once(self):
        self.visible = [post("new", "trust")]
        self.model.side_effect = None
        self.model.return_value = {"trust": [1.0] * 50}
        first = state.load_current_map()
        second = state.load_current_map()
        self.assertEqual([node["tag"] for node in first.data["nodes"]], ["trust"])
        self.assertEqual(first.signature, second.signature)
        self.model.assert_called_once()

    def test_unknown_vocabulary_is_cached_without_repeated_model_downloads(self):
        self.visible = [post("new", "unresolvable")]
        self.model.side_effect = None
        self.model.return_value = {}
        first = state.load_current_map()
        state.load_current_map()
        self.assertEqual(first.data["unresolved_tags"], ["unresolvable"])
        self.model.assert_called_once()

    def test_publication_at_rome_midnight_refreshes_without_a_git_commit(self):
        self.posts_guard.stop()
        posts_dir = self.prebuilt / "posts"
        (posts_dir / "it").mkdir(parents=True)
        for slug, day, tag in (("available", "2026-11-01", "life"), ("scheduled", "2026-12-01", "care")):
            (posts_dir / "it" / f"{slug}.md").write_text(
                f"---\nslug: {slug}\ndate: {day}\npublished: true\ntags: [{tag}]\n---\nText.",
                encoding="utf-8")
        with patch("src.posts.POSTS_DIR", posts_dir), patch("src.posts.datetime") as clock:
            clock.now.return_value = datetime(2026, 11, 30, 23, 59, 59, tzinfo=ROME)
            before = state.load_current_map()
            clock.now.return_value = datetime(2026, 12, 1, 0, 0, tzinfo=ROME)
            after = state.load_current_map()
            self.assertEqual(before.data["post_count"], 1)
            self.assertEqual(after.data["post_count"], 2)
            self.assertNotEqual(before.signature, after.signature)
            clock.now.assert_called_with(ROME)
        self.model.assert_not_called()


class PublicationWatcherTests(unittest.TestCase):
    def test_unchanged_data_does_not_reload_the_map_or_reset_selection(self):
        with patch.object(page, "current_source_signature", return_value="same"), patch.object(page.st, "rerun") as rerun:
            page.watch_publications.__wrapped__("same")
        rerun.assert_not_called()

    def test_a_new_publication_triggers_a_full_refresh(self):
        with patch.object(page, "current_source_signature", return_value="new"), patch.object(page.st, "rerun") as rerun:
            page.watch_publications.__wrapped__("old")
        rerun.assert_called_once_with()

    def test_a_failed_rebuild_retries_at_the_interval_without_an_immediate_loop(self):
        with patch.object(page.time, "monotonic", return_value=10), patch.object(page.st, "rerun") as rerun:
            page.watch_publications.__wrapped__(None, retry_at=70)
            rerun.assert_not_called()
            with patch.object(page.time, "monotonic", return_value=70):
                page.watch_publications.__wrapped__(None, retry_at=70)
            rerun.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
