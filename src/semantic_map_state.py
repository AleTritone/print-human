import hashlib
import json
import math
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from threading import RLock

from src.config import BASE
from src.map_anchors import MAP_EXCLUDED_TAGS
from src.posts import load_posts


PREBUILT_DIR = BASE / "data"
RUNTIME_DIR = BASE / ".cache" / "semantic-map"
_LOCK = RLock()
_INPUTS = (
    "requirements.txt",
    "src/semantic_map_state.py", "src/map_graph.py", "src/map_embeddings.py",
    "src/map_visibility.py", "src/map_anchors.py", "src/posts.py", "src/utils.py",
    "src/config.py", "src/theme.py", "src/i18n.py", "scripts/preview_semantic_map.py",
    "assets/brain.svg", "assets/semantic_map.js", "assets/semantic_map_neural.js",
    "assets/semantic_map_ambient.js", "assets/semantic_map_explanations.js",
    "assets/semantic_map_interaction.js", "locales/semantic_map_it.json",
    "locales/semantic_map_en.json",
)


@dataclass
class MapSnapshot:
    data: dict
    html: str

    @property
    def signature(self):
        return self.data["source_signature"]


def tag_usage(posts):
    usage = {}
    for post in posts:
        for tag in post["meta"].get("tags", []):
            tag = str(tag).strip().lower()
            if tag and tag not in MAP_EXCLUDED_TAGS:
                usage.setdefault(tag, set()).add(post["meta"]["slug"])
    return usage


def source_signature(posts):
    corpus = sorted(
        (post["meta"]["slug"], sorted({str(tag).strip().lower() for tag in post["meta"].get("tags", [])}))
        for post in posts
    )
    digest = hashlib.sha256(json.dumps(corpus, ensure_ascii=False).encode("utf-8"))
    for name in _INPUTS:
        digest.update(name.encode("utf-8"))
        digest.update((BASE / name).read_bytes().replace(b"\r\n", b"\n"))
    return digest.hexdigest()


def current_source_signature(include_future=False):
    return source_signature(load_posts(include_future=include_future))


def _read_json(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, UnicodeError):
        return {}


def _write_atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                         dir=path.parent, suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(text)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def _write_json(path, data):
    _write_atomic(path, json.dumps(data, ensure_ascii=False, indent=2))


def _read_vectors(directory):
    from src.map_embeddings import MODEL_NAME

    cache = _read_json(directory / "semantic_map_vectors.json")
    if cache.get("model") != MODEL_NAME or not isinstance(cache.get("terms"), dict):
        return {}
    return {
        tag: vector for tag, vector in cache["terms"].items()
        if vector is None or (
            isinstance(vector, list) and len(vector) == 50
            and all(isinstance(value, (int, float)) and math.isfinite(value) for value in vector)
        )
    }


def vectors_for_posts(posts, output_dir):
    from src.map_embeddings import MODEL_NAME, load_embedding_model, vector_for_term

    output_dir = Path(output_dir)
    terms = {**_read_vectors(PREBUILT_DIR), **_read_vectors(output_dir)}
    required = set(tag_usage(posts))
    missing = required - terms.keys()
    if missing:
        model = load_embedding_model()
        for tag in sorted(missing):
            vector = vector_for_term(model, tag)
            terms[tag] = vector.tolist() if vector is not None else None
    cache = {"model": MODEL_NAME, "terms": dict(sorted(terms.items()))}
    if _read_json(output_dir / "semantic_map_vectors.json") != cache:
        _write_json(output_dir / "semantic_map_vectors.json", cache)
    return {tag: vector for tag, vector in terms.items() if vector is not None}


def build_map_data(posts, vectors):
    from src.map_graph import build_semantic_map

    data = build_semantic_map(posts, vectors)
    data["source_signature"] = source_signature(posts)
    return data


def _read_snapshot(directory, posts, signature):
    data = _read_json(directory / "semantic_map.json")
    if data.get("source_signature") != signature or data.get("post_count") != len(posts):
        return None
    try:
        usage = {node["tag"]: set(node["posts"]) for node in data["nodes"]}
        if usage != tag_usage(posts):
            return None
        html = (directory / "semantic_map_preview.html").read_text(encoding="utf-8")
        if not re.search(r'"sourceSignature"\s*:\s*"' + signature + '"', html) or not html.rstrip().endswith("</html>"):
            return None
        return MapSnapshot(data, html)
    except (OSError, UnicodeError, KeyError, TypeError, ValueError):
        return None


def load_current_map(include_future=False):
    with _LOCK:
        posts = load_posts(include_future=include_future)
        signature = source_signature(posts)
        for directory in (PREBUILT_DIR, RUNTIME_DIR):
            snapshot = _read_snapshot(directory, posts, signature)
            if snapshot is not None:
                return snapshot

        from scripts.preview_semantic_map import render_preview

        vectors = vectors_for_posts(posts, RUNTIME_DIR)
        data = build_map_data(posts, vectors)
        html = render_preview(data)
        _write_json(RUNTIME_DIR / "semantic_map.json", data)
        _write_atomic(RUNTIME_DIR / "semantic_map_preview.html", html)
        return MapSnapshot(data, html)
