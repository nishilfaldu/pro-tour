"""Run the product gates and the imported repository's documented local gates.

Run with `uv run --locked python scripts/check.py`. No model CLI is invoked:
the imported resolver/launcher tests use synthetic executables and metadata.
"""

import py_compile
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    commands = [
        ([sys.executable, "-m", "ruff", "check", "--no-cache", "src", "tests", "scripts"], ROOT),
        (
            [
                sys.executable,
                "-m",
                "ruff",
                "format",
                "--check",
                "--no-cache",
                "src",
                "tests",
                "scripts",
            ],
            ROOT,
        ),
        ([sys.executable, "-m", "pytest"], ROOT),
        ([sys.executable, "scripts/validate-skills.py"], ROOT / "skills-main"),
        (
            [sys.executable, "-m", "unittest", "discover", "-s", "scripts", "-p", "test_*.py"],
            ROOT / "skills-main",
        ),
        (["git", "diff", "--check"], ROOT),
        (["git", "diff", "--check", "--cached"], ROOT),
    ]
    failed = False
    for argv, cwd in commands:
        print(f"Running {argv[1:]} in {cwd.relative_to(ROOT) or '.'}", flush=True)
        failed |= subprocess.run(argv, cwd=cwd, check=False).returncode != 0
    imported = ROOT / "skills-main"
    sources = [
        imported / "scripts/validate-skills.py",
        *sorted((imported / "scripts").glob("test_*.py")),
    ]
    for mirror in (".agents", ".claude"):
        sources.extend(sorted((imported / mirror / "skills").glob("*/scripts/*.py")))
    for path in sources:
        try:
            py_compile.compile(str(path), doraise=True)
        except py_compile.PyCompileError:
            failed = True
    print(f"Compiled {len(sources)} imported Python files; overall {'FAIL' if failed else 'PASS'}.")
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
