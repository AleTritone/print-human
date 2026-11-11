# Semantic map

The map represents relationships between the tags assigned to publications in
print(human). Word similarity and publication co-occurrence determine affinity,
layout, circuits and exploration paths.

## Layout affinity

GloVe vectors provide general-language similarity. Publication co-occurrence
adds a corpus-specific signal:

```text
G = cosine similarity, limited to [0, 1]
J = shared publications / publications containing either idea
C = 1 - exp(-shared publications / 2)
P = G + 0.65 * J * C * (1 - G)
d = sqrt(max(2 * (1 - P), 1e-9))
```

J normalizes overlap by the size of the publication sets. C increases with
repeated co-occurrence and approaches 1. P is the final affinity; d is the target
distance used by the layout.

Word vectors determine placement. For vocabulary gaps, publication context
provides a vector when co-occurring ideas have usable linguistic vectors.

## Geography and circuits

1. Each idea selects its nearest neighbours by hybrid affinity. The neighbour
   count is the rounded square root of the number of eligible ideas, limited to
   2–6 and at most N - 1. A pair enters the undirected graph if either idea selects
   the other. Fewer than two eligible ideas produce no links.
2. Greedy modularity optimization identifies communities, displayed as circuits.
3. Weighted metric MDS with SMACOF projects target distances into two dimensions.
   High-affinity pairs and repeated co-occurrences receive larger stress weights.
4. Bounded translations separate overlapping circuit regions while preserving
   relative positions within each circuit.
5. Core selection combines normalized internal degree, weighted closeness and
   intensity. Ideas scoring at least 94% of the best circuit score qualify;
   at most three become cores, ordered by score and tag.
6. Deterministic orientation and uniform scaling fit the coordinates into the
   brain boundary. Compass directions do not carry semantic meaning.

The complete layout graph is stored in `layout_edges`. Per-node neighbour lists
contain only the strongest links. When `layout_edges` is absent, circuit
inspection accepts the union of neighbour lists only if node degrees and weight
sums confirm that it is complete.

## Interaction graph

Links and flow exploration use vectors combining linguistic semantics and
publication context:

```text
interaction vector = normalize(0.70 * word vector + 0.30 * context vector)
strength = max(0.01, 0.80 * max(0, cosine similarity) + 0.20 * Jaccard)
```

A link is retained when enriched cosine similarity is at least 0.35 or the pair
shares a publication. Selecting an idea builds an exploration tree from these
links and leaves the layout coordinates fixed.

## Labels and explanations

Intensity combines normalized publication recurrence and direct connection
count through a geometric mean, mapped to the 1–5 scale. Label priority combines
normalized recurrence, weighted degree and unweighted betweenness with weights
0.45, 0.35 and 0.20.

Label brightness uses aggregate layout affinity: the sum of incident edge weights
divided by the largest sum in the map, raised to the power 0.72. This visual signal
controls label treatment and glow.

Each parameter opens a localized explanation with formulas, symbol definitions,
charts and examples for the selected idea. Flow explanations share the tree and
load calculations used by the map. Qualitative bands follow the displayed
two-decimal values.

- Translations: `locales/semantic_map_it.json` and `locales/semantic_map_en.json`.
- Explanation renderer: `assets/semantic_map_explanations.js`.
- Map data: `data/semantic_map.json`.
- Browser preview: `data/semantic_map_preview.html`.

## Commands

GitHub Actions rebuilds both the JSON data and HTML map on every push to `main`
and during the existing daily run at 02:15 UTC (03:15 in Rome in winter, 04:15
in summer). Only published posts whose date has arrived are included, using the
same Italian source and Europe/Rome date filter as the blog. Changed map files
are committed back to `main` so Streamlit can display them. Word vectors are
cached between runs; unchanged maps do not create a commit.

With the project requirements and GloVe model available:

```bash
python scripts/build_semantic_map.py
python scripts/preview_semantic_map.py
```

Use `--include-future` only for a local preview of scheduled publications.
The HTML loads its versioned Plotly library from the CDN and requires an
internet connection. The library is cached by the browser instead of being
sent inside Streamlit's WebSocket on every map visit.

For UI or translation changes, update the preview bundle while retaining its
embedded figure and coordinates:

```bash
node scripts/sync_semantic_map_ui.cjs
```

The sync command checks that the data and preview agree and validates the
embedded JavaScript before writing.

```bash
node --test tests/semantic_map_explanations.test.cjs
python -m unittest discover -s tests -p "test_*.py"
```
