import re

import gensim.downloader as api
import numpy as np


MODEL_NAME = "glove-wiki-gigaword-50"


def load_embedding_model():
    return api.load(MODEL_NAME)


def normalize_term(term):
    return str(term).strip().lower()


def split_term(term):
    term = normalize_term(term)

    return [
        token
        for token in re.split(
            r"[\s_\-/]+",
            term
        )
        if token
    ]


def vector_for_term(model, term):
    term = normalize_term(term)

    if not term:
        return None

    if term in model:
        return np.asarray(
            model[term],
            dtype=float
        )

    tokens = split_term(term)

    vectors = [
        np.asarray(
            model[token],
            dtype=float
        )
        for token in tokens
        if token in model
    ]

    if not vectors:
        return None

    return np.mean(
        vectors,
        axis=0
    )


def mean_vector(model, terms):
    vectors = [
        vector
        for term in terms
        if (
            vector := vector_for_term(
                model,
                term
            )
        ) is not None
    ]

    if not vectors:
        return None

    return np.mean(
        vectors,
        axis=0
    )


def cosine_similarity(a, b):
    if a is None or b is None:
        return None

    denominator = (
        np.linalg.norm(a)
        * np.linalg.norm(b)
    )

    if denominator == 0:
        return None

    return float(
        np.dot(a, b)
        / denominator
    )


def build_anchor_vectors(
    model,
    anchors
):
    result = {}

    for name, config in anchors.items():
        vector = mean_vector(
            model,
            config["seeds"]
        )

        if vector is not None:
            result[name] = vector

    return result


def anchor_similarities(
    vector,
    anchor_vectors
):
    scores = []

    if vector is None:
        return scores

    for name, anchor_vector in (
        anchor_vectors.items()
    ):
        similarity = cosine_similarity(
            vector,
            anchor_vector
        )

        if similarity is None:
            continue

        scores.append({
            "name": name,
            "score": similarity,
        })

    scores.sort(
        key=lambda item: item["score"],
        reverse=True
    )

    return scores