import json
import os
import subprocess
import tempfile
import sys
import unittest
from contextlib import ExitStack, nullcontext, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import Mock, patch

from pro_tour.common import TourError, clean_env, run
from pro_tour.executor import safe_text, verify_checks
from pro_tour.providers import validate_plan
from pro_tour.publishing import PrAssociationError, github_cli, publish, require_media_support, resolve_pr
from pro_tour.repository import branch_diff, local_url, reserve_video


class LocalTests(unittest.TestCase):
    def test_versioning_reserves_concurrently_and_preserves_ignore(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / '.gitignore').write_text('existing\n')
            one = reserve_video(repo, 'feat/status filter', 42)
            two = reserve_video(repo, 'feat/status filter', 42)
            self.assertEqual(one.name, 'feat-status-filter-pr42-v1.mp4')
            self.assertEqual(two.name, 'feat-status-filter-pr42-v2.mp4')
            self.assertEqual((repo / '.gitignore').read_text(), 'existing\n.videos/\n')
            one.unlink()
            one.with_suffix('.report.json').write_text('{}')
            self.assertTrue(reserve_video(repo, 'feat/status filter', 42).name.endswith('v3.mp4'))
            self.assertEqual(reserve_video(repo, 'feat/x', None).name, 'feat-x-no-pr-v1.mp4')

    def test_clean_env_separates_credentials(self):
        with patch.dict(os.environ, TYPESAFE_API_KEY='unsafe', GH_MEDIA_TOKEN='unsafe',
                        GH_TOKEN='unsafe', NODE_OPTIONS='unsafe', PYTHONPATH='unsafe'):
            env = clean_env(TYPESAFE_API_KEY='only-jev')
            self.assertEqual(env['TYPESAFE_API_KEY'], 'only-jev')
            self.assertFalse(any(key in env for key in ['GH_TOKEN', 'GH_MEDIA_TOKEN', 'NODE_OPTIONS', 'PYTHONPATH']))

    def test_url_rejects_remote_credentials_and_query(self):
        self.assertEqual(local_url('http://localhost:3000'), 'http://localhost:3000')
        for url in ['https://example.com', 'http://token@localhost', 'http://localhost/?token=value']:
            with self.assertRaises(TourError):
                local_url(url)

    def test_typed_values_require_exact_labels_and_never_credentials(self):
        provider = safe_text([{'label': 'Task name', 'values': ['Synthetic task']}])
        self.assertEqual(provider({'field': {'label': 'Task name'}})[0], 'Synthetic task')
        for label in ['Task name', 'Task name malicious suffix', 'Password', 'API key']:
            with self.assertRaises(TourError):
                provider({'field': {'label': label}})

    def test_observed_text_fallback_is_guarded_and_not_used_after_exhaustion(self):
        calls = []
        def fallback(context):
            calls.append(context['field']['label'])
            return 'Synthetic value', {'model': 'codex/test'}
        provider = safe_text([{'label': 'Known field', 'values': ['Configured value']}], fallback)
        self.assertEqual(provider({'field': {'label': 'Hidden field'}})[0], 'Synthetic value')
        self.assertEqual(calls, ['Hidden field'])
        self.assertEqual(provider({'field': {'label': 'Known field'}})[0], 'Configured value')
        with self.assertRaises(TourError):
            provider({'field': {'label': 'Known field'}})
        with self.assertRaises(TourError):
            provider({'field': {'label': 'API key'}})
        self.assertEqual(calls, ['Hidden field'])

    def test_done_is_not_outcome_evidence(self):
        page = {'text': 'Approve color palette', 'actions': [
            {'label': 'Filter by status → Done', 'value': 'done', 'current_value': 'done'},
            {'label': 'Filter by status → To do', 'value': 'todo', 'current_value': 'done'}]}
        checks = [{'kind': 'text_present', 'label': '', 'expected': 'Approve color palette'},
                  {'kind': 'text_absent', 'label': '', 'expected': 'Draft release notes'},
                  {'kind': 'control_value', 'label': 'Filter by status', 'expected': 'done'}]
        self.assertTrue(all(c['passed'] for c in verify_checks(page, checks)))
        page['text'] += '\nDraft release notes'
        self.assertFalse(verify_checks(page, checks)[1]['passed'])

    def test_missing_github_cli_has_installation_message(self):
        with patch('pro_tour.publishing.shutil.which', return_value=None):
            with self.assertRaisesRegex(TourError, 'not found on PATH.*cli.github.com.*gh auth login'):
                github_cli()

    def test_github_cli_uses_path_and_requires_media_capability(self):
        with patch('pro_tour.publishing.shutil.which', return_value='/trusted/bin/gh'):
            self.assertEqual(github_cli(), '/trusted/bin/gh')
        with patch('pro_tour.publishing.run', return_value='--body-file'):
            with self.assertRaisesRegex(TourError, 'Update gh.*local video is preserved'):
                require_media_support('/trusted/bin/gh')
        with patch('pro_tour.publishing.run', return_value='--attach --body-file'):
            require_media_support('/trusted/bin/gh')

    def test_cli_no_longer_exposes_github_executable_option(self):
        from pro_tour.cli import parser
        args = parser().parse_args(['publish', '--video', 'demo.mp4', '--pr', '4'])
        self.assertFalse(hasattr(args, 'gh'))

    def test_pr_lookup_distinguishes_missing_pr_from_github_failure(self):
        with patch('pro_tour.publishing.run', return_value='[]'):
            self.assertIsNone(resolve_pr('gh', Path('.'), branch='feat/no-pr'))
        with patch('pro_tour.publishing.run', side_effect=TourError('GitHub unavailable')):
            with self.assertRaises(TourError):
                resolve_pr('gh', Path('.'), branch='feat/no-pr')

    def test_recording_survives_missing_cli_and_failed_lookup_and_saves_before_publish_error(self):
        from pro_tour.cli import parser, record
        for failure, wants_publish in [('cli', False), ('lookup', False), ('cli', True), ('lookup', True)]:
            with self.subTest(failure=failure, publish=wants_publish), tempfile.TemporaryDirectory() as tmp:
                repo = Path(tmp)
                args = parser().parse_args(['record', '--url', 'http://localhost:3000', '--base', 'main',
                                           '--goal', 'Show filter', '--tab-id', 'app'] + (['--publish'] if wants_publish else []))
                def fake_run(command, **kwargs):
                    if command[1:4] == ['-m', 'pro_tour.executor', 'inspect']:
                        Path(command[5]).write_text(json.dumps({'tab': {'id': 'app', 'window_id': 1, 'created': False}}))
                    elif command[1:4] == ['-m', 'pro_tour.executor', 'run']:
                        self.assertEqual(json.loads(Path(command[-2]).read_text())['tab']['id'], 'app')
                        video = Path(command[-1])
                        video.write_bytes(b'encoded-video-fixture')
                        video.with_suffix('.trace.json').write_text(json.dumps({'status': 'success', 'error': None}))
                    if command[:2] == ['git', 'symbolic-ref']: return 'feat/filter'
                    return ''
                with ExitStack() as stack:
                    stack.enter_context(redirect_stdout(StringIO()))
                    for name, value in [('repository', repo), ('branch_diff', ('feat/filter', '+filter')),
                                        ('record_dependencies', None), ('app_ready', None),
                                        ('connected_browser', nullcontext(({}, {}))),
                                        ('probe_video', {'codec': 'h264'})]:
                        stack.enter_context(patch('pro_tour.cli.' + name, return_value=value))
                    stack.enter_context(patch('pro_tour.cli.run', side_effect=fake_run))
                    stack.enter_context(patch('pro_tour.cli.PROVIDERS', {'codex': Mock(usage=[],
                        plan=Mock(return_value={'steps': [], 'text_values': []}))}))
                    gh = stack.enter_context(patch('pro_tour.cli.github_cli', return_value='/trusted/gh'))
                    lookup = stack.enter_context(patch('pro_tour.cli.resolve_pr'))
                    if failure == 'cli':
                        gh.side_effect = TourError('GitHub CLI missing')
                    else:
                        lookup.side_effect = TourError('GitHub unavailable')
                    upload = stack.enter_context(patch('pro_tour.cli.publish'))
                    code = record(args, {'TYPESAFE_API_KEY': 'fixture'})
                    upload.assert_not_called()
                self.assertEqual(code, 1 if wants_publish else 0)
                video = repo / '.videos/feat-filter-no-pr-v1.mp4'
                self.assertEqual(video.read_bytes(), b'encoded-video-fixture')
                report = json.loads(video.with_suffix('.report.json').read_text())
                self.assertEqual(report['status'], 'success')
                self.assertTrue(report['video_saved'])
                self.assertEqual(report['pr_lookup']['status'], 'unavailable')
                self.assertEqual((report['publication'] or {}).get('status'), 'failure' if wants_publish else None)

    def test_invalid_or_ambiguous_pr_does_not_silently_fall_back(self):
        with patch('pro_tour.publishing.run') as command:
            with self.assertRaises(PrAssociationError):
                resolve_pr('gh', Path('.'), target='not-a-pr')
            command.assert_not_called()
        with patch('pro_tour.publishing.run', return_value='[{}, {}]'):
            with self.assertRaisesRegex(PrAssociationError, 'More than one PR'):
                resolve_pr('gh', Path('.'), branch='feat/filter')

    def test_upload_failure_preserves_local_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / 'demo.mp4'
            video.write_bytes(b'local-video')
            pr = {'number': 4, 'repo': 'nishilfaldu/pro-tour', 'url': 'https://github.com/nishilfaldu/pro-tour/pull/4'}
            with patch('pro_tour.publishing.probe_video'), patch('pro_tour.publishing.require_media_support'), \
                    patch('pro_tour.publishing.find_upload', return_value=None), \
                    patch('pro_tour.publishing.run', side_effect=TourError('gh failed')):
                with self.assertRaises(TourError):
                    publish('gh', video, pr, 'credential')
            self.assertEqual(video.read_bytes(), b'local-video')

    def test_diff_does_not_execute_external_diff_or_read_credential_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            def git(*args):
                return subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True)
            git('init', '-b', 'main')
            git('config', 'user.name', 'Test')
            git('config', 'user.email', 'test@example.test')
            (repo / 'app.txt').write_text('before')
            git('add', '.')
            git('commit', '-m', 'base')
            git('checkout', '-b', 'feat/change')
            (repo / 'app.txt').write_text('after')
            (repo / '.env').write_text('TOKEN=private-content')
            git('add', '.')
            git('commit', '-m', 'change')
            branch, diff = branch_diff(repo, 'main')
            self.assertEqual(branch, 'feat/change')
            self.assertIn('+after', diff)
            self.assertNotIn('private-content', diff)

    def test_command_timeout_stops_child(self):
        with self.assertRaises(TourError):
            run(['python3', '-c', 'import time; time.sleep(10)'], timeout=.1)

    def test_timeout_stops_recording_descendants(self):
        with tempfile.TemporaryDirectory() as tmp:
            pid_file = Path(tmp) / 'child.pid'
            code = """import subprocess,time,sys
from pathlib import Path
child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'])
Path(sys.argv[1]).write_text(str(child.pid))
try: time.sleep(30)
except KeyboardInterrupt: child.wait(timeout=3)
"""
            with self.assertRaises(TourError):
                run([sys.executable, '-c', code, str(pid_file)], timeout=.4)
            self.assertTrue(pid_file.exists())
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pid_file.read_text()), 0)

    def test_symlink_output_cannot_redirect_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / 'repo'
            repo.mkdir()
            elsewhere = Path(tmp) / 'elsewhere'
            elsewhere.mkdir()
            (repo / '.videos').symlink_to(elsewhere)
            with self.assertRaises(TourError):
                reserve_video(repo, 'feat/x', None)
            self.assertFalse((repo / '.gitignore').exists())

    def test_empty_expected_check_rejected(self):
        with self.assertRaises(TourError):
            validate_plan({'summary': 'Tour', 'steps': [{'goal': 'See filter', 'checks': [
                {'kind': 'text_present', 'label': '', 'expected': ''}]}], 'text_values': []})


if __name__ == '__main__':
    unittest.main()
