import hashlib
import json
from dataclasses import FrozenInstanceError
from importlib.resources import files

import pytest
from jsonschema import Draft202012Validator

from pro_tour.config import MAX_CONFIG_BYTES, ConfigError, load_config, parse_config


def parse(data):
    return parse_config(json.dumps(data).encode())


def test_example_and_packaged_schema_are_valid(example):
    schema = json.loads(files("pro_tour").joinpath("config.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    raw = json.dumps(example).encode()
    config = parse_config(raw)
    assert config.sha256 == hashlib.sha256(raw).hexdigest()
    assert config.app.port == 4173
    assert config.app.start[0:3] == ("npm", "run", "preview")
    assert [journey.id for journey in config.journeys] == [
        "create-task",
        "edit-task",
        "change-status",
    ]
    # Editing the input after validation must not widen the validated policy.
    example["app"]["allowed_origins"].append("https://attacker.example")
    example["app"]["public_env"]["VITE_DEMO_MODE"] = "changed"
    assert config.app.allowed_origins == ("http://localhost:4173",)
    assert config.app.public_env == (("VITE_DEMO_MODE", "true"),)
    with pytest.raises(FrozenInstanceError):
        config.app.port = 80


@pytest.mark.parametrize(
    "path",
    [
        "/tmp",
        "../outside",
        "a/../../x",
        "a//b",
        "./app",
        "a/.git/hooks",
        "a/./b",
        "a\\b",
        "-C",
        "a\nnext",
        "a/",
        "a/ b",
    ],
)
def test_rejects_uncontained_roots(example, path):
    example["app"]["root"] = path
    with pytest.raises(ConfigError, match="config.app.root"):
        parse(example)


@pytest.mark.parametrize("path", [".", "samples/task-board", "apps/my app"])
def test_supported_roots(example, path):
    example["app"]["root"] = path
    assert parse(example).app.root == path


@pytest.mark.parametrize("glob", ["../**", "/**", "!docs/**", "a/**x", "a/{x,y}", "a/[xy]", "a//b"])
def test_rejects_unsupported_path_globs(example, glob):
    example["app_paths"] = [glob]
    with pytest.raises(ConfigError, match="app_paths"):
        parse(example)


@pytest.mark.parametrize(
    "url",
    [
        "https://localhost:4173/",
        "http://attacker.example:4173/",
        "http://localhost.attacker:4173/",
        "http://user:password@localhost:4173/",
        "http://localhost:4173/#fragment",
        "http://localhost:4173/?secret=value",
        "http://localhost:4173/\\attacker",
        "http://localhost:4173/%2f%2fattacker",
        "http://localhost:4173/\n",
        "http://127.1:4173/",
        "http://2130706433:4173/",
        "http://[::ffff:127.0.0.1]:4173/",
        "http://localhost:04173/",
        "http://localhost:99999/",
        "http://localhost:4174/",
        "http://localhost:4173@attacker/",
        "http://localhost/",
    ],
)
def test_rejects_origin_and_url_bypasses(example, url):
    example["app"]["url"] = url
    with pytest.raises(ConfigError, match="config.app.url"):
        parse(example)


@pytest.mark.parametrize(
    "origin", ["http://localhost:4173", "http://127.0.0.1:4173", "http://[::1]:4173"]
)
def test_loopback_origins(example, origin):
    example["app"]["url"] = origin + "/board"
    example["app"]["allowed_origins"] = [origin]
    assert parse(example).app.allowed_origins == (origin,)


def test_allowed_origins_cannot_authorize_provider_or_extra_local_services(example):
    for origins in (
        ["https://api.typesafe.ai"],
        ["http://localhost:4174"],
        ["http://localhost:4173", "https://api.github.com"],
    ):
        example["app"]["allowed_origins"] = origins
        with pytest.raises(ConfigError, match="allowed_origins"):
            parse(example)


@pytest.mark.parametrize(
    "name",
    [
        "TYPESAFE_API_KEY",
        "CURSOR_API_KEY",
        "GH_MEDIA_TOKEN",
        "TEXT_MODEL",
        "TEXT_MODEL_API_KEY",
        "TEXT_MODEL_BASE_URL",
        "PATH",
        "HOME",
        "NODE_OPTIONS",
        "PYTHONPATH",
        "LD_PRELOAD",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "GITHUB_TOKEN",
        "VITE_INVALID\n",
    ],
)
def test_only_public_environment_names(example, name):
    example["app"]["public_env"] = {name: "SYNTHETIC-CREDENTIAL-CANARY"}
    with pytest.raises(ConfigError) as error:
        parse(example)
    assert "SYNTHETIC-CREDENTIAL-CANARY" not in str(error.value)
    assert name not in str(error.value)


@pytest.mark.parametrize(
    "section, name",
    [
        (None, "controller"),
        (None, "model"),
        (None, "$schema"),
        ("app", "mounts"),
        ("app", "network"),
        ("app", "env_file"),
        ("reset", "command"),
        ("budgets", "unbounded"),
    ],
)
def test_rejects_extensions_to_privileged_policy(example, section, name):
    (example if section is None else example[section])[name] = "credential-canary"
    with pytest.raises(ConfigError, match="unknown field") as error:
        parse(example)
    assert "credential-canary" not in str(error.value)


@pytest.mark.parametrize(
    "name, value",
    [
        ("actions_per_tour", 101),
        ("tour_attempts", 4),
        ("provider_calls", 501),
        ("install_seconds", 901),
        ("run_seconds", 3601),
        ("tour_seconds", 601),
        ("provider_timeout_seconds", 121),
        ("tour_attempts", True),
        ("run_seconds", 30),
    ],
)
def test_budget_limits(example, name, value):
    example["budgets"][name] = value
    with pytest.raises(ConfigError, match="budgets"):
        parse(example)


def test_provider_call_timeout_fits_tour(example):
    example["budgets"]["tour_seconds"] = 10
    with pytest.raises(ConfigError, match="provider_timeout_seconds"):
        parse(example)


def test_integral_json_numbers_produce_integer_runtime_fields(example):
    example["app"]["port"] = 4173.0
    example["app"]["readiness_timeout_seconds"] = 60.0
    example["budgets"] = {key: float(value) for key, value in example["budgets"].items()}
    config = parse(example)
    assert type(config.app.port) is int
    assert type(config.app.readiness_timeout_seconds) is int
    assert type(config.budgets.actions_per_tour) is int


@pytest.mark.parametrize("argv", ["npm run dev", [], [""], [" "], ["-x"], ["npm", "bad\nargument"]])
def test_commands_must_be_argument_arrays(example, argv):
    example["app"]["start"] = argv
    with pytest.raises(ConfigError, match="start"):
        parse(example)


def test_parser_never_expands_or_executes_commands(example, tmp_path):
    marker = tmp_path / "must-not-exist"
    example["app"]["start"] = ["sh", "-c", f"touch {marker}"]
    example["app"]["public_env"] = {"PUBLIC_LITERAL": "${HOME}"}
    config = parse(example)
    assert config.app.public_env == (("PUBLIC_LITERAL", "${HOME}"),)
    assert not marker.exists()


def test_duplicate_journeys_fail(example):
    example["journeys"][1]["id"] = example["journeys"][0]["id"]
    with pytest.raises(ConfigError, match="unique id"):
        parse(example)


@pytest.mark.parametrize("value", ["text\n", "text\r", "text\x00", "text\x7f", "\n", "   "])
def test_descriptive_text_cannot_smuggle_controls(example, value):
    example["journeys"][0]["goal"] = value
    with pytest.raises(ConfigError, match="goal"):
        parse(example)


def test_schema_does_not_allow_newline_suffixes(example):
    for field in ("id", "goal"):
        modified = json.loads(json.dumps(example))
        modified["journeys"][0][field] += "\n"
        with pytest.raises(ConfigError):
            parse(modified)
    example["app"]["public_env"] = {"VITE_TITLE": "text\n"}
    with pytest.raises(ConfigError):
        parse(example)


@pytest.mark.parametrize(
    "raw",
    [
        b"{",
        b"{} trailing",
        b"[]",
        b"null",
        b'{"version":NaN}',
        b'{"version":1,"version":1}',
        b"\xff",
        b"[" * 2000,
        b" " * (MAX_CONFIG_BYTES + 1),
    ],
)
def test_invalid_documents_have_safe_errors(raw):
    with pytest.raises(ConfigError):
        parse_config(raw)


def test_diagnostics_do_not_echo_unknown_keys_or_values(example):
    example["app"]["public_env"] = {"secret-canary\n::error::injected": "other-canary"}
    with pytest.raises(ConfigError) as error:
        parse(example)
    assert "canary" not in str(error.value)
    assert "\n" not in str(error.value)


def test_missing_and_oversized_file(tmp_path):
    with pytest.raises(ConfigError, match="cannot read"):
        load_config(tmp_path / "missing")
    path = tmp_path / "config.json"
    path.write_bytes(b" " * (MAX_CONFIG_BYTES + 1))
    with pytest.raises(ConfigError, match="64 KiB"):
        load_config(path)
