from __future__ import annotations

import argparse

from massgis_geoserver_common import add_common_args, build_client_from_args, run_and_print


def main() -> int:
    parser = argparse.ArgumentParser(prog="massgis-find-nearby")
    add_common_args(parser)
    parser.add_argument("--layer-id", required=True, help="Layer ID")
    parser.add_argument("--latitude", required=True, type=float, help="Latitude (WGS84)")
    parser.add_argument("--longitude", required=True, type=float, help="Longitude (WGS84)")
    parser.add_argument("--radius-meters", type=float, default=1000, help="Search radius in meters")
    parser.add_argument("--max-features", type=int, default=5000, help="Max features to return")
    args = parser.parse_args()

    client = build_client_from_args(args)
    return run_and_print(
        lambda: client.find_nearby(
            layer_id=args.layer_id,
            latitude=args.latitude,
            longitude=args.longitude,
            radius_meters=args.radius_meters,
            max_features=args.max_features,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
