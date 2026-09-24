"""Run the pristine Jev preflight, after building its trusted pinned image."""

import argparse
from pathlib import Path

from pro_tour.jev_preflight import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--secrets-file",
        type=Path,
        help="optional; omitted means credential-free boundary check only",
    )
    parser.add_argument("--negative-control", action="store_true")
    args = parser.parse_args()
    raise SystemExit(
        run(args.image, args.output, args.secrets_file, negative_control=args.negative_control)
    )
