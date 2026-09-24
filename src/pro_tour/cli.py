import argparse
import json
import os
from pathlib import Path

from pro_tour.config import ConfigError, load_config
from pro_tour.evidence import write_report
from pro_tour.prerequisites import inventory


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="pro-tour", description="Pro Tour configuration and prerequisite tools"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser(
        "validate-config", help="validate data without executing commands"
    )
    validate.add_argument("path", type=Path)
    doctor = commands.add_parser(
        "doctor", help="inventory local tools; does not prove integrations"
    )
    doctor.add_argument("--output", type=Path, required=True, help="new JSON evidence file")
    doctor.add_argument(
        "--secrets-file", type=Path, help="optional dotenv presence check; never sourced"
    )
    arguments = parser.parse_args(argv)
    if arguments.command == "validate-config":
        try:
            config = load_config(arguments.path)
        except ConfigError as error:
            # Values and unrecognized keys are excluded by ConfigError.
            parser.exit(2, f"pro-tour: {error}\n")
        print(json.dumps({"status": "valid", "config_sha256": config.sha256}))
        return 0
    try:
        report = inventory(os.environ, arguments.secrets_file)
        write_report(arguments.output, report)
    except OSError:
        parser.exit(
            2, "pro-tour: cannot create report; supply a new path in a writable directory\n"
        )
    print("Prerequisite inventory saved. Integration readiness is unverified; see the report.")
    # Exit 0 means the read-only inventory succeeded, not that the pipeline works.
    return 0
