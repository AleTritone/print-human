import json
import unittest

from scripts.preview_semantic_map import (
    build_figure,
    build_javascript_config,
    load_brain_asset,
)
from src.config import BASE


class SemanticMapRenderingTests(unittest.TestCase):
    def test_connections_are_delegated_to_the_neural_tree_renderer(self):
        data = json.loads((BASE / "data" / "semantic_map.json").read_text(encoding="utf-8"))
        brain = load_brain_asset()
        figure = build_figure(data, brain)
        config = build_javascript_config(data, brain)

        # The graph remains available to construct the selected idea's tree,
        # but must never be plotted as a mesh of every association.
        self.assertGreater(len(data["edges"]), len(data["nodes"]))
        self.assertEqual(len(config["edges"]), len(data["edges"]))
        self.assertTrue(any((trace.meta or {}).get("layer") == "node" for trace in figure.data))
        self.assertFalse(any((trace.meta or {}).get("layer") == "tag-edge" for trace in figure.data))
        self.assertFalse(any(trace.mode == "lines" for trace in figure.data))


if __name__ == "__main__":
    unittest.main()
