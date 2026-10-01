#!/usr/bin/env python3
"""Manual local release checks; never triggered by a PR and never starts an app."""
import sys
sys.dont_write_bytecode = True

import argparse
import hashlib
import json
import os
import subprocess
import shutil
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'local'))
from pro_tour.common import clean_env


def validate_wheel(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        metadata = archive.read(next(name for name in names if name.endswith('/METADATA'))).decode()
        if any(' @ ' in line for line in metadata.splitlines() if line.startswith('Requires-Dist:')):
            raise ValueError('PyPI does not accept direct URL dependencies')
        required = ('pro_tour/configuration.py', 'pro_tour/_vendor/jev_ultrafast/snapshot.js')
        if not all(name in names for name in required) or not any(name.endswith('/jev-ultrafast-MIT.txt') for name in names):
            raise ValueError('Wheel is missing setup, Jev browser assets, or its license')
        if any('/.env' in name or '__pycache__' in name for name in names):
            raise ValueError('Wheel contains local credentials or generated caches')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-benchmark', action='store_true', help='Also run real model calls against trusted synthetic fixtures using existing Chrome')
    parser.add_argument('--output', type=Path, help='Keep results and wheel in this new directory (default: temporary)')
    parser.add_argument('--keep-artifacts', action='store_true', help='Keep results and wheel under .artifacts/release for debugging')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='pro-tour-release-') as directory:
        workspace = Path(directory)
        output = workspace / 'artifacts'
        if args.output or args.keep_artifacts:
            output = (args.output or ROOT / '.artifacts/release' / time.strftime('%Y%m%d-%H%M%S')).resolve()
            print('Keeping validation artifacts: ' + str(output), flush=True)
        output.mkdir(parents=True, exist_ok=False)
        # Setuptools writes build/ and egg-info beside the source. Build a disposable
        # copy of the current package so even failed builds cannot dirty the checkout.
        source = workspace / 'source'
        source.mkdir()
        for name in ('pyproject.toml', 'README.md'):
            shutil.copy2(ROOT / name, source / name)
        shutil.copytree(ROOT / 'local/pro_tour', source / 'local/pro_tour',
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        shutil.copytree(ROOT / 'licenses', source / 'licenses')
        return check(args, output, source)


def check(args, output, source):
    environment = clean_env(PYTHONPATH=str(ROOT / 'local') + os.pathsep + str(ROOT), PYTHONDONTWRITEBYTECODE='1')
    commands = [[sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'],
                ['git', 'diff', '--check'],
                [sys.executable, '-c', 'from pro_tour.health import installed_dependencies; print(installed_dependencies())'],
                ['uv', 'build', '--wheel', '--out-dir', str(output), str(source)]]
    if args.live_benchmark:
        benchmark = [sys.executable, 'benchmarks/run.py']
        if args.output or args.keep_artifacts:
            benchmark.extend(['--output', str(output / 'benchmark')])
        commands.append(benchmark)
    checks = []
    for command in commands:
        label = ' '.join(command[:4])
        print('Checking: ' + label, flush=True)
        result = subprocess.run(command, cwd=ROOT, env=environment)
        checks.append({'command': label, 'exit_code': result.returncode})
        if result.returncode: break
    wheels = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in output.glob('*.whl')}
    if all(c['exit_code'] == 0 for c in checks):
        try:
            if not wheels:
                raise ValueError('No wheel was built')
            for path in output.glob('*.whl'):
                validate_wheel(path)
            checks.append({'command': 'PyPI wheel metadata, assets, and license', 'exit_code': 0})
        except (ValueError, KeyError, StopIteration, zipfile.BadZipFile) as exc:
            print('Wheel validation failed: ' + str(exc), flush=True)
            checks.append({'command': 'PyPI wheel metadata, assets, and license', 'exit_code': 1})
    report = {'checks': checks, 'wheels_sha256': wheels, 'passed': all(c['exit_code'] == 0 for c in checks)}
    (output / 'checks.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__': sys.exit(main())
