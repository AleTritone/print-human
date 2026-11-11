import hashlib
import math
from collections import defaultdict
from itertools import combinations

import networkx as nx
import numpy as np

from src.map_anchors import MAP_EXCLUDED_TAGS
from src.map_embeddings import (
    MODEL_NAME,
    cosine_similarity,
    vector_for_term,
)
from src.map_visibility import (
    LABEL_PRIORITY_BETWEENNESS_WEIGHT,
    LABEL_PRIORITY_DEGREE_WEIGHT,
    LABEL_PRIORITY_FREQUENCY_WEIGHT,
    VISIBILITY_LEVEL_COUNT,
    assign_base_visibility_levels,
    calculate_label_priorities,
    resolve_visibility_collisions,
)


# Interaction vectors combine word semantics and publication context.
BASE_VECTOR_WEIGHT = 0.70
CONTEXT_VECTOR_WEIGHT = 0.30
SEMANTIC_WEIGHT = 0.80
COOCCURRENCE_WEIGHT = 0.20
SEMANTIC_EDGE_THRESHOLD = 0.35
INTENSITY_SCALE_MIN = 1.0
INTENSITY_SCALE_RANGE = 4.0

# Layout affinity combines GloVe similarity with evidence-weighted co-occurrence.
LAYOUT_KNN_MIN = 2
LAYOUT_KNN_MAX = 6
LAYOUT_CORPUS_MAX_BOOST = 0.65
LAYOUT_CORPUS_CONFIDENCE_SCALE = 2.0
LAYOUT_STRESS_BASE_WEIGHT = 0.20
LAYOUT_STRESS_AFFINITY_WEIGHT = 2.80
LAYOUT_STRESS_CORPUS_WEIGHT = 1.60
LAYOUT_SMACOF_MAX_ITER = 300
LAYOUT_SMACOF_TOL = 1e-7
SYSTEM_COLLISION_PADDING_RATIO = 0.10
SYSTEM_COLLISION_MAX_SHIFT_RATIO = 0.12
SYSTEM_COLLISION_ITERATIONS = 16
CORE_SCORE_RATIO = 0.94
MAX_SYSTEM_CORES = 3
PILLOW_ATTRACTION_VISUAL_EXPONENT = 0.72

SEMANTIC_X_SCALE = 1.15
SEMANTIC_Y_SCALE = 0.82
TAG_BOUNDARY_SCALE = 0.86
LAYOUT_COMPACTNESS = 0.82


def normalize_tag(tag):
    return str(tag).strip().lower()


def normalize_vector(vector):
    if vector is None:
        return None

    vector = np.asarray(vector, dtype=float)
    norm = np.linalg.norm(vector)

    if norm == 0:
        return None

    return vector / norm


def deterministic_jitter(tag, scale=0.01):
    digest = hashlib.sha256(
        tag.encode("utf-8")
    ).digest()

    maximum = float(2**32 - 1)

    x = (
        int.from_bytes(digest[0:4], "big")
        / maximum
    ) * 2.0 - 1.0

    y = (
        int.from_bytes(digest[4:8], "big")
        / maximum
    ) * 2.0 - 1.0

    return np.array(
        [x * scale, y * scale],
        dtype=float,
    )


def collect_all_tag_usage(posts):
    tag_posts = defaultdict(set)

    for post in posts:
        slug = post["meta"]["slug"]

        tags = {
            normalize_tag(tag)
            for tag in post["meta"].get("tags", [])
            if normalize_tag(tag)
        }

        for tag in tags:
            tag_posts[tag].add(slug)

    return dict(tag_posts)


def collect_map_tag_usage(posts):
    return {
        tag: slugs
        for tag, slugs in collect_all_tag_usage(posts).items()
        if tag not in MAP_EXCLUDED_TAGS
    }


def collect_excluded_tag_usage(posts):
    return {
        tag: slugs
        for tag, slugs in collect_all_tag_usage(posts).items()
        if tag in MAP_EXCLUDED_TAGS
    }


def collect_cooccurrences(posts, allowed_tags):
    allowed_tags = set(allowed_tags)
    cooccurrences = defaultdict(int)

    for post in posts:
        tags = sorted({
            normalize_tag(tag)
            for tag in post["meta"].get("tags", [])
            if normalize_tag(tag) in allowed_tags
        })

        for a, b in combinations(tags, 2):
            cooccurrences[(a, b)] += 1

    return cooccurrences


def get_cooccurrence(cooccurrences, a, b):
    return cooccurrences.get(
        tuple(sorted((a, b))),
        0,
    )


def jaccard_cooccurrence(
    count,
    frequency_a,
    frequency_b,
):
    union = frequency_a + frequency_b - count

    return (
        0.0
        if union <= 0
        else count / union
    )


def build_base_vectors(model, tags):
    return {
        tag: vector_for_term(model, tag)
        for tag in tags
    }


def build_context_vectors(
    tag_usage,
    base_vectors,
    cooccurrences,
):
    context_vectors = {}
    context_sources = {}
    tags = sorted(tag_usage)

    for tag in tags:
        weighted_vectors = []
        sources = []

        for other_tag in tags:
            if other_tag == tag:
                continue

            other_vector = base_vectors.get(other_tag)

            if other_vector is None:
                continue

            count = get_cooccurrence(
                cooccurrences,
                tag,
                other_tag,
            )

            if count <= 0:
                continue

            jaccard = jaccard_cooccurrence(
                count,
                len(tag_usage[tag]),
                len(tag_usage[other_tag]),
            )

            normalized_other = normalize_vector(
                other_vector
            )

            if jaccard <= 0 or normalized_other is None:
                continue

            weighted_vectors.append(
                (normalized_other, jaccard)
            )

            sources.append({
                "tag": other_tag,
                "weight": jaccard,
                "cooccurrence": count,
            })

        if not weighted_vectors:
            context_vectors[tag] = None
            context_sources[tag] = []
            continue

        total_weight = sum(
            weight
            for _, weight in weighted_vectors
        )

        context_vector = sum(
            vector * weight
            for vector, weight in weighted_vectors
        ) / total_weight

        context_vectors[tag] = normalize_vector(
            context_vector
        )

        context_sources[tag] = sorted(
            sources,
            key=lambda item: item["weight"],
            reverse=True,
        )

    return context_vectors, context_sources


