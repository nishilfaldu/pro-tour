import json
import hashlib
import os
import re
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path

from .common import TourError, clean_env, retry_read, run, write_json


class PrAssociationError(TourError):
    """Invalid or ambiguous association that should not silently fall back."""


def validate_pr_target(target):
    if target and not re.fullmatch(r'[1-9]\d*|https://github\.com/[\w.-]+/[\w.-]+/pull/[1-9]\d*', target):
        raise PrAssociationError('Invalid PR number or GitHub PR URL')


def github_cli():
    executable = shutil.which('gh')
    if not executable:
        raise TourError('GitHub CLI (gh) was not found on PATH. Install it from https://cli.github.com, then run gh auth login.')
    return executable


def require_media_support(gh):
    help_text = run([gh, 'pr', 'comment', '--help'], env=clean_env())
    if '--attach' not in help_text:
        raise TourError('Your GitHub CLI cannot attach videos. Update gh until gh pr comment --help lists --attach. The local video is preserved.')


def resolve_pr(gh, repo, target=None, branch=None):
    validate_pr_target(target)
    if branch is not None:
        # An empty array is the only evidence accepted for "no PR". Auth/network failures are errors.
        raw = retry_read(lambda: run([gh, 'pr', 'list', '--head', branch, '--state', 'open', '--json',
                   'number,url,headRefName,headRepositoryOwner'], cwd=repo))
        try:
            entries = json.loads(raw)
            if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries):
                raise ValueError()
        except (ValueError, TypeError) as exc:
            raise PrAssociationError('GitHub returned invalid PR association data; no target was guessed') from exc
        try:
            origin = run(['git', 'remote', 'get-url', 'origin'], cwd=repo)
            owner = re.search(r'github\.com[:/]([^/]+)/', origin)
            if owner:
                entries = [entry for entry in entries if (entry.get('headRepositoryOwner') or {}).get('login', '').casefold() == owner[1].casefold()]
        except TourError:
            pass
        if len(entries) > 1:
            raise PrAssociationError('More than one PR matches the branch; use --pr')
        if not entries:
            return None
        target = entries[0]['url']
    try:
        data = json.loads(retry_read(lambda: run([gh, 'pr', 'view', target, '--json',
                         'number,url,headRefName,baseRefName,headRepository,headRepositoryOwner'], cwd=repo)))
        if not isinstance(data, dict) or not all(isinstance(data.get(k), str) for k in ('url', 'headRefName', 'baseRefName')) or type(data.get('number')) is not int:
            raise ValueError()
    except (ValueError, TypeError) as exc:
        raise PrAssociationError('GitHub returned invalid PR metadata; no target was guessed') from exc
    match = re.fullmatch(r'https://github\.com/([\w.-]+/[\w.-]+)/pull/([1-9]\d*)', data['url'])
    if not match:
        raise PrAssociationError('Unsupported PR URL')
    data['repo'] = match[1]
    if data.get('headRepository') and data.get('headRepositoryOwner'):
        data['head_repo'] = data['headRepositoryOwner']['login'] + '/' + data['headRepository']['name']
    return data


def probe_video(video):
    video = Path(video).resolve()
    if video.suffix.lower() != '.mp4' or not video.is_file() or video.stat().st_size < 1024:
        raise TourError('Expected a nonempty MP4 recording')
    data = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)]))
    streams = [s for s in data['streams'] if s.get('codec_type') == 'video']
    if not streams or streams[0].get('codec_name') != 'h264' or float(data['format'].get('duration', 0)) <= 0:
        raise TourError('MP4 must contain playable H.264 video')
    # Decode every frame before declaring the recording valid.
    run(['ffmpeg', '-hide_banner', '-v', 'error', '-xerror', '-i', str(video), '-f', 'null', '-'], timeout=60)
    return {'duration_seconds': float(data['format']['duration']), 'bytes': video.stat().st_size,
            'codec': streams[0]['codec_name']}


