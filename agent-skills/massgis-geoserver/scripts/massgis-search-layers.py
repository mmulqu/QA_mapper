from __future__ import annotations

import argparse

from massgis_geoserver_common import add_common_args, build_client_from_args, run_and_print


def main() -> int:
    parser = argparse.ArgumentParser(prog="massgis-search-layers")
    add_common_args(parser)
    parser.add_argument("--query", required=True, help="Search terms (e.g., wetlands schools parcels)")
    parser.add_argument("--category", help="Category filter (e.g., Environment)")
    parser.add_argument("--limit", type=int, default=10, help="Max results")
    args = parser.parse_args()

    client = build_client_from_args(args)
    return run_and_print(
        lambda: client.search_layers(
            query=args.query,
            category=args.category,
            limit=args.limit,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
