import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from src.map_embeddings import (
    MODEL_NAME,
    load_embedding_model,
)
from src.map_graph import build_semantic_map
from src.posts import load_posts


DEFAULT_OUTPUT = ROOT / "data" / "semantic_map.json"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build the print(human) semantic tag map."
    )

    parser.add_argument(
        "--include-future",
        action="store_true",
        help="Include published posts with a future date.",
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="JSON output path.",
    )

    return parser.parse_args()


def format_neighbors(node):
    neighbors = node.get("neighbors", [])

    if not neighbors:
        return "-"

    return ", ".join(
        item["tag"]
        for item in neighbors
    )


def format_semantic_neighbors(node):
    neighbors = node.get(
        "semantic_neighbors",
        [],
    )

    if not neighbors:
        return "-"

    return ", ".join(
        f'{item["tag"]}(mix={item.get("affinity", item["semantic"]):.2f},g={item["semantic"]:.2f},ph={item.get("corpus_signal", item.get("jaccard", 0.0)):.2f})'
        for item in neighbors[:4]
    )


def format_context(node):
    context = node.get("context", [])

    if not context:
        return "-"

    return ", ".join(
        item["tag"]
        for item in context[:3]
    )


def system_label(node):
    label = str(node.get("system_label", "")).strip()

    if label:
        return label

    cores = node.get("system_core_tags", [])
    return " / ".join(cores) or "unresolved"


def print_report(data):
    print()
    print('print("human") semantic map')
    print("=" * 132)
    print(f'Model:              {data["model"]}')
    print(f'Layout:             {data.get("layout_mode", "-")}')
    print(f'Posts:              {data["post_count"]}')
    print(f'All tags:           {data["all_tag_count"]}')
    print(f'Map tags:           {data["tag_count"]}')
    print(f'Excluded tags:      {data["excluded_tag_count"]}')
    print(f'Systems:            {data.get("system_count", data["cluster_count"])}')
    print(f'Layout kNN:         {data.get("layout_knn", 0)}')
    print(f'Layout stress:      {data.get("layout_stress", 0.0):.4f}')
    print(f'Corpus max boost:   {data.get("layout_corpus_max_boost", 0.0):.0%}')
    print(f'Base vector:        {data["base_vector_weight"]:.0%}')
    print(f'Blog context links: {data["context_vector_weight"]:.0%}')
    print()

    header = (
        f'{"TAG":<15}'
        f'{"WEIGHT":>8}  '
        f'{"SYSTEM":<28}'
        f'{"HYBRID NEIGHBORS":<50}'
        f'{"LINK NEIGHBORS":<27}'
        f'CONTEXT'
    )

    print(header)
    print("-" * 132)

    nodes = sorted(
        data["nodes"],
        key=lambda node: (
            -node["weight"],
            node["tag"],
        ),
    )

    for node in nodes:
        print(
            f'{node["tag"]:<15}'
            f'{node["weight"]:>8.2f}  '
            f'{system_label(node):<28}'
            f'{format_semantic_neighbors(node):<50}'
            f'{format_neighbors(node):<27}'
            f'{format_context(node)}'
        )

    if data.get("systems"):
        print()
        print("Semantic systems:")

        for system in data["systems"]:
            cores = ", ".join(
                system.get("core_tags", [])
            )
            members = ", ".join(
                system.get("tags", [])
            )
            label = system.get("label") or cores or "unresolved"
            print(
                f'  {label}: '
                f'core=[{cores}] '
                f'tags=[{members}]'
            )

    if data.get("excluded_tags"):
        print()
        print("Tags kept in the blog but excluded from geography:")

        for item in data["excluded_tags"]:
            print(
                f'  - {item["tag"]} '
                f'({item["count"]} posts)'
            )

    if data.get("unresolved_tags"):
        print()
        print("Geographic tags without a usable word vector:")

        for tag in data["unresolved_tags"]:
            print(f"  - {tag}")

    print()


def main():
    args = parse_args()

    posts = load_posts(
        include_future=args.include_future
    )

    print(f"Loading model {MODEL_NAME}...")
    model = load_embedding_model()

    data = build_semantic_map(
        posts,
        model,
    )

    output_path = args.output.resolve()
    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print_report(data)
    print("JSON saved to:")
    print(output_path)


if __name__ == "__main__":
    main()
