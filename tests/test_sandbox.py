import json

import pytest

from pro_tour.sandbox import SandboxError, SandboxSession

IMAGE = "sha256:" + "a" * 64


class FakeDocker:
    def __init__(self):
        self.calls = []
        self.volumes = {}
        self.containers = {}
        self.fail_create = False
        self.fail_start = False
        self.fail_remove = False
        self.linux = True

    def run(self, *args, **_):
        self.calls.append(args)
        if args[0] == "info":
            return json.dumps({"OSType": "linux" if self.linux else "windows"})
        if args[:2] == ("volume", "create"):
            self.volumes[args[-1]] = args[args.index("--label") + 1]
            if self.fail_create:
                raise SandboxError("Lost response after volume creation")
        if args[0] == "create":
            self.containers[args[args.index("--name") + 1]] = args[args.index("--label") + 1]
        if args[0] == "start" and self.fail_start:
            raise SandboxError("Fixture startup failed")
        if args[0] == "rm":
            if self.fail_remove:
                raise SandboxError("Cannot remove fixture")
            self.containers.pop(args[-1], None)
        if args[:2] == ("volume", "rm"):
            self.volumes.pop(args[-1], None)
        if args[0] == "ps" or args[:2] == ("volume", "ls"):
            items = self.containers if args[0] == "ps" else self.volumes
            label = args[-1].removeprefix("label=")
            return "\n".join(name for name, actual in items.items() if actual == label)
        return ""


@pytest.mark.parametrize("image", ["latest", "python:3.12", "sha256:abc", "credential-canary"])
def test_cannot_start_from_a_mutable_or_malformed_image_reference(image):
    docker = FakeDocker()
    with pytest.raises(SandboxError, match="immutable") as error:
        SandboxSession(docker, image)
    assert image not in str(error.value)
    assert not docker.calls


def test_cannot_implicitly_create_unowned_volumes_outside_a_session():
    docker = FakeDocker()
    sandbox = SandboxSession(docker, IMAGE)
    with pytest.raises(SandboxError, match="Open"):
        sandbox.start("app", ["python", "app.py"])
    assert not docker.calls


def test_lost_volume_creation_response_is_cleaned_up():
    docker = FakeDocker()
    docker.fail_create = True
    with pytest.raises(SandboxError, match="Lost response"), SandboxSession(docker, IMAGE):
        pytest.fail("A failed setup must not enter the context")
    assert not docker.volumes
    assert not docker.containers


def test_startup_failure_removes_only_session_owned_resources():
    docker = FakeDocker()
    docker.volumes["user-existing-volume"] = "unrelated"
    docker.containers["user-existing-container"] = "unrelated"
    docker.fail_start = True
    with pytest.raises(SandboxError, match="startup"), SandboxSession(docker, IMAGE) as sandbox:
        sandbox.start("app", ["python", "app.py"])
    assert docker.volumes == {"user-existing-volume": "unrelated"}
    assert docker.containers == {"user-existing-container": "unrelated"}


def test_cancellation_removes_every_owned_role_and_volume():
    docker = FakeDocker()
    with pytest.raises(KeyboardInterrupt), SandboxSession(docker, IMAGE) as sandbox:
        for role in ("app", "browser", "controller"):
            sandbox.start(role, ["python", "fixture.py", role])
        raise KeyboardInterrupt
    assert not docker.volumes and not docker.containers
    assert not sandbox.volumes and not sandbox.containers


def test_cleanup_failure_is_reported_as_failure():
    docker = FakeDocker()
    with (
        pytest.raises(SandboxError, match="cleanup incomplete"),
        SandboxSession(docker, IMAGE) as sandbox,
    ):
        sandbox.start("browser", ["chromium"])
        docker.fail_remove = True
    assert sandbox.containers  # callers cannot mistake this for successful cleanup


def test_roles_cannot_widen_network_or_mount_policy_via_command_arguments():
    docker = FakeDocker()
    argv = ["python", "app.py", "--network", "host", "--mount", "type=bind,src=/,dst=/host"]
    with SandboxSession(docker, IMAGE) as sandbox:
        sandbox.start("app", argv)
        create = next(call for call in docker.calls if call[0] == "create")
        policy = create[: create.index(IMAGE)]
        assert policy[policy.index("--network") + 1] == "none"
        assert "--privileged" not in policy
        assert not any("type=bind" in value for value in policy)
        assert list(create[-len(argv) :]) == argv
        with pytest.raises(SandboxError, match="once"):
            sandbox.start("app", ["another-process"])


def test_non_linux_daemon_fails_before_resource_creation():
    docker = FakeDocker()
    docker.linux = False
    with pytest.raises(SandboxError, match="Linux"), SandboxSession(docker, IMAGE):
        pytest.fail("Non-Linux daemon must fail closed")
    assert not docker.volumes and not docker.containers
