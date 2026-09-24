"""Acquire a pristine external baseline and build a secret-free preflight image."""

import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from pro_tour.evidence import timestamp, write_report
from pro_tour.sandbox import Docker, SandboxError

COMMIT = "1231850a0bf1a0c0341fe408ef1668dbbfdfac46"
ARCHIVE_SHA256 = "3bed2171ef064135c5192bad354b4a187f71ec397639d5ab676d02be37822211"
ROOT = Path(__file__).resolve().parents[1]


def prepare(output: Path) -> None:
    uv = shutil.which("uv")
    if uv is None:
        raise SandboxError("uv is required to export the upstream lock")
    docker = Docker()
    # Retain the immutable archive and baseline outside the project for review.
    temporary = Path(tempfile.mkdtemp(prefix="pro-tour-pristine-"))
    context = temporary / "context"
    context.mkdir()
    url = f"https://codeload.github.com/browser-use/jev-ultrafast/tar.gz/{COMMIT}"
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read(4 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != ARCHIVE_SHA256:
        raise SandboxError("Upstream archive digest changed")
    (temporary / "upstream.tar.gz").write_bytes(data)
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        if any(not (item.isfile() or item.isdir()) for item in archive.getmembers()):
            raise SandboxError("Unexpected link or special file in baseline")
        archive.extractall(temporary, filter="data")
    source = temporary / f"jev-ultrafast-{COMMIT}"
    files = {
        str(path.relative_to(source)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(source.rglob("*"))
        if path.is_file()
    }
    manifest = {
        "source_commit": COMMIT,
        "archive_url": url,
        "archive_sha256": ARCHIVE_SHA256,
        "files": files,
    }
    (context / "source.json").write_text(json.dumps(manifest, indent=2) + "\n")
    export = subprocess.run(
        [
            uv,
            "export",
            "--frozen",
            "--no-dev",
            "--no-emit-project",
            "--no-editable",
            "--no-header",
            "--output-file",
            str(context / "requirements.txt"),
        ],
        cwd=source,
        env={"PATH": os.defpath, "HOME": str(temporary), "UV_NO_CACHE": "1"},
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    if export.returncode:
        raise SandboxError("Could not export the unchanged upstream lock")
    shutil.copytree(source, context / "upstream")
    for name in ("Dockerfile", "runtime.py", "sitecustomize.py"):
        shutil.copyfile(ROOT / "containers/jev-preflight" / name, context / name)
    shutil.copyfile(ROOT / "src/pro_tour/egress_proxy.py", context / "egress_proxy.py")
    print(f"Building secret-free baseline context {context}", flush=True)
    docker.run("build", "--iidfile", str(temporary / "image-id"), str(context), timeout=600)
    image_id = (temporary / "image-id").read_text().strip()
    write_report(
        output,
        {
            "kind": "pristine-example-image",
            "built_at": timestamp(),
            "image_id": image_id,
            "external_baseline": str(source),
            "context": str(context),
            **manifest,
            "requirements_sha256": hashlib.sha256(
                (context / "requirements.txt").read_bytes()
            ).hexdigest(),
        },
    )
    print(f"Built {image_id}; manifest saved to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    prepare(parser.parse_args().output)