def combine_map_vectors(
    base_vectors,
    context_vectors,
):
    result = {}

    for tag in base_vectors:
        base = normalize_vector(
            base_vectors[tag]
        )
        context = normalize_vector(
            context_vectors.get(tag)
        )

        if base is None and context is None:
            result[tag] = None
        elif base is None:
            result[tag] = context
        elif context is None:
            result[tag] = base
        else:
            result[tag] = normalize_vector(
                BASE_VECTOR_WEIGHT * base
                + CONTEXT_VECTOR_WEIGHT * context
            )

    return result


def combined_affinity(
    semantic_similarity,
    cooccurrence_score,
):
    semantic = max(
        semantic_similarity or 0.0,
        0.0,
    )

    return (
        SEMANTIC_WEIGHT * semantic
        + COOCCURRENCE_WEIGHT * cooccurrence_score
    )


def build_tag_graph(
    tag_usage,
    map_vectors,
    cooccurrences,
):
    """Build the interaction graph for links and flow exploration."""
    graph = nx.Graph()
    tags = sorted(tag_usage)

    for tag in tags:
        graph.add_node(tag, kind="tag")

    for a, b in combinations(tags, 2):
        semantic = cosine_similarity(
            map_vectors[a],
            map_vectors[b],
        )

        count = get_cooccurrence(
            cooccurrences,
            a,
            b,
        )

        co_score = jaccard_cooccurrence(
            count,
            len(tag_usage[a]),
            len(tag_usage[b]),
        )

        affinity = combined_affinity(
            semantic,
            co_score,
        )

        semantic_passes = (
            semantic is not None
            and semantic >= SEMANTIC_EDGE_THRESHOLD
        )

        if not semantic_passes and count == 0:
            continue

        graph.add_edge(
            a,
            b,
            weight=max(affinity, 0.01),
            semantic=(
                semantic
                if semantic is not None
                else 0.0
            ),
            cooccurrence=count,
            cooccurrence_score=co_score,
        )

    return graph


def build_layout_vectors(
    base_vectors,
    context_vectors,
):
    """
    Use word vectors for placement, or publication context for vocabulary gaps.
    """
    result = {}

    for tag in base_vectors:
        base = normalize_vector(
            base_vectors.get(tag)
        )

        if base is not None:
            result[tag] = base
            continue

        result[tag] = normalize_vector(
            context_vectors.get(tag)
        )

    return result


def semantic_distance(a, b):
    a = normalize_vector(a)
    b = normalize_vector(b)

    if a is None or b is None:
        return None

    # Euclidean distance between unit vectors. It is monotonic with cosine
    # distance but is directly suitable for classical metric MDS.
    return float(
        np.linalg.norm(a - b)
    )


def corpus_confidence(cooccurrence_count):
    """
    Map shared-publication counts to a saturating confidence value in [0, 1].
    """
    count = max(float(cooccurrence_count), 0.0)

    if count <= 0:
        return 0.0

    return float(
        1.0
        - math.exp(
            -count / LAYOUT_CORPUS_CONFIDENCE_SCALE
        )
    )


def hybrid_layout_affinity(
    semantic_similarity,
    cooccurrence_score,
    cooccurrence_count,
):
    """
    Increase linguistic affinity according to normalized co-occurrence
    and confidence from repeated shared publications.
    """
    semantic = float(
        np.clip(
            semantic_similarity or 0.0,
            0.0,
            1.0,
        )
    )

    corpus = float(
        np.clip(
            cooccurrence_score or 0.0,
            0.0,
            1.0,
        )
    )

    confidence = corpus_confidence(
        cooccurrence_count
    )

    corpus_pull = (
        LAYOUT_CORPUS_MAX_BOOST
        * confidence
        * corpus
    )

    affinity = (
        semantic
        + corpus_pull * (1.0 - semantic)
    )

    return float(np.clip(affinity, 0.0, 1.0))


def hybrid_layout_distance(affinity):
    """
    Convert hybrid affinity to a positive target distance for metric MDS.
    """
    affinity = float(
        np.clip(affinity, 0.0, 1.0)
    )

    return float(
        math.sqrt(
            max(
                2.0 * (1.0 - affinity),
                1e-9,
            )
        )
    )


def hybrid_stress_weight(
    affinity,
    cooccurrence_score,
    cooccurrence_count,
):
    """
    Weight projection stress by affinity and repeated co-occurrence.
    """
    confidence = corpus_confidence(
        cooccurrence_count
    )

    return float(
        LAYOUT_STRESS_BASE_WEIGHT
        + LAYOUT_STRESS_AFFINITY_WEIGHT
        * (float(affinity) ** 2)
        + LAYOUT_STRESS_CORPUS_WEIGHT
        * confidence
        * float(cooccurrence_score)
    )


