from __future__ import annotations

import argparse

from massgis_geoserver_common import add_common_args, build_client_from_args, run_and_print


def main() -> int:
    parser = argparse.ArgumentParser(prog="massgis-describe-schema")
    add_common_args(parser)
    parser.add_argument("--layer-id", required=True, help="Layer ID (e.g., massgis:GISDATA.WETLANDS_DEP_POLY)")
    args = parser.parse_args()

    client = build_client_from_args(args)
    return run_and_print(lambda: client.describe_schema(layer_id=args.layer_id))


if __name__ == "__main__":
    raise SystemExit(main())
