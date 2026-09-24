"""Build from a hash-verified, task-local official Cursor Linux package."""

import argparse
import re
import shutil
import tarfile
import tempfile
from pathlib import Path

from pro_tour.evidence import sha256_file, timestamp, write_report
from pro_tour.sandbox import Docker, SandboxError

VERSION = "2026.09.23-86fc751"
ARCHIVE_SHA256 = "38d1482c945172926e780206fce8cc51c67dd4f96162bcec680903aa70d80417"
URL = f"https://downloads.cursor.com/lab/{VERSION}/linux/arm64/agent-cli-package.tar.gz"
ROOT = Path(__file__).resolve().parents[1]


def prepare(archive: Path, output: Path):
    if output.exists() or sha256_file(archive) != ARCHIVE_SHA256:
        raise SandboxError("Use the pinned archive and a new output path")
    temporary = Path(tempfile.mkdtemp(prefix="pro-tour-grok-"))
    context = temporary / "context"
    context.mkdir()
    with tarfile.open(archive) as source:
        source.extractall(temporary, filter="data")
    shutil.move(temporary / "dist-package", context / "cursor")
    # Exhaust the pinned release's protocol enum, including server-side search,
    # delegation, shell variants, MCP discovery, browser, and future-named tools.
    source_text = (context / "cursor/index.js").read_text()
    tool_schema = re.search(r'return\["(ToolCall\|[^"\n]+)"', source_text)
    excluded = re.findall(r"\|\d+ ([a-z0-9_]+) #\d+ tool(?=\|)", tool_schema[1])
    if len(excluded) != 69 or len(set(excluded)) != 69:
        raise SandboxError("Pinned Cursor tool protocol changed")
    (context / "excluded-tools.txt").write_text(",".join(excluded))
    for name in (
        "Dockerfile",
        "runtime.py",
        "tool_gate.py",
        "gateway.py",
        "cli-config.json",
        "hooks.json",
    ):
        shutil.copyfile(ROOT / "containers/grok-preflight" / name, context / name)
    shutil.copyfile(ROOT / "src/pro_tour/egress_proxy.py", context / "egress_proxy.py")
    print(f"Building pinned Cursor {VERSION} in {context}", flush=True)
    Docker().run("build", "--iidfile", str(temporary / "image-id"), str(context), timeout=600)
    image = (temporary / "image-id").read_text().strip()
    write_report(
        output,
        {
            "kind": "grok-preflight-image",
            "built_at": timestamp(),
            "image_id": image,
            "cursor_version": VERSION,
            "archive_sha256": ARCHIVE_SHA256,
            "archive_url": URL,
            "architecture": "linux/arm64",
            "excluded_tool_types": excluded,
            "external_context": str(context),
            "support_sha256": {p.name: sha256_file(p) for p in context.iterdir() if p.is_file()},
            "cursor_index_sha256": sha256_file(context / "cursor/index.js"),
        },
    )
    print(image, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.archive, args.output)
