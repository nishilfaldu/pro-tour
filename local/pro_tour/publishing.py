import json
import re
import shutil
import tempfile
from pathlib import Path

from .common import TourError, clean_env, run


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
        raw = run([gh, 'pr', 'list', '--head', branch, '--state', 'open', '--json',
                   'number,url,headRefName,headRepositoryOwner'], cwd=repo)
        entries = json.loads(raw)
        if len(entries) > 1:
            raise PrAssociationError('More than one PR matches the branch; use --pr')
        if not entries:
            return None
        target = entries[0]['url']
    data = json.loads(run([gh, 'pr', 'view', target, '--json', 'number,url,headRefName'], cwd=repo))
    match = re.fullmatch(r'https://github\.com/([\w.-]+/[\w.-]+)/pull/([1-9]\d*)', data['url'])
    if not match:
        raise PrAssociationError('Unsupported PR URL')
    data['repo'] = match[1]
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


def publish(gh, video, pr, token):
    probe_video(video)
    if not token:
        raise TourError('GH_MEDIA_TOKEN is required to publish; local video is preserved')
    env = clean_env(GH_TOKEN=token)
    require_media_support(gh)
    with tempfile.TemporaryDirectory(prefix='pro-tour-publish-') as directory:
        body = Path(directory) / 'comment.md'
        body.write_text(f'Feature tour · {video.name}\n\n![]({video.resolve()})\n')
        try:
            url = run([gh, 'pr', 'comment', str(pr['number']), '--repo', pr['repo'], '--body-file', str(body),
                      '--attach', str(video.resolve())], env=env, timeout=180)
        except TourError as exc:
            raise TourError('GitHub media upload failed; local video preserved (check media token, permissions, size, and connectivity)') from exc
    return {'status': 'uploaded', 'pr_url': pr['url'], 'comment_url': url,
            'playback': 'unverified'}
