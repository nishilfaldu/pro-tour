import json
import os
import sys
import time
from pathlib import Path

import pytest

from pro_tour.evidence import sha256_file, write_report
from pro_tour.prerequisites import (
    SECRET_NAMES,
    TEXT_MODEL_NAMES,
    Probe,
    probe_environment,
    run_probe,
    secret_presence,
)


def test_presence_never_sources_dotenv_or_returns_values(tmp_path):
    path = tmp_path / "secrets"
    marker = tmp_path / "must-not-exist"
    path.write_text(
        'TYPESAFE_API_KEY="synthetic-key-one"\n'
        "export CURSOR_API_KEY='synthetic-key-two'\n"
        f"GH_MEDIA_TOKEN=$(touch {marker})\n"
    )
    result = secret_presence({}, path)
    assert result["names"] == {
        "TYPESAFE_API_KEY": "present",
        "CURSOR_API_KEY": "present",
        "GH_MEDIA_TOKEN": "unevaluated",
    }
    assert result["operational_validity"] == "not-tested"
    assert "synthetic-key" not in json.dumps(result)
    assert not marker.exists()


def test_presence_detects_empty_duplicate_missing_and_unreadable_values(tmp_path):
    path = tmp_path / "secrets"
    path.write_text('TYPESAFE_API_KEY=""\nCURSOR_API_KEY=a\nCURSOR_API_KEY=b\n')
    assert secret_presence({}, path)["names"] == {
        "TYPESAFE_API_KEY": "empty",
        "CURSOR_API_KEY": "invalid",
        "GH_MEDIA_TOKEN": "missing",
    }
    assert secret_presence({}, tmp_path / "missing")["file_status"] == "unreadable-or-invalid"
    assert secret_presence({"CURSOR_API_KEY": ""}, path)["names"]["CURSOR_API_KEY"] == "empty"


def test_probe_uses_synthetic_home_and_explicit_environment(monkeypatch, tmp_path):
    for name in (*SECRET_NAMES, *TEXT_MODEL_NAMES, "HTTPS_PROXY", "GITHUB_TOKEN", "BASH_ENV"):
        monkeypatch.setenv(name, "synthetic-private-canary")
    env_capture = tmp_path / "captured.json"
    executable = tmp_path / "probe"
    executable.write_text(
        f"#!{sys.executable}\nimport os, json\nfrom pathlib import Path\n"
        f"Path({str(env_capture)!r}).write_text(json.dumps(dict(os.environ)))\n"
        "print('tool 1.2.3')\nprint('synthetic-raw-output-canary')\n"
    )
    executable.chmod(0o700)
    report = run_probe(
        Probe("probe", ("probe", "--version"), r"tool (\d+\.\d+\.\d+)"), str(tmp_path)
    )
    actual = json.loads(env_capture.read_text())
    # macOS injects this noncredential encoding variable at interpreter startup.
    actual.pop("__CF_USER_TEXT_ENCODING", None)
    assert set(actual) == set(probe_environment(str(tmp_path), tmp_path))
    assert all(name not in actual for name in (*SECRET_NAMES, *TEXT_MODEL_NAMES))
    assert "synthetic-private-canary" not in json.dumps(actual)
    assert actual["HOME"] != str(Path.home())
    assert not Path(actual["HOME"]).exists()  # the temporary profile is cleaned up
    assert report["version"] == "1.2.3"
    assert report["executable_sha256"] == sha256_file(executable)
    assert "synthetic-raw-output-canary" not in json.dumps(report)


def test_missing_failing_and_timed_out_probes(tmp_path):
    probe = Probe("probe", ("probe", "--version"), r"tool (\d+\.\d+\.\d+)")
    assert run_probe(probe, str(tmp_path))["status"] == "missing"
    executable = tmp_path / "probe"
    executable.write_text(f"#!{sys.executable}\nraise SystemExit(3)\n")
    executable.chmod(0o700)
    failed = run_probe(probe, str(tmp_path))
    assert failed["status"] == "unavailable" and failed["exit_code"] == 3
    executable.write_text(f"#!{sys.executable}\nimport time\ntime.sleep(30)\n")
    started = time.monotonic()
    timed_out = run_probe(probe, str(tmp_path), timeout=0.05)
    assert time.monotonic() - started < 2
    assert timed_out["status"] == "timeout" and timed_out["exit_code"] is None


def test_unrecognized_output_is_not_a_success(tmp_path):
    executable = tmp_path / "probe"
    executable.write_text(f"#!{sys.executable}\nprint('credential-canary')\n")
    executable.chmod(0o700)
    result = run_probe(Probe("probe", ("probe",), r"tool (\d+\.\d+\.\d+)"), str(tmp_path))
    assert result["status"] == "unrecognized-version"
    assert "credential-canary" not in json.dumps(result)


def test_reports_are_private_and_never_overwrite_or_follow_links(tmp_path):
    output = tmp_path / "evidence.json"
    write_report(output, {"kind": "synthetic-test"})
    assert os.stat(output).st_mode & 0o777 == 0o600
    with pytest.raises(FileExistsError):
        write_report(output, {"kind": "overwrite"})
    link = tmp_path / "link.json"
    link.symlink_to(output)
    with pytest.raises(FileExistsError):
        write_report(link, {"kind": "overwrite"})
    assert json.loads(output.read_text()) == {"kind": "synthetic-test"}