def build_layout_pair_metrics(
    tag_usage,
    layout_vectors,
    cooccurrences,
):
    metrics = {}
    tags = sorted(tag_usage)

    for a, b in combinations(tags, 2):
        semantic = cosine_similarity(
            layout_vectors.get(a),
            layout_vectors.get(b),
        )

        semantic_value = float(
            np.clip(
                semantic or 0.0,
                0.0,
                1.0,
            )
        )

        count = get_cooccurrence(
            cooccurrences,
            a,
            b,
        )

        co_score = jaccard_cooccurrence(
            count,
            len(tag_usage[a]),
            len(tag_usage[b]),
        )

        confidence = corpus_confidence(count)

        affinity = hybrid_layout_affinity(
            semantic_value,
            co_score,
            count,
        )

        metrics[(a, b)] = {
            "semantic": semantic_value,
            "cooccurrence": int(count),
            "cooccurrence_score": float(co_score),
            "corpus_confidence": confidence,
            "corpus_signal": float(co_score * confidence),
            "affinity": affinity,
            "distance": hybrid_layout_distance(
                affinity
            ),
            "stress_weight": hybrid_stress_weight(
                affinity,
                co_score,
                count,
            ),
        }

    return metrics


def get_layout_pair_metric(
    pair_metrics,
    a,
    b,
):
    if a == b:
        return None

    return pair_metrics.get(
        tuple(sorted((a, b)))
    )


def build_semantic_knn_graph(
    tags,
    layout_vectors,
    pair_metrics,
):
    """
    Build a k-nearest-neighbour graph from hybrid affinities.
    """
    graph = nx.Graph()
    tags = sorted(tags)

    for tag in tags:
        graph.add_node(tag, kind="tag")

    valid_tags = [
        tag
        for tag in tags
        if (
            layout_vectors.get(tag) is not None
            or any(
                (
                    data is not None
                    and data.get("cooccurrence", 0) > 0
                )
                for other in tags
                if other != tag
                for data in [
                    get_layout_pair_metric(
                        pair_metrics,
                        tag,
                        other,
                    )
                ]
            )
        )
    ]

    if len(valid_tags) <= 1:
        return graph, 0

    k = int(round(math.sqrt(len(valid_tags))))
    k = max(LAYOUT_KNN_MIN, k)
    k = min(LAYOUT_KNN_MAX, k, len(valid_tags) - 1)

    for tag in valid_tags:
        candidates = []

        for other in valid_tags:
            if other == tag:
                continue

            data = get_layout_pair_metric(
                pair_metrics,
                tag,
                other,
            )

            if data is None:
                continue

            candidates.append(
                (
                    -float(data["affinity"]),
                    float(data["distance"]),
                    other,
                    data,
                )
            )

        candidates.sort(
            key=lambda item: (
                item[0],
                item[1],
                item[2],
            )
        )

        for _, _, other, data in candidates[:k]:
            weight = max(
                float(data["affinity"]),
                0.001,
            )

            edge_data = {
                "weight": weight,
                "distance": float(data["distance"]),
                "affinity": float(data["affinity"]),
                "semantic": float(data["semantic"]),
                "cooccurrence": int(data["cooccurrence"]),
                "cooccurrence_score": float(
                    data["cooccurrence_score"]
                ),
                "corpus_confidence": float(
                    data["corpus_confidence"]
                ),
                "corpus_signal": float(
                    data.get("corpus_signal", 0.0)
                ),
            }

            if graph.has_edge(tag, other):
                if weight > graph[tag][other]["weight"]:
                    graph[tag][other].update(edge_data)
                continue

            graph.add_edge(
                tag,
                other,
                **edge_data,
            )

    return graph, k


def find_communities(graph):
    if graph.number_of_nodes() == 0:
        return {}

    if graph.number_of_edges() == 0:
        return {
            node: index
            for index, node in enumerate(
                sorted(graph.nodes())
            )
        }

    communities = list(
        nx.algorithms.community.greedy_modularity_communities(
            graph,
            weight="weight",
        )
    )

    communities = sorted(
        (
            sorted(community)
            for community in communities
        ),
        key=lambda members: (
            -len(members),
            members[0],
        ),
    )

    result = {}

    for cluster_id, community in enumerate(communities):
        for node in community:
            result[node] = cluster_id

    return result


def layout_matrices_for_tags(
    tags,
    pair_metrics,
):
    tags = list(tags)
    count = len(tags)

    distances = np.zeros(
        (count, count),
        dtype=float,
    )

    weights = np.zeros(
        (count, count),
        dtype=float,
    )

    observed_distances = []

    for i, a in enumerate(tags):
        for j in range(i + 1, count):
            b = tags[j]
            data = get_layout_pair_metric(
                pair_metrics,
                a,
                b,
            )

            if data is None:
                distances[i, j] = np.nan
                distances[j, i] = np.nan
                continue

            distance = float(data["distance"])
            weight = float(data["stress_weight"])

            distances[i, j] = distance
            distances[j, i] = distance
            weights[i, j] = weight
            weights[j, i] = weight
            observed_distances.append(distance)

    fallback_distance = (
        max(observed_distances)
        if observed_distances
        else 1.0
    )

    distances = np.nan_to_num(
        distances,
        nan=fallback_distance,
    )

    # Pairs with missing vectors receive a low projection weight.
    missing_mask = (
        (weights == 0.0)
        & (~np.eye(count, dtype=bool))
    )
    weights[missing_mask] = (
        LAYOUT_STRESS_BASE_WEIGHT * 0.25
    )

    return distances, weights


def pairwise_coordinate_distances(coordinates):
    coordinates = np.asarray(
        coordinates,
        dtype=float,
    )

    delta = (
        coordinates[:, None, :]
        - coordinates[None, :, :]
    )

    return np.linalg.norm(
        delta,
        axis=2,
    )


def weighted_stress(
    coordinates,
    target_distances,
    weights,
):
    actual = pairwise_coordinate_distances(
        coordinates
    )

    residual = actual - target_distances

    return float(
        0.5
        * np.sum(
            weights * (residual ** 2)
        )
    )


