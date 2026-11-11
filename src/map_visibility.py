import math

import networkx as nx


LABEL_PRIORITY_FREQUENCY_WEIGHT = 0.45
LABEL_PRIORITY_DEGREE_WEIGHT = 0.35
LABEL_PRIORITY_BETWEENNESS_WEIGHT = 0.20

VISIBILITY_LEVEL_COUNT = 4
SMALL_MAP_ALL_LABELS_THRESHOLD = 14


def normalize_scores(values):
    if not values:
        return {}

    maximum = max(values.values(), default=0.0)

    if maximum <= 0:
        return {key: 0.0 for key in values}

    return {
        key: float(value) / float(maximum)
        for key, value in values.items()
    }


def calculate_label_priorities(graph, tag_usage):
    frequencies = {
        tag: len(post_slugs)
        for tag, post_slugs in tag_usage.items()
    }

    frequency_scores = normalize_scores(frequencies)

    if graph.number_of_nodes() > 1:
        degree_scores = normalize_scores(
            dict(graph.degree(weight="weight"))
        )

        betweenness_scores = normalize_scores(
            nx.betweenness_centrality(
                graph,
                weight=None,
            )
        )
    else:
        degree_scores = {tag: 0.0 for tag in tag_usage}
        betweenness_scores = {tag: 0.0 for tag in tag_usage}

    priorities = {}

    for tag in tag_usage:
        score = (
            LABEL_PRIORITY_FREQUENCY_WEIGHT
            * frequency_scores.get(tag, 0.0)
            +
            LABEL_PRIORITY_DEGREE_WEIGHT
            * degree_scores.get(tag, 0.0)
            +
            LABEL_PRIORITY_BETWEENNESS_WEIGHT
            * betweenness_scores.get(tag, 0.0)
        )

        priorities[tag] = {
            "priority": float(score),
            "frequency_score": float(
                frequency_scores.get(tag, 0.0)
            ),
            "degree_score": float(
                degree_scores.get(tag, 0.0)
            ),
            "betweenness_score": float(
                betweenness_scores.get(tag, 0.0)
            ),
        }

    return priorities


def assign_base_visibility_levels(priorities):
    ordered = sorted(
        priorities,
        key=lambda tag: (
            -priorities[tag]["priority"],
            tag,
        ),
    )

    total = len(ordered)

    if total == 0:
        return {}

    # Display every label at the initial zoom level on small maps.
    if total <= SMALL_MAP_ALL_LABELS_THRESHOLD:
        return {tag: 0 for tag in ordered}

    cut_0 = min(
        total,
        max(3, int(math.ceil(total * 0.18))),
    )

    cut_1 = max(
        cut_0,
        int(math.ceil(total * 0.40)),
    )

    cut_2 = max(
        cut_1,
        int(math.ceil(total * 0.70)),
    )

    levels = {}

    for index, tag in enumerate(ordered):
        if index < cut_0:
            level = 0
        elif index < cut_1:
            level = 1
        elif index < cut_2:
            level = 2
        else:
            level = 3

        levels[tag] = level

    return levels


def estimated_label_box(tag, position):
    x = float(position[0])
    y = float(position[1])

    half_width = max(
        0.055,
        0.0105 * len(tag),
    )

    half_height = 0.040

    return (
        x - half_width,
        y - half_height,
        x + half_width,
        y + half_height,
    )


def boxes_overlap(box_a, box_b):
    return not (
        box_a[2] < box_b[0]
        or box_a[0] > box_b[2]
        or box_a[3] < box_b[1]
        or box_a[1] > box_b[3]
    )


def resolve_visibility_collisions(
    positions,
    priorities,
    base_levels,
):
    if len(positions) <= SMALL_MAP_ALL_LABELS_THRESHOLD:
        return {tag: 0 for tag in positions}

    ordered = sorted(
        positions,
        key=lambda tag: (
            -priorities[tag]["priority"],
            tag,
        ),
    )

    final_levels = {}
    accepted = []

    for tag in ordered:
        candidate_level = base_levels.get(
            tag,
            VISIBILITY_LEVEL_COUNT - 1,
        )

        box = estimated_label_box(
            tag,
            positions[tag],
        )

        while candidate_level < VISIBILITY_LEVEL_COUNT - 1:
            collision = False

            for other_tag in accepted:
                other_level = final_levels[other_tag]

                if other_level > candidate_level:
                    continue

                other_box = estimated_label_box(
                    other_tag,
                    positions[other_tag],
                )

                if boxes_overlap(box, other_box):
                    collision = True
                    break

            if not collision:
                break

            candidate_level += 1

        final_levels[tag] = candidate_level
        accepted.append(tag)

    return final_levels
