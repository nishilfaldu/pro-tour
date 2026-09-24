"""Parse a bounded, data-only configuration. This module never executes app code.

Callers must obtain configuration from an authenticated trusted base revision.
Passing validation does not authenticate a file or enforce runtime isolation.
"""

import hashlib
import json
import re
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator

MAX_CONFIG_BYTES = 64 * 1024
_SCHEMA = json.loads(files("pro_tour").joinpath("config.schema.json").read_text())
_VALIDATOR = Draft202012Validator(_SCHEMA)


class ConfigError(ValueError):
    """An actionable diagnostic containing no configuration values."""


@dataclass(frozen=True)
class Journey:
    id: str
    goal: str
    checkpoints: tuple[str, ...]


@dataclass(frozen=True)
class Budgets:
    install_seconds: int
    run_seconds: int
    tour_seconds: int
    actions_per_tour: int
    provider_calls: int
    provider_timeout_seconds: int
    tour_attempts: int


@dataclass(frozen=True)
class AppConfig:
    root: str
    install: tuple[str, ...]
    build: tuple[str, ...] | None
    start: tuple[str, ...]
    url: str
    port: int
    readiness_timeout_seconds: int
    public_env: tuple[tuple[str, str], ...]
    allowed_origins: tuple[str, ...]


@dataclass(frozen=True)
class Config:
    app: AppConfig
    app_paths: tuple[str, ...]
    journeys: tuple[Journey, ...]
    reset_instructions: str
    budgets: Budgets
    sha256: str


def _object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ConfigError("config: duplicate object key; remove the duplicate")
        result[key] = value
    return result


def _constant(_: str) -> None:
    raise ConfigError("config: non-finite numbers are not valid JSON")


def _location(path) -> str:
    # Object keys can themselves contain accidentally pasted credentials or CI
    # annotation injection. Display only code-owned schema property names.
    known = {"app_paths", "journeys", "app", "reset", "budgets", "version"}
    for name in ("app", "reset", "budgets"):
        known.update(_SCHEMA["properties"][name]["properties"])
    known.update({"id", "goal", "checkpoints"})
    return "config" + "".join(
        f"[{part}]" if isinstance(part, int) else f".{part if part in known else '<key>'}"
        for part in path
    )


def _path(value: str, location: str, *, glob: bool = False) -> None:
    if value == "." and not glob:
        return
    # A deliberately small, repository-relative POSIX path/glob grammar. '**'
    # occupies a whole segment; '!' and brace/character-class expansion aren't
    # supported. The future changed-file matcher must use this exact contract.
    alphabet = r"[A-Za-z0-9_.*?/-]+" if glob else r"[A-Za-z0-9_. /-]+"
    parts = value.split("/")
    if (
        not re.fullmatch(alphabet, value)
        or any(part in {"", ".", "..", ".git"} for part in parts)
        or any(part.startswith("-") or part != part.strip() for part in parts)
        or (glob and any("**" in part and part != "**" for part in parts))
    ):
        raise ConfigError(
            f"{location}: use a contained relative POSIX {'glob' if glob else 'path'}"
        )


def parse_config(raw: bytes) -> Config:
    if len(raw) > MAX_CONFIG_BYTES:
        raise ConfigError("config: exceeds the 64 KiB limit")
    try:
        data = json.loads(raw, object_pairs_hook=_object, parse_constant=_constant)
    except (ValueError, UnicodeError, RecursionError) as exc:
        if isinstance(exc, ConfigError):
            raise
        raise ConfigError("config: supply valid UTF JSON without excessive nesting") from None
    error = next(_VALIDATOR.iter_errors(data), None)
    if error:
        # jsonschema's error.message contains instance values. Never print it.
        hint = {
            "required": "missing a required field; see the configuration schema",
            "additionalProperties": "unknown field; remove unsupported configuration",
            "propertyNames": "use a public environment variable name",
            "type": "wrong value type; see the configuration schema",
            "pattern": "invalid format; see the configuration schema",
        }.get(error.validator, f"outside the schema's {error.validator} constraint")
        raise ConfigError(f"{_location(error.absolute_path)}: {hint}")

    app = data["app"]
    _path(app["root"], "config.app.root")
    for index, pattern in enumerate(data["app_paths"]):
        _path(pattern, f"config.app_paths[{index}]", glob=True)
    for operation in ("install", "build", "start"):
        if operation in app:
            executable = app[operation][0]
            if not executable.strip() or executable.startswith("-"):
                raise ConfigError(f"config.app.{operation}[0]: supply an executable name")

    # Only the workflow-started local app can be a page origin. These checks do
    # not authorize controller egress or substitute for container firewall rules.
    url = app["url"]
    if not re.fullmatch(r"http://(?:localhost|127\.0\.0\.1|\[::1\]):[0-9]+(?:/[^\s?#]*)?", url):
        raise ConfigError("config.app.url: use http://localhost:<port>/ (or loopback IP)")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        raise ConfigError("config.app.url: invalid local port") from None
    if port != app["port"] or parsed.netloc.rsplit(":", 1)[-1] != str(port):
        raise ConfigError("config.app.url: explicit canonical port must equal app.port")
    if "\\" in url or "%" in url or any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise ConfigError("config.app.url: encoded paths, backslashes and controls are unsupported")
    origin = f"http://{parsed.netloc}"
    if app["allowed_origins"] != [origin]:
        raise ConfigError("config.app.allowed_origins: allow exactly the local app origin")

    ids = [journey["id"] for journey in data["journeys"]]
    if len(set(ids)) != len(ids):
        raise ConfigError("config.journeys: every journey must have a unique id")
    # JSON Schema accepts integral JSON numbers such as 60.0 as integers.
    # Normalize them so downstream counters/deadlines have the promised types.
    budgets = Budgets(**{name: int(value) for name, value in data["budgets"].items()})
    if budgets.tour_seconds * 2 > budgets.run_seconds:
        raise ConfigError("config.budgets.run_seconds: must cover at least two tour durations")
    if budgets.provider_timeout_seconds > budgets.tour_seconds:
        raise ConfigError("config.budgets.provider_timeout_seconds: cannot exceed tour_seconds")

    return Config(
        app=AppConfig(
            root=app["root"],
            install=tuple(app["install"]),
            build=tuple(app["build"]) if "build" in app else None,
            start=tuple(app["start"]),
            url=url,
            port=int(app["port"]),
            readiness_timeout_seconds=int(app["readiness_timeout_seconds"]),
            public_env=tuple(sorted(app["public_env"].items())),
            allowed_origins=(origin,),
        ),
        app_paths=tuple(data["app_paths"]),
        journeys=tuple(
            Journey(item["id"], item["goal"], tuple(item["checkpoints"]))
            for item in data["journeys"]
        ),
        reset_instructions=data["reset"]["instructions"],
        budgets=budgets,
        sha256=hashlib.sha256(raw).hexdigest(),
    )


def load_config(path: Path) -> Config:
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_CONFIG_BYTES + 1)
    except OSError:
        raise ConfigError(
            "config: cannot read file; supply an existing readable configuration"
        ) from None
    return parse_config(raw)
