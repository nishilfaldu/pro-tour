import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from .common import TourError, clean_env, run, stop, write_json
from .providers import PROVIDERS
from .publishing import probe_video, publish, resolve_pr
from .repository import branch_diff, credential_file, local_url, repository, reserve_video

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SECRETS = ROOT / '.env.local' if (ROOT / 'pyproject.toml').exists() else Path.home() / '.config/pro-tour/.env.local'


def check_pin():
    from importlib.metadata import PackageNotFoundError, distribution, version
    pinned = '1231850a0bf1a0c0341fe408ef1668dbbfdfac46'
    try:
        provenance = json.loads(distribution('jev-ultrafast').read_text('direct_url.json'))
        if provenance['vcs_info']['commit_id'] != pinned or version('browser-harness') != '0.1.13':
            raise ValueError()
    except (ValueError, KeyError, TypeError, PackageNotFoundError) as exc:
        raise TourError('Install the pinned Pro Tour Python dependencies before recording') from exc


def record(args, secrets):
    url = local_url(args.url)
    repo = repository(Path.cwd())
    branch, diff = branch_diff(repo, args.base)
    pr = resolve_pr(args.gh, repo, target=args.pr) if args.pr else resolve_pr(args.gh, repo, branch=branch)
    if pr and pr['headRefName'] != branch:
        raise TourError('Associated PR head must match the current app branch')
    if not secrets.get('TYPESAFE_API_KEY'):
        raise TourError('TYPESAFE_API_KEY is required')
    check_pin()
    for command in ('ffmpeg', 'ffprobe', 'codex'):
        if not shutil.which(command):
            raise TourError(f'{command} must already be installed')
    # Availability probe only: never installs dependencies or starts app code.
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            if response.status >= 400:
                raise TourError('App is not ready')
    except Exception as exc:
        raise TourError('App is not reachable; start it yourself before recording') from exc
    video = reserve_video(repo, branch, pr['number'] if pr else None)
    report = {'status': 'failure', 'video': str(video), 'branch': branch, 'base': args.base,
              'model': args.model, 'pr_url': pr['url'] if pr else None, 'publication': None}
    print(f'Recording target: {video}', flush=True)
    daemon = None
    try:
        with tempfile.TemporaryDirectory(prefix='pro-tour-session-') as directory:
            workspace = Path(directory)
            env = clean_env(BU_NAME='pro-tour', BH_RUNTIME_DIR=str(workspace / 'runtime'),
                            BH_CONFIG_DIR=str(workspace / 'config'), BH_TMP_DIR=str(workspace / 'tmp'),
                            BH_AGENT_WORKSPACE=str(workspace / 'helpers'), PYTHONPATH=str(Path(__file__).resolve().parents[1]))
            if args.cdp_url:
                env['BU_CDP_URL'] = local_url(args.cdp_url)
            # Direct daemon launch connects to existing Chrome, never auto-launches a browser.
            daemon = subprocess.Popen([sys.executable, '-m', 'browser_harness.daemon'], env=env,
                                      cwd=directory, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for attempt in range(80):
                if daemon.poll() is not None:
                    raise TourError('Browser Harness connection failed; enable Chrome remote debugging')
                try:
                    run([sys.executable, '-c', 'from browser_harness.admin import require_existing_daemon; require_existing_daemon()'],
                        env=env, cwd=directory, timeout=3)
                    break
                except TourError:
                    time.sleep(.5)
            else:
                raise TourError('Chrome connection timed out; enable remote debugging and approve Chrome’s connection prompt')
            page_path = workspace / 'page.json'
            run([sys.executable, '-m', 'pro_tour.executor', 'inspect', url, str(page_path)],
                cwd=directory, env=env, timeout=30)
            page = json.loads(page_path.read_text())
            # Known credential values are never sent to planners, browser goals, or trace files.
            for secret in secrets.values():
                if secret and any(secret in text for text in (diff, args.goal, json.dumps(page))):
                    raise TourError('Credential detected in planner input; recording stopped')
            print(f'Planning focused walkthrough with {args.model}…', flush=True)
            plan = PROVIDERS[args.provider].plan(model=args.model, goal=args.goal, diff=diff, page=page)
            for secret in secrets.values():
                if secret and secret in json.dumps(plan):
                    raise TourError('Credential detected in generated plan')
            plan['planner'] = {'provider': args.provider, 'model': args.model}
            plan_path = workspace / 'plan.json'
            write_json(plan_path, plan)
            write_json(video.with_suffix('.plan.json'), plan)
            print('Jev is choosing browser actions; recording the owned tab…', flush=True)
            worker_env = {**env, 'TYPESAFE_API_KEY': secrets['TYPESAFE_API_KEY']}
            if os.environ.get('CODEX_HOME'):
                worker_env['CODEX_HOME'] = os.environ['CODEX_HOME']
            try:
                run([sys.executable, '-m', 'pro_tour.executor', 'run', url, str(plan_path), str(video)],
                    cwd=directory, env=worker_env, timeout=240)
            except TourError:
                # Executor writes detailed safe diagnostics even for failed goals/recording.
                if not video.with_suffix('.trace.json').exists():
                    raise
            trace = json.loads(video.with_suffix('.trace.json').read_text())
            report['status'] = trace['status']
            report['error'] = trace['error']
            try:
                report['media'] = probe_video(video)
            except TourError as exc:
                report['media_error'] = str(exc)
                if report['status'] != 'failure':
                    report['error'] = str(exc)
                report['status'] = 'failure'
            if args.publish and report['status'] != 'failure':
                if not pr:
                    raise TourError('No associated PR; local recording saved. Publish later with --pr')
                report['publication'] = publish(args.gh, video, pr, secrets.get('GH_MEDIA_TOKEN'))
    except (TourError, KeyboardInterrupt) as exc:
        report['error'] = str(exc) if isinstance(exc, TourError) else 'Interrupted'
        if report['status'] != 'failure' and video.exists() and video.stat().st_size:
            report['publication'] = {'status': 'failure', 'error': str(exc)}
        else:
            report['status'] = 'failure'
    finally:
        if daemon:
            stop(daemon)
        if video.exists() and video.stat().st_size == 0:
            video.unlink()
        if not video.with_suffix('.trace.json').exists():
            write_json(video.with_suffix('.trace.json'), {'status': 'failure', 'phase': 'setup', 'error': report.get('error'), 'actions': []})
        report['video_saved'] = video.exists() and video.stat().st_size > 0
        write_json(video.with_suffix('.report.json'), report)
    print(json.dumps(report, indent=2))
    return 1 if report['status'] == 'failure' or (report['publication'] or {}).get('status') == 'failure' else 0


def parser():
    cli = argparse.ArgumentParser(prog='pro-tour', description='Manual local-first feature walkthroughs')
    sub = cli.add_subparsers(dest='command', required=True)
    rec = sub.add_parser('record')
    for name in ('url', 'base', 'goal', 'model'):
        rec.add_argument('--' + name, required=True)
    rec.add_argument('--provider', choices=list(PROVIDERS), default='codex')
    rec.add_argument('--publish', action='store_true')
    rec.add_argument('--pr', help='Optional explicit associated PR number or URL')
    rec.add_argument('--cdp-url', help='Optional existing local Chrome CDP endpoint')
    pub = sub.add_parser('publish')
    pub.add_argument('--video', required=True, type=Path)
    pub.add_argument('--pr', required=True)
    for command in (rec, pub):
        command.add_argument('--secrets-file', type=Path, default=DEFAULT_SECRETS,
                             help='Trusted credentials file; never read from the app repository implicitly')
        command.add_argument('--gh', default='gh', help='GitHub CLI executable (2.101+ needed for publishing)')
    return cli


def main():
    os.umask(0o077)
    args = parser().parse_args()
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        secrets = credential_file(args.secrets_file)
        for key in ('TYPESAFE_API_KEY', 'GH_MEDIA_TOKEN'):
            if os.environ.get(key):
                secrets[key] = os.environ[key]
        if args.command == 'record':
            return_code = record(args, secrets)
        else:
            video = args.video.resolve()
            pr = resolve_pr(args.gh, Path.cwd(), target=args.pr)
            try:
                result = publish(args.gh, video, pr, secrets.get('GH_MEDIA_TOKEN'))
            except TourError as exc:
                write_json(video.with_suffix('.publish-failure.json'),
                           {'status': 'failure', 'pr_url': pr['url'], 'error': str(exc), 'video_preserved': video.exists()})
                raise
            write_json(video.with_suffix('.publish.json'), result)
            print(json.dumps(result, indent=2))
            return_code = 0
        sys.exit(return_code)
    except (TourError, KeyboardInterrupt) as exc:
        print(str(exc) if isinstance(exc, TourError) else 'Interrupted; owned processes stopped', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
