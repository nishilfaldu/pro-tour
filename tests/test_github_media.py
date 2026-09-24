import hashlib
import io
import subprocess
import tarfile
from pathlib import Path

import pytest
from test_sandbox import IMAGE, FakeDocker

from pro_tour import github_media
from pro_tour.github_media import (
    LABELS,
    MediaSession,
    install_gh,
    read_media_token,
    run_cli,
    validate_comment,
)
from pro_tour.sandbox import SandboxError

URLS = [
    "https://github.com/user-attachments/assets/" + x
    for x in ("01234567-89ab-cdef-0123-456789abcdef", "fedcba98-7654-3210-fedc-ba9876543210")
]
BODY = f"{LABELS[0]}\n\n{URLS[0]}\n\n{LABELS[1]}\n\n{URLS[1]}"


def test_two_inline_video_body_has_exact_labels_and_distinct_github_assets():
    assert validate_comment(BODY) == URLS


@pytest.mark.parametrize(
    "body",
    [
        BODY + "\n\nExtra summary",
        BODY.replace(URLS[1], URLS[0]),
        BODY.replace(
            "github.com/user-attachments/assets", "github.com/owner/repo/releases/download"
        ),
        BODY.replace("github.com", "github.com.evil.example"),
        BODY.replace(URLS[0], "[Download](" + URLS[0] + ")"),
        BODY.replace(URLS[0], URLS[0] + "?token=synthetic"),
        BODY.replace(URLS[0], "https://github.com/user-attachments/assets/" + "-" * 36),
        BODY.replace(LABELS[0], "Wrong label"),
        None,
    ],
)
def test_comment_rejects_links_partial_pairs_duplicates_or_extra_content(body):
    with pytest.raises(SandboxError):
        validate_comment(body)


def test_cli_uses_only_media_token_and_fresh_config_without_shell(monkeypatch, tmp_path):
    for name in (
        "TYPESAFE_API_KEY",
        "CURSOR_API_KEY",
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "GH_DEBUG",
        "GH_CONFIG_DIR",
        "GH_HOST",
        "TEXT_MODEL_API_KEY",
        "HTTP_PROXY",
    ):
        monkeypatch.setenv(name, "ambient-canary")
    seen = []

    def fake(argv, **options):
        seen.append(options["cwd"])
        env = options["env"]
        assert argv == [str(tmp_path / "gh"), "api", "user"]
        assert options["input"] == "synthetic stdin"
        assert "shell" not in options
        assert env["GH_TOKEN"] == "media-only"
        assert env["GH_HOST"] == "github.com"
        assert env["HOME"] == options["cwd"]
        assert env["GH_CONFIG_DIR"].startswith(options["cwd"] + "/")
        assert "ambient-canary" not in env.values()
        assert not Path(env["GH_CONFIG_DIR"]).exists()
        return subprocess.CompletedProcess(argv, 0, '{"login":"fixture"}', "")

    monkeypatch.setattr(subprocess, "run", fake)
    for _ in range(2):
        result = run_cli(tmp_path / "gh", "media-only", ["api", "user"], "synthetic stdin")
        assert result["credential_names"] == ["GH_TOKEN"]
    assert seen[0] != seen[1] and all(not Path(p).exists() for p in seen)


@pytest.mark.parametrize("failure", ["stdout", "stderr", "timeout", "budget"])
def test_cli_failures_never_return_credential_or_unbounded_output(monkeypatch, failure):
    def fake(argv, **_):
        if failure == "timeout":
            raise subprocess.TimeoutExpired(argv, 120, output="media-only")
        return subprocess.CompletedProcess(
            argv,
            0,
            "media-only"
            if failure == "stdout"
            else ("x" * (4 * 1024 * 1024 + 1) if failure == "budget" else ""),
            "media-only" if failure == "stderr" else "",
        )

    monkeypatch.setattr(subprocess, "run", fake)
    with pytest.raises(SandboxError) as error:
        run_cli(Path("/trusted/gh"), "media-only", ["api", "user"])
    assert "media-only" not in str(error.value)


def test_media_client_has_only_private_upload_socket_no_direct_network_or_host_files():
    docker = FakeDocker()
    with MediaSession(docker, IMAGE) as session:
        session.start_clients()
        command = [c for c in docker.calls if c[0] == "create"][-1]
        assert command[command.index("--network") + 1] == "none"
        assert any("dst=/run/pro-tour/media,readonly" in a for a in command)
        assert not any("type=bind" in a or "control" in a for a in command)
        assert not any("TOKEN=" in a for a in command)
    assert not docker.containers and not docker.volumes


def test_media_key_reader_ignores_other_assignments(tmp_path):
    path = tmp_path / "env"
    path.write_text("TYPESAFE_API_KEY=other\nGH_MEDIA_TOKEN='media-only'\nCURSOR_API_KEY=other\n")
    assert read_media_token(path) == "media-only"


@pytest.mark.parametrize(
    "line",
    [
        "",
        "GH_MEDIA_TOKEN=",
        "GH_MEDIA_TOKEN=$(bad)",
        "GH_MEDIA_TOKEN=`bad`",
        "GH_MEDIA_TOKEN='unclosed",
        "GH_MEDIA_TOKEN=first\nGH_MEDIA_TOKEN=second",
    ],
)
def test_media_key_reader_rejects_ambiguous_or_executable_assignment(tmp_path, line):
    path = tmp_path / "env"
    path.write_text(line)
    with pytest.raises(SandboxError):
        read_media_token(path)


def test_installer_verifies_archive_before_extracting_only_the_executable(monkeypatch, tmp_path):
    archive = tmp_path / "release.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for name, data in [
            ("gh_2.101.0_linux_arm64/bin/gh", b"synthetic binary"),
            ("../../outside", b"not extracted"),
        ]:
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            tar.addfile(entry, io.BytesIO(data))
    destination = tmp_path / "installed/gh"
    with pytest.raises(SandboxError, match="checksum"):
        install_gh(archive, destination, "linux_arm64")
    assert not destination.exists()
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    monkeypatch.setitem(github_media.ARCHIVES, "linux_arm64", ("tar.gz", digest))
    evidence = install_gh(archive, destination, "linux_arm64")
    assert destination.read_bytes() == b"synthetic binary"
    assert evidence["archive_sha256"] == digest
    assert sorted(p.name for p in destination.parent.iterdir()) == ["gh"]
    with pytest.raises(SandboxError, match="new destination"):
        install_gh(archive, destination, "linux_arm64")
