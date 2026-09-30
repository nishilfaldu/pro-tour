import argparse
import json
import os
import signal
import sys
import tempfile
import time
from pathlib import Path
from contextlib import nullcontext

from .common import TourError, run, write_json
from . import __version__
from .browser import connected_browser, hold_connection
from .health import app_ready, doctor, record_dependencies
from .providers import PROVIDERS
from .publishing import PrAssociationError, github_cli, probe_video, publish, resolve_pr, validate_pr_target
from .repository import branch_diff, credential_file, derive_base, local_url, repository, reserve_video, verify_pr_repository, video_pr

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SECRETS = ROOT / '.env.local' if (ROOT / 'pyproject.toml').exists() else Path.home() / '.config/pro-tour/.env.local'


def record(args, secrets, *, browser_session=None):
    url = local_url(args.url)
    repo = repository(Path.cwd())
    branch = run(['git', 'symbolic-ref', '--quiet', '--short', 'HEAD'], cwd=repo)
    validate_pr_target(args.pr)
    gh, pr = None, None
    try:
        gh = github_cli()
        pr = resolve_pr(gh, repo, target=args.pr) if args.pr else resolve_pr(gh, repo, branch=branch)
        pr_lookup = {'status': 'matched' if pr else 'missing'}
    except PrAssociationError:
        raise
    except TourError as exc:
        pr_lookup = {'status': 'unavailable', 'error': str(exc)}
        print('PR lookup unavailable; recording locally without a verified PR association.', flush=True)
    if pr and pr['headRefName'] != branch:
        raise TourError('Associated PR head must match the current app branch')
    if pr:
        verify_pr_repository(repo, pr)
    args.base, base_source = derive_base(repo, args.base, pr)
    branch, diff = branch_diff(repo, args.base)
    record_dependencies(secrets)
    app_ready(url)
    video = reserve_video(repo, branch, pr['number'] if pr else None)
    report = {'status': 'failure', 'video': str(video), 'branch': branch, 'base': args.base,
              'model': args.model, 'pr_url': pr['url'] if pr else None, 'pr_lookup': pr_lookup,
              'publication': None, 'base_source': base_source, 'phase': 'connection'}
    print(f'Recording target: {video}', flush=True)
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix='pro-tour-session-') as directory:
            workspace = Path(directory)
            with (nullcontext(browser_session) if browser_session else connected_browser(workspace, args.cdp_url)) as (env, identity):
                report['browser'] = identity
                report['phase'] = 'inspection'
                page_path = workspace / 'page.json'
                run([sys.executable, '-m', 'pro_tour.executor', 'inspect', url, str(page_path)],
                    cwd=directory, env=env, timeout=30)
                page = json.loads(page_path.read_text())
                # Known credential values are never sent to planners, browser goals, or trace files.
                for secret in secrets.values():
                    if secret and any(secret in text for text in (diff, args.goal, json.dumps(page))):
                        raise TourError('Credential detected in planner input; recording stopped')
                report['phase'] = 'planning'
                print(f'Planning focused walkthrough with {args.model}…', flush=True)
                plan = PROVIDERS[args.provider].plan(model=args.model, goal=args.goal, diff=diff, page=page)
                for secret in secrets.values():
                    if secret and secret in json.dumps(plan):
                        raise TourError('Credential detected in generated plan')
                report['planner_usage'] = list(getattr(PROVIDERS[args.provider], 'usage', []))
                plan['planner'] = {'provider': args.provider, 'model': args.model}
                plan_path = workspace / 'plan.json'
                write_json(plan_path, plan)
                write_json(video.with_suffix('.plan.json'), plan)
                report['phase'] = 'execution'
                print('Jev is choosing browser actions; recording the owned tab…', flush=True)
                worker_env = {**env, 'TYPESAFE_API_KEY': secrets['TYPESAFE_API_KEY']}
                if os.environ.get('CODEX_HOME'):
                    worker_env['CODEX_HOME'] = os.environ['CODEX_HOME']
                try:
                    run([sys.executable, '-m', 'pro_tour.executor', 'run', url, str(plan_path), str(video)],
                        cwd=directory, env=worker_env, timeout=args.timeout)
                except TourError:
                    # Executor writes detailed safe diagnostics even for failed goals/recording.
                    if not video.with_suffix('.trace.json').exists():
                        raise
                report['phase'] = 'media-validation'
                trace = json.loads(video.with_suffix('.trace.json').read_text())
                report['status'] = trace['status']
                report['error'] = trace['error']
                if trace['status'] == 'failure':
                    report['failure_phase'] = 'recording' if trace['error'] in {'Recording process failed', 'Recorder failed to become ready', 'Recorder stopped during the tour'} else 'execution'
                try:
                    report['media'] = probe_video(video)
                except TourError as exc:
                    report['media_error'] = str(exc)
                    if report['status'] != 'failure':
                        report['error'] = str(exc)
                        report['failure_phase'] = 'media-validation'
                    report['status'] = 'failure'
                if args.publish and report['status'] != 'failure':
                    report['phase'] = 'publishing'
                    if not pr:
                        if pr_lookup['status'] == 'unavailable':
                            raise TourError('GitHub access unavailable; local recording saved. Install gh and authenticate with gh auth login, then publish later with --pr')
                        raise TourError('No associated PR; local recording saved. Publish later with --pr')
                    report['publication'] = publish(gh, video, pr, secrets.get('GH_MEDIA_TOKEN'))
                report['phase'] = 'complete'
    except (TourError, KeyboardInterrupt, OSError, ValueError, KeyError) as exc:
        report['failure_phase'] = report['phase']
        report['error'] = (str(exc) if isinstance(exc, TourError) else
                           'Interrupted' if isinstance(exc, KeyboardInterrupt) else
                           f'Invalid or unavailable data during {report["phase"]}')
        if report['status'] != 'failure' and video.exists() and video.stat().st_size:
            report['publication'] = {'status': 'failure', 'error': report['error']}
        else:
            report['status'] = 'failure'
    finally:
        report['elapsed_seconds'] = round(time.monotonic() - started, 3)
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
    cli.add_argument('--version', action='version', version='%(prog)s ' + __version__)
    sub = cli.add_subparsers(dest='command', required=True)
    connect = sub.add_parser('connect', help='Approve existing Chrome once and keep its connection for subsequent tours')
    connect.add_argument('--cdp-url')
    rec = sub.add_parser('record')
    for name in ('url', 'goal'):
        rec.add_argument('--' + name, required=True)
    rec.add_argument('--base', help='Git base ref (default: associated PR base, then local origin/HEAD)')
    rec.add_argument('--timeout', type=int, choices=range(30, 3601), default=600, metavar='SECONDS', help='Execution deadline, 30–3600 seconds (default: 600)')
    rec.add_argument('--model', default='gpt-6-luna', help='Codex model (default: gpt-6-luna)')
    rec.add_argument('--provider', choices=list(PROVIDERS), default='codex')
    rec.add_argument('--publish', action='store_true')
    rec.add_argument('--pr', help='Optional explicit associated PR number or URL')
    rec.add_argument('--cdp-url', help='Optional existing local Chrome CDP endpoint')
    pub = sub.add_parser('publish')
    pub.add_argument('--video', required=True, type=Path)
    pub.add_argument('--pr', help='PR number or URL (default: video metadata)')
    pub.add_argument('--retry-upload', action='store_true', help='Retry an ambiguous previous upload after checking the PR has no matching comment')
    health = sub.add_parser('doctor', help='Read-only setup checks; no model calls or app startup')
    health.add_argument('--url')
    health.add_argument('--base')
    health.add_argument('--cdp-url')
    health.add_argument('--publish', action='store_true', help='Require publishing credentials and media support')
    health.add_argument('--connect', action='store_true', help='Perform a real Chrome handshake (may prompt); default only discovers')
    for command in (rec, pub, health):
        command.add_argument('--secrets-file', type=Path, default=DEFAULT_SECRETS,
                             help='Trusted credentials file; never read from the app repository implicitly')
    return cli


def main():
    os.umask(0o077)
    args = parser().parse_args()
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        if args.command == 'connect':
            hold_connection(args.cdp_url)
            return
        secrets = credential_file(args.secrets_file)
        for key in ('TYPESAFE_API_KEY', 'GH_MEDIA_TOKEN'):
            if os.environ.get(key):
                secrets[key] = os.environ[key]
        if args.command == 'record':
            return_code = record(args, secrets)
        elif args.command == 'doctor':
            return_code = doctor(args, secrets)
        else:
            gh = github_cli()
            video = args.video.resolve()
            target = args.pr or video_pr(video)
            pr = resolve_pr(gh, Path.cwd(), target=target)
            print(f'Publishing {video.name} to {pr["url"]}', flush=True)
            try:
                result = publish(gh, video, pr, secrets.get('GH_MEDIA_TOKEN'), retry_upload=args.retry_upload)
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
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f'Invalid or unavailable local setup data ({type(exc).__name__}); run pro-tour doctor for setup checks.', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
