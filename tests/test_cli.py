import json
from pathlib import Path

import pytest

from pro_tour.cli import main


def test_validate_config_is_useful_and_does_not_print_values(example, tmp_path, capsys):
    path = tmp_path / "config.json"
    path.write_text(json.dumps(example))
    assert main(["validate-config", str(path)]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["status"] == "valid"
    assert len(output["config_sha256"]) == 64


def test_invalid_config_exits_nonzero_without_echoing_input(tmp_path, capsys):
    path = tmp_path / "config.json"
    path.write_text('{"secret-key-canary": "secret-value-canary"}')
    with pytest.raises(SystemExit) as result:
        main(["validate-config", str(path)])
    assert result.value.code == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert "canary" not in output.err
    assert "pro-tour: config:" in output.err


def test_doctor_cannot_claim_readiness_when_tools_are_missing(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("PATH", str(tmp_path))
    path = tmp_path / "inventory.json"
    assert main(["doctor", "--output", str(path)]) == 0
    report = json.loads(path.read_text())
    assert report["integration_ready"] is False
    assert set(report["integration_checks"].values()) == {"not-tested"}
    assert all(probe["status"] == "missing" for probe in report["tools"])
    assert "unverified" in capsys.readouterr().out


def test_doctor_requires_a_new_evidence_path(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("PATH", str(tmp_path))
    path = tmp_path / "existing.json"
    path.write_text("original")
    with pytest.raises(SystemExit) as result:
        main(["doctor", "--output", str(path)])
    assert result.value.code == 2
    assert Path(path).read_text() == "original"
    assert "new path" in capsys.readouterr().err
