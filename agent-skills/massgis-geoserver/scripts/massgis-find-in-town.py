from __future__ import annotations

import argparse

from massgis_geoserver_common import add_common_args, build_client_from_args, run_and_print


def main() -> int:
    parser = argparse.ArgumentParser(prog="massgis-find-in-town")
    add_common_args(parser)
    parser.add_argument("--layer-id", required=True, help="Layer ID")
    parser.add_argument("--municipality", required=True, help="Town name (e.g., BOSTON)")
    parser.add_argument("--max-features", type=int, default=5000, help="Max features to return")
    args = parser.parse_args()

    client = build_client_from_args(args)
    return run_and_print(
        lambda: client.find_in_town(
            layer_id=args.layer_id,
            municipality=args.municipality,
            max_features=args.max_features,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
