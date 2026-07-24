from __future__ import annotations

import argparse

from massgis_geoserver_common import add_common_args, build_client_from_args, run_and_print


def main() -> int:
    parser = argparse.ArgumentParser(prog="massgis-get-bbox")
    add_common_args(parser)
    parser.add_argument("--municipality", required=True, help="Town name (e.g., CAMBRIDGE)")
    args = parser.parse_args()

    client = build_client_from_args(args)
    return run_and_print(lambda: client.get_bbox(municipality=args.municipality))


if __name__ == "__main__":
    raise SystemExit(main())
