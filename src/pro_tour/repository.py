import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from .common import TourError, run


def local_url(value):
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise TourError("--url must be a local HTTP(S) app URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise TourError("App URL must not contain credentials, query parameters, or fragments")
    return value


def repository(cwd):
    return Path(run(["git", "rev-parse", "--show-toplevel"], cwd=cwd)).resolve()


def branch_diff(repo, base):
    if base.startswith("-"):
        raise TourError("Invalid base ref")
    branch = run(["git", "symbolic-ref", "--quiet", "--short", "HEAD"], cwd=repo)
    run(["git", "rev-parse", "--verify", f"{base}^{{commit}}"], cwd=repo)
    files = run(["git", "diff", "--name-only", "-z", f"{base}...HEAD", "--"], cwd=repo).split('\0')
    # Never read credential files, lockfiles, recordings, or binary contents into a model prompt.
    safe = [name for name in files if name and not any(
        part.startswith('.env') or part in {'.videos', '.git', 'node_modules', '.npmrc', '.netrc', 'auth.json', '.ssh', '.aws', '.kube', 'id_rsa', 'id_ed25519'} or
        re.search(r'(credential|secret|token|\.pem$|\.key$|lock\.)', part, re.I)
        for part in Path(name).parts)]
    diff = run(["git", "diff", "--no-ext-diff", "--no-textconv", "--unified=3",
                f"{base}...HEAD", "--", *safe], cwd=repo) if safe else ""
    if len(diff) > 100_000:
        raise TourError("Diff exceeds 100 KB; use a closer base ref")
    return branch, diff


def derive_base(repo, explicit=None, pr=None):
    if explicit:
        return explicit, 'argument'
    if pr:
        # Fork PR bases belong to the target repository, which may differ from origin.
        target_url = 'https://github.com/' + pr['repo'] + '.git'
        remotes = run(['git', 'remote'], cwd=repo).splitlines()
        for remote in remotes:
            url = run(['git', 'remote', 'get-url', remote], cwd=repo)
            normalized = url.replace('git@github.com:', 'https://github.com/').removesuffix('.git')
            if normalized == target_url.removesuffix('.git'):
                base = remote + '/' + pr['baseRefName']
                try:
                    run(['git', 'rev-parse', '--verify', base + '^{commit}'], cwd=repo)
                    return base, 'pr'
                except TourError:
                    raise TourError(f'PR base {base} is not available locally. Fetch that ref yourself or supply --base.')
        raise TourError('PR target repository has no matching local remote. Add/fetch its base yourself or supply --base.')
    try:
        base = run(['git', 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd=repo)
        return base.removeprefix('refs/remotes/'), 'remote-default'
    except TourError as exc:
        raise TourError('Cannot infer the base: no accessible PR or local origin/HEAD. Supply --base <ref>.') from exc


def verify_pr_repository(repo, pr):
    if not pr.get('head_repo'):
        return
    for remote in run(['git', 'remote'], cwd=repo).splitlines():
        url = run(['git', 'remote', 'get-url', remote], cwd=repo)
        match = re.search(r'github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$', url)
        if match and match[1].casefold() == pr['head_repo'].casefold():
            return
    raise TourError('PR head repository does not match a local Git remote; verify --pr and your checkout')


def video_pr(video):
    for suffix in ('.report.json', '.publish.json'):
        path = video.with_suffix(suffix)
        try:
            import json
            data = json.loads(path.read_text())
            target = data.get('pr_url')
            if target:
                return target
        except (OSError, ValueError, AttributeError):
            continue
    raise TourError('No PR recorded in video metadata. Supply --pr <number-or-url>.')


def sanitized_branch(branch):
    return re.sub(r'[^a-zA-Z0-9._-]+', '-', branch).strip('.-')[:120] or "branch"


def reserve_video(repo, branch, pr):
    ignore = repo / '.gitignore'
    if ignore.is_symlink() or (repo / '.videos').is_symlink():
        raise TourError('Output and ignore paths must not be symlinks')
    text = ignore.read_text() if ignore.exists() else ''
    if not any(line.strip() in {'.videos/', '/.videos/', '.videos', '/.videos'} for line in text.splitlines()):
        with ignore.open('a') as file:
            file.write(('\n' if text and not text.endswith('\n') else '') + '.videos/\n')
    directory = repo / '.videos'
    if directory.is_symlink():
        raise TourError('.videos must not be a symlink')
    directory.mkdir(mode=0o700, exist_ok=True)
    prefix = f'{sanitized_branch(branch)}-{("pr" + str(pr)) if pr else "no-pr"}-v'
    version = 1
    while True:
        video = directory / f'{prefix}{version}.mp4'
        # Exclusive reservation is also respected across concurrent CLI processes.
        if video.with_suffix('.report.json').exists() or video.with_suffix('.trace.json').exists():
            version += 1
            continue
        try:
            descriptor = os.open(video, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(descriptor)
            return video
        except FileExistsError:
            version += 1


def credential_file(path):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip().removeprefix('export ')
            if '=' in line and not line.startswith('#'):
                name, value = line.split('=', 1)
                if name.strip() in {'TYPESAFE_API_KEY', 'GH_MEDIA_TOKEN'}:
                    result[name.strip()] = value.strip().strip('\"\'')
    return result
