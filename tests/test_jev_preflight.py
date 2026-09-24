import pytest
from test_sandbox import IMAGE, FakeDocker

from pro_tour.jev_preflight import PristineSession, read_key
from pro_tour.sandbox import SandboxError


def test_preflight_has_disjoint_proxy_channels_and_no_browser_network():
    docker = FakeDocker()
    with PristineSession(docker, IMAGE) as session:
        for role in ("gateway", "browser", "controller"):
            session.start(role, ["trusted-fixture"])
        creates = [call for call in docker.calls if call[0] == "create"]
        gateway, browser, controller = creates
        assert gateway[gateway.index("--network") + 1] == "bridge"
        for role in (browser, controller):
            assert role[role.index("--network") + 1] == "none"
            assert "--read-only" in role
            assert "no-new-privileges=true" in role
        assert not any("dst=/run/pro-tour/provider" in a for a in browser)
        assert not any("dst=/run/pro-tour/public" in a for a in controller)
        assert any("dst=/run/pro-tour/provider,readonly" in a for a in controller)
        assert any("dst=/run/pro-tour/control,readonly" in a for a in controller)
        assert not any("type=bind" in a for role in creates for a in role)
    assert not docker.containers and not docker.volumes


def test_key_reader_does_not_evaluate_shell_or_select_other_secrets(tmp_path):
    path = tmp_path / "credentials"
    path.write_text(
        "CURSOR_API_KEY=other-secret\nTYPESAFE_API_KEY='synthetic-only'\n"
        "GH_MEDIA_TOKEN=another-secret\n"
    )
    assert read_key(path) == "synthetic-only"


@pytest.mark.parametrize(
    "content",
    [
        "TYPESAFE_API_KEY=$(cat /a)\n",
        "TYPESAFE_API_KEY=`command`\n",
        "TYPESAFE_API_KEY=\n",
        "TYPESAFE_API_KEY='unclosed\n",
        "TYPESAFE_API_KEY=synthetic-secret\nTYPESAFE_API_KEY=duplicate\n",
        "CURSOR_API_KEY=synthetic-secret\n",
        "a" * 16385,
    ],
)
def test_bad_credential_input_fails_without_echoing_value(tmp_path, content):
    path = tmp_path / "credentials"
    path.write_text(content)
    with pytest.raises(SandboxError) as error:
        read_key(path)
    assert "synthetic-secret" not in str(error.value)
    assert "$(" not in str(error.value)
