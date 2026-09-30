#!/usr/bin/env python3
"""Manual local release checks; never triggered by a PR and never starts an app."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'local'))
from pro_tour.common import clean_env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-benchmark', action='store_true', help='Also run real model calls against trusted synthetic fixtures using existing Chrome')
    args = parser.parse_args()
    environment = clean_env(PYTHONPATH=str(ROOT / 'local') + os.pathsep + str(ROOT))
    commands = [[sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'],
                ['git', 'diff', '--check'],
                [sys.executable, '-c', 'from pro_tour.health import check_pin; check_pin()'],
                ['uv', 'build', '--wheel', '--out-dir', '.artifacts/release']]
    if args.live_benchmark: commands.append([sys.executable, 'benchmarks/run.py'])
    checks = []
    for command in commands:
        label = ' '.join(command[:4])
        print('Checking: ' + label, flush=True)
        result = subprocess.run(command, cwd=ROOT, env=environment)
        checks.append({'command': label, 'exit_code': result.returncode})
        if result.returncode: break
    output = ROOT / '.artifacts/release'
    output.mkdir(parents=True, exist_ok=True)
    wheels = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in output.glob('pro_tour_local-0.2.0-*.whl')}
    report = {'checks': checks, 'wheels_sha256': wheels, 'passed': all(c['exit_code'] == 0 for c in checks)}
    (output / 'checks.json').write_text(json.dumps(report, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__': sys.exit(main())