@contextmanager
def publication_lock(video):
    path = video.with_suffix('.upload.lock')
    if path.exists():
        try:
            pid = int(path.read_text())
            os.kill(pid, 0)
        except ProcessLookupError:
            path.unlink()
        except (OSError, ValueError):
            raise TourError('Cannot validate existing upload lock; inspect ' + str(path))
        else:
            raise TourError('Another upload owns this video; retry when it finishes')
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as exc:
        raise TourError('Another upload owns this video; retry when it finishes') from exc
    try:
        with os.fdopen(descriptor, 'w') as file:
            file.write(str(os.getpid()))
        yield
    finally:
        path.unlink(missing_ok=True)


def find_upload(gh, pr, marker, env):
    # Check every comments page: a successful upload whose response was lost must not be repeated.
    raw = retry_read(lambda: run([gh, 'api', '--paginate', '--slurp',
                                 f"repos/{pr['repo']}/issues/{pr['number']}/comments?per_page=100"], env=env, timeout=30))
    try:
        matches = [comment for page in json.loads(raw) for comment in page
                   if marker in comment.get('body', '') and 'github.com/user-attachments/assets/' in comment.get('body', '')]
    except (ValueError, TypeError, AttributeError) as exc:
        raise TourError('Cannot reconcile PR comments; upload was not repeated') from exc
    if len(matches) > 1:
        raise TourError('Multiple comments match this recording; inspect the PR before retrying')
    return matches[0]['html_url'] if matches else None


def publish(gh, video, pr, token, *, retry_upload=False):
    video = Path(video).resolve()
    probe_video(video)
    if not token:
        raise TourError('GH_MEDIA_TOKEN is required to publish; local video is preserved')
    env = clean_env(GH_TOKEN=token)
    require_media_support(gh)
    digest = hashlib.sha256(video.read_bytes()).hexdigest()
    identity = hashlib.sha256((video.name + ':' + digest + ':' + pr['url']).encode()).hexdigest()
    marker = f'<!-- pro-tour:{identity} -->'
    journal = video.with_suffix('.upload.json')
    with publication_lock(video):
        # Always reconcile before publishing, including a retry from another checkout.
        existing = find_upload(gh, pr, marker, env)
        if existing:
            result = {'status': 'uploaded', 'pr_url': pr['url'], 'comment_url': existing,
                      'playback': 'unverified', 'reused': True, 'sha256': digest}
            write_json(journal, result)
            return result
        if journal.exists():
            try:
                previous = json.loads(journal.read_text())
            except (OSError, ValueError):
                raise TourError('Cannot read upload journal; inspect it before retrying')
            if previous.get('identity') == identity and previous.get('status') in {'pending', 'unknown'} and not retry_upload:
                raise TourError('Previous upload result is uncertain and no matching comment is visible. Check the PR, then use --retry-upload only if the comment is absent. Local video preserved.')
        write_json(journal, {'status': 'pending', 'pr_url': pr['url'], 'sha256': digest, 'identity': identity})
        try:
            with tempfile.TemporaryDirectory(prefix='pro-tour-publish-') as directory:
                body = Path(directory) / 'comment.md'
                body.write_text(f'Feature tour · {video.name}\n\n![]({video})\n\n{marker}\n')
                url = run([gh, 'pr', 'comment', str(pr['number']), '--repo', pr['repo'], '--body-file', str(body),
                          '--attach', str(video)], env=env, timeout=180)
        except TourError as exc:
            try:
                url = find_upload(gh, pr, marker, env)
            except TourError:
                url = None
            if not url:
                write_json(journal, {'status': 'unknown', 'pr_url': pr['url'], 'sha256': digest, 'identity': identity})
                raise TourError('GitHub upload failed or its result is unknown; local video preserved. Retry publish to reconcile the PR before another upload.') from exc
        result = {'status': 'uploaded', 'pr_url': pr['url'], 'comment_url': url,
                  'playback': 'unverified', 'sha256': digest}
        write_json(journal, result)
        return result
