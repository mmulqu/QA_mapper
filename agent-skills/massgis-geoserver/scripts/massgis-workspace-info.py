from __future__ import annotations

import argparse

from massgis_geoserver_common import add_common_args, build_client_from_args, run_and_print


def main() -> int:
    parser = argparse.ArgumentParser(prog="massgis-workspace-info")
    add_common_args(parser)
    args = parser.parse_args()

    client = build_client_from_args(args)
    return run_and_print(lambda: client.workspace_info())


if __name__ == "__main__":
    raise SystemExit(main())