def classical_mds(distance_matrix):
    distance_matrix = np.asarray(
        distance_matrix,
        dtype=float,
    )

    count = distance_matrix.shape[0]

    if count == 0:
        return np.zeros((0, 2), dtype=float)

    if count == 1:
        return np.zeros((1, 2), dtype=float)

    centering = (
        np.eye(count)
        - np.ones((count, count), dtype=float)
        / float(count)
    )

    gram = (
        -0.5
        * centering
        @ (distance_matrix ** 2)
        @ centering
    )

    eigenvalues, eigenvectors = np.linalg.eigh(gram)
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[order]
    eigenvectors = eigenvectors[:, order]

    coordinates = np.zeros((count, 2), dtype=float)

    dimension = 0

    for index, value in enumerate(eigenvalues):
        if value <= 1e-12:
            continue

        coordinates[:, dimension] = (
            eigenvectors[:, index]
            * math.sqrt(float(value))
        )

        dimension += 1

        if dimension >= 2:
            break

    return coordinates


def weighted_smacof(
    target_distances,
    weights,
    initial_coordinates=None,
    max_iterations=LAYOUT_SMACOF_MAX_ITER,
    tolerance=LAYOUT_SMACOF_TOL,
):
    """
    Compute deterministic weighted metric MDS with SMACOF majorization.
    """
    target_distances = np.asarray(
        target_distances,
        dtype=float,
    )
    weights = np.asarray(
        weights,
        dtype=float,
    )

    count = target_distances.shape[0]

    if count == 0:
        return np.zeros((0, 2), dtype=float), 0.0

    if count == 1:
        return np.zeros((1, 2), dtype=float), 0.0

    if initial_coordinates is None:
        coordinates = classical_mds(
            target_distances
        )
    else:
        coordinates = np.asarray(
            initial_coordinates,
            dtype=float,
        ).copy()

    coordinates -= np.mean(
        coordinates,
        axis=0,
    )

    laplacian = np.diag(
        np.sum(weights, axis=1)
    ) - weights

    laplacian_pinv = np.linalg.pinv(
        laplacian
    )

    previous_stress = weighted_stress(
        coordinates,
        target_distances,
        weights,
    )

    for _ in range(max_iterations):
        actual = pairwise_coordinate_distances(
            coordinates
        )

        safe_actual = np.maximum(
            actual,
            1e-12,
        )

        ratio = (
            weights
            * target_distances
            / safe_actual
        )

        np.fill_diagonal(ratio, 0.0)

        b_matrix = -ratio
        np.fill_diagonal(
            b_matrix,
            -np.sum(b_matrix, axis=1),
        )

        updated = (
            laplacian_pinv
            @ b_matrix
            @ coordinates
        )

        updated -= np.mean(
            updated,
            axis=0,
        )

        current_stress = weighted_stress(
            updated,
            target_distances,
            weights,
        )

        improvement = (
            previous_stress - current_stress
        )

        # Stop at the last non-increasing stress value to avoid numerical drift.
        if improvement < -1e-10:
            break

        coordinates = updated

        relative = max(improvement, 0.0) / max(
            previous_stress,
            1e-12,
        )

        previous_stress = current_stress

        if relative < tolerance:
            break

    return coordinates, previous_stress


def canonicalize_layout(
    coordinates,
    tags,
):
    coordinates = np.asarray(
        coordinates,
        dtype=float,
    ).copy()

    tags = list(tags)

    if len(tags) == 0:
        return coordinates

    coordinates -= np.mean(
        coordinates,
        axis=0,
    )

    if len(tags) == 1:
        return coordinates

    radii = np.linalg.norm(
        coordinates,
        axis=1,
    )

    reference_index = max(
        range(len(tags)),
        key=lambda index: (
            radii[index],
            tags[index],
        ),
    )

    reference = coordinates[reference_index]

    if np.linalg.norm(reference) > 1e-12:
        angle = math.atan2(
            reference[1],
            reference[0],
        )

        cosine = math.cos(-angle)
        sine = math.sin(-angle)

        rotation = np.array(
            [
                [cosine, -sine],
                [sine, cosine],
            ],
            dtype=float,
        )

        coordinates = coordinates @ rotation.T

    if len(tags) > 2:
        y_index = max(
            range(len(tags)),
            key=lambda index: (
                abs(coordinates[index, 1]),
                tags[index],
            ),
        )

        if coordinates[y_index, 1] < 0:
            coordinates[:, 1] *= -1.0

    return coordinates


def normalize_coordinates(coordinates):
    coordinates = np.asarray(
        coordinates,
        dtype=float,
    ).copy()

    if coordinates.size == 0:
        return coordinates

    coordinates -= np.mean(
        coordinates,
        axis=0,
    )

    radii = np.linalg.norm(
        coordinates,
        axis=1,
    )

    maximum = max(
        float(np.max(radii)),
        1e-9,
    )

    return coordinates / maximum


def system_core_tags(
    graph,
    members,
    importance=None,
):
    members = sorted(members)

    if not members:
        return []

    if len(members) == 1:
        return members

    subgraph = graph.subgraph(members).copy()

    degree = {
        node: float(value)
        for node, value in subgraph.degree(
            weight="weight"
        )
    }

    max_degree = max(
        degree.values(),
        default=1.0,
    ) or 1.0

    for a, b, data in subgraph.edges(data=True):
        data["path_distance"] = 1.0 / max(
            float(data.get("weight", 0.0)),
            1e-6,
        )

    if subgraph.number_of_edges() > 0:
        closeness = nx.closeness_centrality(
            subgraph,
            distance="path_distance",
        )
    else:
        closeness = {
            node: 0.0
            for node in members
        }

    max_closeness = max(
        closeness.values(),
        default=1.0,
    ) or 1.0

    semantic_scores = {
        node: (
            0.65 * degree.get(node, 0.0) / max_degree
            + 0.35 * closeness.get(node, 0.0) / max_closeness
        )
        for node in members
    }

    importance = importance or {}
    maximum_importance = max(
        [
            float(importance.get(node, 0.0))
            for node in members
        ],
        default=0.0,
    )

    scores = {}

    for node in members:
        semantic_score = semantic_scores[node]

        if maximum_importance > 0:
            importance_score = (
                float(importance.get(node, 0.0))
                / maximum_importance
            )
        else:
            importance_score = semantic_score

        scores[node] = (
            0.55 * semantic_score
            + 0.45 * importance_score
        )

    ordered = sorted(
        members,
        key=lambda node: (
            -scores[node],
            node,
        ),
    )

    top_score = scores[ordered[0]]

    cores = [
        node
        for node in ordered
        if (
            scores[node]
            >= top_score * CORE_SCORE_RATIO
        )
    ][:MAX_SYSTEM_CORES]

    return cores or [ordered[0]]




