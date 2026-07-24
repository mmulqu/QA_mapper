from __future__ import annotations

import argparse

from massgis_geoserver_common import add_common_args, build_client_from_args, run_and_print


def main() -> int:
    parser = argparse.ArgumentParser(prog="massgis-query")
    add_common_args(parser)
    parser.add_argument("--layer-id", required=True, help="Layer ID")
    parser.add_argument("--cql-filter", help="ECQL/CQL filter expression")
    parser.add_argument("--max-features", type=int, default=5000, help="Max features to return")
    parser.add_argument("--start-index", type=int, default=0, help="Pagination offset")
    parser.add_argument("--sort-by", help="Sort field (e.g., ACRES+D)")
    args = parser.parse_args()

    client = build_client_from_args(args)
    return run_and_print(
        lambda: client.query(
            layer_id=args.layer_id,
            cql_filter=args.cql_filter,
            max_features=args.max_features,
            start_index=args.start_index,
            sort_by=args.sort_by,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