def format_system_label(core_tags):
    core_tags = [
        str(tag).strip()
        for tag in (core_tags or [])
        if str(tag).strip()
    ]

    if not core_tags:
        return "unresolved"

    return " / ".join(core_tags[:3])

def constrain_to_semantic_hull(
    position,
    scale=TAG_BOUNDARY_SCALE,
):
    point = np.asarray(
        position,
        dtype=float,
    )

    canonical = np.array(
        [
            point[0] / SEMANTIC_X_SCALE,
            point[1] / SEMANTIC_Y_SCALE,
        ],
        dtype=float,
    )

    x = float(canonical[0])
    y = float(canonical[1])
    sqrt_three = math.sqrt(3.0)

    horizontal_measure = abs(x)
    diagonal_measure = abs(y) + abs(x) / sqrt_three

    horizontal_limit = scale * sqrt_three / 2.0
    diagonal_limit = scale

    factors = [1.0]

    if horizontal_measure > 0:
        factors.append(
            horizontal_limit / horizontal_measure
        )

    if diagonal_measure > 0:
        factors.append(
            diagonal_limit / diagonal_measure
        )

    factor = min(factors)

    if factor < 1.0:
        canonical *= factor

    return np.array(
        [
            canonical[0] * SEMANTIC_X_SCALE,
            canonical[1] * SEMANTIC_Y_SCALE,
        ],
        dtype=float,
    )


def separate_overlapping_systems(
    coordinates,
    tags,
    communities,
):
    """
    Separate overlapping systems with bounded translations that preserve
    the relative coordinates within each system.
    """
    coordinates = np.asarray(
        coordinates,
        dtype=float,
    ).copy()
    tags = list(tags)

    if len(tags) <= 1:
        return coordinates

    index_by_tag = {
        tag: index
        for index, tag in enumerate(tags)
    }

    members_by_system = defaultdict(list)

    for tag in tags:
        members_by_system[
            communities.get(tag, -1)
        ].append(tag)

    if len(members_by_system) <= 1:
        return coordinates

    pair_distances = pairwise_coordinate_distances(
        coordinates
    )
    nonzero = pair_distances[
        pair_distances > 1e-9
    ]
    characteristic_scale = (
        float(np.median(nonzero))
        if nonzero.size
        else 1.0
    )

    padding = (
        characteristic_scale
        * SYSTEM_COLLISION_PADDING_RATIO
    )
    max_shift = (
        characteristic_scale
        * SYSTEM_COLLISION_MAX_SHIFT_RATIO
    )

    for _ in range(SYSTEM_COLLISION_ITERATIONS):
        changed = False
        centers = {}
        radii = {}

        for system_id, members in members_by_system.items():
            indices = [
                index_by_tag[tag]
                for tag in members
            ]
            points = coordinates[indices]
            center = np.mean(points, axis=0)
            centers[system_id] = center

            if len(points) <= 1:
                radius = padding * 0.35
            else:
                member_radii = np.linalg.norm(
                    points - center,
                    axis=1,
                )
                radius = max(
                    float(
                        np.percentile(
                            member_radii,
                            75.0,
                        )
                    ),
                    padding * 0.35,
                )

            radii[system_id] = radius

        system_ids = sorted(members_by_system)

        for i, first_id in enumerate(system_ids):
            for second_id in system_ids[i + 1:]:
                delta = (
                    centers[second_id]
                    - centers[first_id]
                )
                distance = float(
                    np.linalg.norm(delta)
                )

                minimum = (
                    radii[first_id]
                    + radii[second_id]
                    + padding
                )

                if distance >= minimum:
                    continue

                if distance <= 1e-12:
                    seed = deterministic_jitter(
                        f"system-{first_id}-{second_id}",
                        scale=1.0,
                    )
                    norm = float(np.linalg.norm(seed)) or 1.0
                    direction = seed / norm
                else:
                    direction = delta / distance

                requested_shift = (
                    (minimum - distance) * 0.5
                )
                shift_amount = min(
                    requested_shift,
                    max_shift,
                )

                if shift_amount <= 1e-9:
                    continue

                changed = True
                shift = shift_amount * direction

                for tag in members_by_system[first_id]:
                    coordinates[index_by_tag[tag]] -= shift

                for tag in members_by_system[second_id]:
                    coordinates[index_by_tag[tag]] += shift

                centers[first_id] -= shift
                centers[second_id] += shift

        coordinates -= np.mean(
            coordinates,
            axis=0,
        )

        if not changed:
            break

    return coordinates


def calculate_semantic_system_layout(
    tags,
    pair_metrics,
    layout_graph,
    communities,
    tag_importance=None,
):
    tags = sorted(tags)

    if not tags:
        return {}, [], 0.0

    distances, stress_weights = layout_matrices_for_tags(
        tags,
        pair_metrics,
    )

    initial = classical_mds(
        distances
    )

    coordinates, stress = weighted_smacof(
        distances,
        stress_weights,
        initial_coordinates=initial,
    )

    coordinates = canonicalize_layout(
        coordinates,
        tags,
    )

    # Separate overlapping community regions with bounded translations.
    coordinates = separate_overlapping_systems(
        coordinates,
        tags,
        communities,
    )

    coordinates = canonicalize_layout(
        coordinates,
        tags,
    )

    stress = weighted_stress(
        coordinates,
        distances,
        stress_weights,
    )

    normalized = normalize_coordinates(
        coordinates
    )

    positions = {}

    for index, tag in enumerate(tags):
        candidate = np.array(
            [
                normalized[index, 0] * SEMANTIC_X_SCALE,
                normalized[index, 1] * SEMANTIC_Y_SCALE,
            ],
            dtype=float,
        )

        # Uniform scaling controls the occupied area and preserves geometry.
        candidate *= LAYOUT_COMPACTNESS

        candidate += deterministic_jitter(
            tag,
            scale=0.004,
        )

        positions[tag] = constrain_to_semantic_hull(
            candidate
        )

    system_members = defaultdict(list)

    for tag in tags:
        system_members[
            communities.get(tag, -1)
        ].append(tag)

    systems = []

    for system_id in sorted(system_members):
        members = sorted(
            system_members[system_id]
        )

        cores = system_core_tags(
            layout_graph,
            members,
            importance=tag_importance,
        )

        member_positions = np.array(
            [positions[tag] for tag in members],
            dtype=float,
        )

        center = np.mean(
            member_positions,
            axis=0,
        )

        systems.append({
            "id": int(system_id),
            "size": len(members),
            "tags": members,
            "core_tags": cores,
            "label": format_system_label(cores),
            "x": float(center[0]),
            "y": float(center[1]),
        })

    return positions, systems, float(stress)


def calculate_tag_weight_details(
    graph,
    tag_usage,
):
    if not tag_usage:
        return {}

    frequencies = {
        tag: len(slugs)
        for tag, slugs in tag_usage.items()
    }

    max_frequency = max(
        frequencies.values(),
        default=1,
    )

    if graph.number_of_nodes() > 1:
        centrality = nx.degree_centrality(
            graph
        )
    else:
        centrality = {
            node: 0.0
            for node in graph.nodes()
        }

    max_centrality = (
        max(
            centrality.values(),
            default=1.0,
        )
        or 1.0
    )

    result = {}

    for tag in tag_usage:
        frequency_score = (
            frequencies[tag]
            / max_frequency
        )

        centrality_score = (
            centrality.get(tag, 0.0)
            / max_centrality
        )

        activation_score = math.sqrt(
            max(0.0, frequency_score)
            * max(0.0, centrality_score)
        )

        value = (
            INTENSITY_SCALE_MIN
            + INTENSITY_SCALE_RANGE * activation_score
        )

        result[tag] = {
            "value": round(value, 3),
            "activation_score": float(activation_score),
            "frequency_score": float(frequency_score),
            "degree_score": float(centrality_score),
            "post_count": int(frequencies[tag]),
            "max_post_count": int(max_frequency),
            "degree_centrality": float(
                centrality.get(tag, 0.0)
            ),
            "max_degree_centrality": float(
                max_centrality
            ),
        }

    return result


def calculate_tag_weights(
    graph,
    tag_usage,
):
    details = calculate_tag_weight_details(
        graph,
        tag_usage,
    )

    return {
        tag: item["value"]
        for tag, item in details.items()
    }



def calculate_attraction_strength(layout_graph):
    """
    Normalize weighted layout degrees to control label brightness and glow.
    """
    if layout_graph.number_of_nodes() == 0:
        return {}

    raw = {
        node: float(value)
        for node, value in layout_graph.degree(weight="weight")
    }

    maximum = max(raw.values(), default=0.0)

    if maximum <= 1e-12:
        maximum = 1.0

    result = {}

    for node in layout_graph.nodes():
        raw_value = float(raw.get(node, 0.0))
        normalized = float(np.clip(raw_value / maximum, 0.0, 1.0))

        result[node] = {
            "raw": raw_value,
            "max_raw": float(maximum),
            "normalized": normalized,
            "visual": float(normalized ** PILLOW_ATTRACTION_VISUAL_EXPONENT),
            "neighbor_count": int(layout_graph.degree(node)),
        }

    return result

def nearest_tag_neighbors(
    graph,
    tag,
    limit=3,
):
    if tag not in graph:
        return []

    neighbors = []

    for neighbor in graph.neighbors(tag):
        data = graph[tag][neighbor]

        neighbors.append({
            "tag": neighbor,
            "strength": data["weight"],
            "semantic": data.get("semantic", 0.0),
            "cooccurrence": data.get("cooccurrence", 0),
            "cooccurrence_score": data.get(
                "cooccurrence_score",
                0.0,
            ),
        })

    return sorted(
        neighbors,
        key=lambda item: (
            item["strength"],
            item["tag"],
        ),
        reverse=True,
    )[:limit]


def nearest_layout_neighbors(
    layout_graph,
    tag,
    limit=4,
):
    if tag not in layout_graph:
        return []

    result = []

    for neighbor in layout_graph.neighbors(tag):
        data = layout_graph[tag][neighbor]
        result.append({
            "tag": neighbor,
            "affinity": float(
                data.get("affinity", data.get("weight", 0.0))
            ),
            "semantic": float(
                data.get("semantic", 0.0)
            ),
            "cooccurrence": int(
                data.get("cooccurrence", 0)
            ),
            "cooccurrence_score": float(
                data.get("cooccurrence_score", 0.0)
            ),
            "corpus_confidence": float(
                data.get("corpus_confidence", 0.0)
            ),
            "corpus_signal": float(
                data.get("corpus_signal", 0.0)
            ),
            "distance": float(
                data.get("distance", 0.0)
            ),
        })

    return sorted(
        result,
        key=lambda item: (
            -item["affinity"],
            -item["semantic"],
            item["tag"],
        ),
    )[:limit]


def build_semantic_map(posts, model):
    all_tag_usage = collect_all_tag_usage(
        posts
    )

    tag_usage = collect_map_tag_usage(
        posts
    )

    excluded_tag_usage = collect_excluded_tag_usage(
        posts
    )

    tags = sorted(tag_usage)

    cooccurrences = collect_cooccurrences(
        posts,
        tags,
    )

    base_vectors = build_base_vectors(
        model,
        tags,
    )

    context_vectors, context_sources = build_context_vectors(
        tag_usage,
        base_vectors,
        cooccurrences,
    )

    # Enriched vectors determine interaction links and flow paths.
    interaction_vectors = combine_map_vectors(
        base_vectors,
        context_vectors,
    )

    interaction_graph = build_tag_graph(
        tag_usage,
        interaction_vectors,
        cooccurrences,
    )

    # Hybrid affinities determine layout distances and communities.
    layout_vectors = build_layout_vectors(
        base_vectors,
        context_vectors,
    )

    layout_pair_metrics = build_layout_pair_metrics(
        tag_usage,
        layout_vectors,
        cooccurrences,
    )

    layout_graph, layout_knn = build_semantic_knn_graph(
        tags,
        layout_vectors,
        layout_pair_metrics,
    )

    communities = find_communities(
        layout_graph
    )

    attraction_strength = calculate_attraction_strength(
        layout_graph
    )

    tag_weight_details = calculate_tag_weight_details(
        interaction_graph,
        tag_usage,
    )

    tag_weights = {
        tag: details["value"]
        for tag, details in tag_weight_details.items()
    }

    positions, systems, layout_stress = calculate_semantic_system_layout(
        tags,
        layout_pair_metrics,
        layout_graph,
        communities,
        tag_importance=tag_weights,
    )

    system_by_id = {
        item["id"]: item
        for item in systems
    }

    label_priorities = calculate_label_priorities(
        interaction_graph,
        tag_usage,
    )

    base_visibility_levels = assign_base_visibility_levels(
        label_priorities
    )

    visibility_levels = resolve_visibility_collisions(
        positions,
        label_priorities,
        base_visibility_levels,
    )

    nodes = []
    unresolved_tags = []

    for tag in tags:
        if layout_vectors.get(tag) is None:
            unresolved_tags.append(tag)

        position = positions.get(
            tag,
            np.array([0.0, 0.0], dtype=float),
        )

        priority = label_priorities.get(
            tag,
            {},
        )

        system_id = int(
            communities.get(tag, -1)
        )

        system = system_by_id.get(
            system_id,
            {
                "size": 1,
                "core_tags": [tag],
                "label": format_system_label([tag]),
            },
        )

        is_core = tag in system["core_tags"]

        nodes.append({
            "tag": tag,
            "count": len(tag_usage[tag]),
            "weight": tag_weights.get(tag, 1.0),
            "attraction_strength": round(
                attraction_strength.get(tag, {}).get(
                    "normalized",
                    0.0,
                ),
                4,
            ),
            "attraction_visual": round(
                attraction_strength.get(tag, {}).get(
                    "visual",
                    0.0,
                ),
                4,
            ),
            "attraction_components": {
                "raw": round(
                    attraction_strength.get(tag, {}).get(
                        "raw",
                        0.0,
                    ),
                    4,
                ),
                "max_raw": round(
                    attraction_strength.get(tag, {}).get(
                        "max_raw",
                        1.0,
                    ),
                    4,
                ),
                "neighbor_count": int(
                    attraction_strength.get(tag, {}).get(
                        "neighbor_count",
                        0,
                    )
                ),
            },
            "intensity_components": {
                "frequency": round(
                    tag_weight_details.get(tag, {}).get(
                        "frequency_score",
                        0.0,
                    ),
                    4,
                ),
                "degree": round(
                    tag_weight_details.get(tag, {}).get(
                        "degree_score",
                        0.0,
                    ),
                    4,
                ),
                "activation": round(
                    tag_weight_details.get(tag, {}).get(
                        "activation_score",
                        0.0,
                    ),
                    4,
                ),
                "post_count": int(
                    tag_weight_details.get(tag, {}).get(
                        "post_count",
                        len(tag_usage[tag]),
                    )
                ),
                "max_post_count": int(
                    tag_weight_details.get(tag, {}).get(
                        "max_post_count",
                        1,
                    )
                ),
                "degree_centrality": round(
                    tag_weight_details.get(tag, {}).get(
                        "degree_centrality",
                        0.0,
                    ),
                    4,
                ),
            },
            "cluster": system_id,
            "system_id": system_id,
            "system_size": int(system["size"]),
            "system_core_tags": list(system["core_tags"]),
            "system_label": system.get("label", format_system_label(system.get("core_tags", [tag]))),
            "system_role": (
                "core"
                if is_core
                else "member"
            ),
            "x": float(position[0]),
            "y": float(position[1]),
            "label_priority": round(
                priority.get("priority", 0.0),
                4,
            ),
            "visibility_level": int(
                visibility_levels.get(tag, 3)
            ),
            "visibility_base_level": int(
                base_visibility_levels.get(tag, 3)
            ),
            "priority_components": {
                "frequency": round(
                    priority.get(
                        "frequency_score",
                        0.0,
                    ),
                    4,
                ),
                "degree": round(
                    priority.get(
                        "degree_score",
                        0.0,
                    ),
                    4,
                ),
                "betweenness": round(
                    priority.get(
                        "betweenness_score",
                        0.0,
                    ),
                    4,
                ),
            },
            "posts": sorted(tag_usage[tag]),
            "has_base_vector": (
                base_vectors[tag] is not None
            ),
            "has_context_vector": (
                context_vectors[tag] is not None
            ),
            "context": [
                {
                    "tag": item["tag"],
                    "weight": round(
                        item["weight"],
                        4,
                    ),
                    "cooccurrence": item["cooccurrence"],
                }
                for item in context_sources[tag]
            ],
            # Anchor fields are empty in the semantic layout.
            "anchors": [],
            "anchor_scores": [],
            "anchor_target_x": 0.0,
            "anchor_target_y": 0.0,
            "neighbors": [
                {
                    "tag": item["tag"],
                    "strength": round(
                        item["strength"],
                        4,
                    ),
                    "semantic": round(
                        item["semantic"],
                        4,
                    ),
                    "cooccurrence": item["cooccurrence"],
                    "jaccard": round(
                        item["cooccurrence_score"],
                        4,
                    ),
                }
                for item in nearest_tag_neighbors(
                    interaction_graph,
                    tag,
                )
            ],
            "semantic_neighbors": [
                {
                    "tag": item["tag"],
                    "affinity": round(
                        item["affinity"],
                        4,
                    ),
                    "semantic": round(
                        item["semantic"],
                        4,
                    ),
                    "cooccurrence": item["cooccurrence"],
                    "jaccard": round(
                        item["cooccurrence_score"],
                        4,
                    ),
                    "corpus_confidence": round(
                        item["corpus_confidence"],
                        4,
                    ),
                    "corpus_signal": round(
                        item["corpus_signal"],
                        4,
                    ),
                    "distance": round(
                        item["distance"],
                        4,
                    ),
                }
                for item in nearest_layout_neighbors(
                    layout_graph,
                    tag,
                )
            ],
        })

    edges = [
        {
            "source": a,
            "target": b,
            "strength": round(
                data["weight"],
                4,
            ),
            "semantic": round(
                data.get("semantic", 0.0),
                4,
            ),
            "cooccurrence": data.get(
                "cooccurrence",
                0,
            ),
            "jaccard": round(
                data.get(
                    "cooccurrence_score",
                    0.0,
                ),
                4,
            ),
        }
        for a, b, data in interaction_graph.edges(
            data=True
        )
    ]

    excluded_tags = [
        {
            "tag": tag,
            "count": len(slugs),
            "posts": sorted(slugs),
        }
        for tag, slugs in sorted(
            excluded_tag_usage.items()
        )
    ]

    return {
        "model": MODEL_NAME,
        "layout_mode": "hybrid-semantic-systems-weighted-mds",
        "post_count": len(posts),
        "all_tag_count": len(all_tag_usage),
        "tag_count": len(tags),
        "excluded_tag_count": len(excluded_tags),
        "cluster_count": len(systems),
        "system_count": len(systems),
        "layout_knn": layout_knn,
        "layout_stress": round(layout_stress, 6),
        "layout_corpus_max_boost": LAYOUT_CORPUS_MAX_BOOST,
        "layout_corpus_confidence_scale": LAYOUT_CORPUS_CONFIDENCE_SCALE,
        "system_collision_padding_ratio": SYSTEM_COLLISION_PADDING_RATIO,
        "system_collision_max_shift_ratio": SYSTEM_COLLISION_MAX_SHIFT_RATIO,
        "base_vector_weight": BASE_VECTOR_WEIGHT,
        "context_vector_weight": CONTEXT_VECTOR_WEIGHT,
        "semantic_weight": SEMANTIC_WEIGHT,
        "cooccurrence_weight": COOCCURRENCE_WEIGHT,
        "semantic_x_scale": SEMANTIC_X_SCALE,
        "semantic_y_scale": SEMANTIC_Y_SCALE,
        "tag_boundary_scale": TAG_BOUNDARY_SCALE,
        "layout_compactness": LAYOUT_COMPACTNESS,
        "visibility_level_count": VISIBILITY_LEVEL_COUNT,
        "methodology": {
            "intensity_model": "geometric_mean",
            "intensity_scale_min": INTENSITY_SCALE_MIN,
            "intensity_scale_range": INTENSITY_SCALE_RANGE,
            "importance_frequency_weight": LABEL_PRIORITY_FREQUENCY_WEIGHT,
            "importance_degree_weight": LABEL_PRIORITY_DEGREE_WEIGHT,
            "importance_betweenness_weight": LABEL_PRIORITY_BETWEENNESS_WEIGHT,
            "interaction_base_vector_weight": BASE_VECTOR_WEIGHT,
            "interaction_context_vector_weight": CONTEXT_VECTOR_WEIGHT,
            "interaction_semantic_weight": SEMANTIC_WEIGHT,
            "interaction_cooccurrence_weight": COOCCURRENCE_WEIGHT,
            "semantic_edge_threshold": SEMANTIC_EDGE_THRESHOLD,
            "layout_corpus_max_boost": LAYOUT_CORPUS_MAX_BOOST,
            "layout_corpus_confidence_scale": LAYOUT_CORPUS_CONFIDENCE_SCALE,
            "layout_knn": layout_knn,
            "core_score_ratio": CORE_SCORE_RATIO,
            "max_system_cores": MAX_SYSTEM_CORES,
            "pillow_attraction_visual_exponent": PILLOW_ATTRACTION_VISUAL_EXPONENT,
        },
        "unresolved_tags": unresolved_tags,
        "excluded_tags": excluded_tags,
        "anchor_order": [],
        "anchors": [],
        "systems": systems,
        "nodes": nodes,
        "edges": edges,
        # Full layout graph for circuit inspection; node lists contain top neighbours.
        "layout_edges": [
            {
                "source": a,
                "target": b,
                "weight": round(float(attributes["weight"]), 8),
            }
            for a, b, attributes in layout_graph.edges(data=True)
        ],
    }
