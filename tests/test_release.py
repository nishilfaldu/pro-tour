import json
import os
import tempfile
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import Mock, patch

from pro_tour.browser import select_connection, connected_browser, existing_connection
from pro_tour.common import TourError, retry_read, tab_capture_lock, clean_env
from pro_tour.executor import install_model_retries
from pro_tour.publishing import publish
from pro_tour.publishing import resolve_pr, PrAssociationError
from pro_tour.repository import derive_base, video_pr
from benchmarks.run import oracle


class ReleaseTests(unittest.TestCase):
    def test_malformed_github_data_does_not_become_missing_pr(self):
        for raw in ('invalid-json', '{}', '[null]'):
            with patch('pro_tour.publishing.run', return_value=raw):
                with self.assertRaises(PrAssociationError): resolve_pr('gh', Path('.'), branch='feature')
    def test_approved_connection_reuses_only_healthy_private_transport_without_new_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'connection.json'
            state = {'owner_pid': os.getpid(), 'env': {'BH_RUNTIME_DIR': tmp, 'TYPESAFE_API_KEY': 'must-not-forward'},
                     'browser': {'connection': 'discovered', 'endpoint': 'http://127.0.0.1:9222'}}
            path.write_text(json.dumps(state)); path.chmod(0o600)
            with patch.dict(os.environ, {'PRO_TOUR_CONNECTION_FILE': str(path)}), patch('pro_tour.browser.run'):
                env, identity = existing_connection()
                self.assertNotIn('TYPESAFE_API_KEY', env)
                with patch('pro_tour.browser.subprocess.Popen') as spawn, redirect_stdout(StringIO()):
                    with connected_browser(Path(tmp)) as connection: self.assertEqual(connection[1], identity)
                    spawn.assert_not_called()
                path.chmod(0o644)
                with self.assertRaisesRegex(TourError, 'private permissions'): existing_connection()
                path.chmod(0o600)
                with patch('pro_tour.browser.run', side_effect=TourError('dead')):
                    with self.assertRaisesRegex(TourError, 'unavailable'): existing_connection()

    def test_capture_and_input_are_serialized_between_processes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'BH_TMP_DIR': tmp}):
            marker = Path(tmp) / 'entered'
            code = 'from pro_tour.common import tab_capture_lock; from pathlib import Path; import sys;\nwith tab_capture_lock("tab"):\n Path(sys.argv[1]).touch()'
            with tab_capture_lock('tab'):
                child = subprocess.Popen([sys.executable, '-c', code, str(marker)],
                    env=clean_env(BH_TMP_DIR=tmp, PYTHONPATH=str(Path(__file__).resolve().parents[1] / 'src')))
                try:
                    with self.assertRaises(subprocess.TimeoutExpired): child.wait(timeout=.2)
                    self.assertFalse(marker.exists())
                except BaseException:
                    child.kill(); child.wait(); raise
            child.wait(timeout=5)
            self.assertTrue(marker.exists())

    def test_discovery_uses_running_visible_profile_and_rejects_ambiguity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'DevToolsActivePort').write_text('9222\n/devtools/browser/test-session\n')
            instance = {'pid': 123, 'user_data_dir': str(root), 'profile_directory': 'Default', 'port': None, 'headless': False}
            with patch('pro_tour.browser.running_chromes', return_value=[instance]):
                transport, metadata = select_connection()
                self.assertEqual(transport['BU_CDP_WS'], 'ws://127.0.0.1:9222/devtools/browser/test-session')
                self.assertEqual(metadata['pid'], 123)
            with patch('pro_tour.browser.running_chromes', return_value=[instance, {**instance, 'pid': 124}]):
                with self.assertRaisesRegex(TourError, 'Multiple'): select_connection()
            with patch('pro_tour.browser.running_chromes', return_value=[{**instance, 'headless': True}]):
                with self.assertRaisesRegex(TourError, 'No debugging connection'): select_connection()

    def test_connection_failure_stops_daemon_without_starting_chrome(self):
        daemon = Mock(poll=Mock(return_value=1))
        with tempfile.TemporaryDirectory() as tmp, redirect_stdout(StringIO()), \
                patch('pro_tour.browser.existing_connection', return_value=None), \
                patch('pro_tour.browser.select_connection', return_value=({'BU_CDP_WS': 'ws://localhost/test'}, {'connection': 'discovered'})), \
                patch('pro_tour.browser.subprocess.Popen', return_value=daemon) as spawned, \
                patch('pro_tour.browser.stop') as stop:
            with self.assertRaises(TourError):
                with connected_browser(Path(tmp)): self.fail('Unhealthy connection must not yield')
            stop.assert_called_once_with(daemon)
            self.assertEqual(spawned.call_args.args[0][1:], ['-m', 'pro_tour.transport'])
            self.assertNotIn('TYPESAFE_API_KEY', spawned.call_args.kwargs['env'])
            self.assertEqual(spawned.call_args.kwargs['env']['BH_TELEMETRY'], 'false')

    def test_base_defaults_to_pr_target_remote_including_fork(self):
        def git(args, **kwargs):
            if args == ['git', 'remote']: return 'origin\nupstream'
            if args[:3] == ['git', 'remote', 'get-url']:
                return 'git@github.com:contributor/fork.git' if args[3] == 'origin' else 'https://github.com/maintainer/app.git'
            return 'commit'
        with patch('pro_tour.repository.run', side_effect=git):
            self.assertEqual(derive_base(Path('.'), pr={'repo': 'maintainer/app', 'baseRefName': 'develop'}), ('upstream/develop', 'pr'))
        with patch('pro_tour.repository.run', return_value='refs/remotes/origin/main'):
            self.assertEqual(derive_base(Path('.')), ('origin/main', 'remote-default'))
        with patch('pro_tour.repository.run', side_effect=TourError('missing')):
            with self.assertRaisesRegex(TourError, 'Supply --base'): derive_base(Path('.'))

    def test_video_metadata_infers_target_but_never_guesses(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / 'v1.mp4'
            with self.assertRaisesRegex(TourError, 'Supply --pr'): video_pr(video)
            video.with_suffix('.report.json').write_text(json.dumps({'pr_url': 'https://github.com/example/app/pull/9'}))
            self.assertEqual(video_pr(video), 'https://github.com/example/app/pull/9')

    def test_read_retries_are_bounded(self):
        read = Mock(side_effect=[TourError('transient'), TourError('transient'), 'ok'])
        with patch('pro_tour.common.time.sleep'):
            self.assertEqual(retry_read(read), 'ok')
            self.assertEqual(read.call_count, 3)
            bad = Mock(side_effect=TourError('unavailable'))
            with self.assertRaises(TourError): retry_read(bad)
            self.assertEqual(bad.call_count, 3)

    def test_typesafe_retries_transport_and_server_errors_but_not_auth(self):
        import httpx
        import pro_tour._vendor.jev_ultrafast.model as model
        original = model.post_json
        try:
            install_model_retries()
            response = Mock(status_code=200, is_error=False, json=Mock(return_value={'answer': 'ok'}))
            with patch.object(model.CLIENT, 'post', side_effect=[httpx.ConnectError('private detail'), Mock(status_code=503), response]) as post, patch('pro_tour.executor.time.sleep'):
                self.assertEqual(model.post_json('https://api.typesafe.ai/test', 'fixture', {}), {'answer': 'ok'})
                self.assertEqual(post.call_count, 3)
            with patch.object(model.CLIENT, 'post', return_value=Mock(status_code=401, is_error=True)) as post:
                with self.assertRaisesRegex(TourError, 'HTTP 401'): model.post_json('https://api.typesafe.ai/test', 'fixture', {})
                self.assertEqual(post.call_count, 1)
        finally: model.post_json = original

    def test_ambiguous_upload_reconciles_and_does_not_repeat(self):
        pr = {'number': 9, 'repo': 'example/app', 'url': 'https://github.com/example/app/pull/9'}
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / 'feat-pr9-v1.mp4'
            video.write_bytes(b'fixture')
            url = pr['url'] + '#issuecomment-1'
            with patch('pro_tour.publishing.probe_video'), patch('pro_tour.publishing.require_media_support'), \
                    patch('pro_tour.publishing.find_upload', side_effect=[None, url]), \
                    patch('pro_tour.publishing.run', side_effect=TourError('lost response')) as upload:
                self.assertEqual(publish('gh', video, pr, 'fixture')['comment_url'], url)
                self.assertEqual(upload.call_count, 1)
            with patch('pro_tour.publishing.probe_video'), patch('pro_tour.publishing.require_media_support'), \
                    patch('pro_tour.publishing.find_upload', return_value=url), patch('pro_tour.publishing.run') as upload:
                self.assertTrue(publish('gh', video, pr, 'fixture')['reused'])
                upload.assert_not_called()
            self.assertEqual(video.read_bytes(), b'fixture')
            self.assertFalse(video.with_suffix('.upload.lock').exists())

    def test_unknown_upload_requires_explicit_retry_when_comment_not_visible(self):
        pr = {'number': 9, 'repo': 'example/app', 'url': 'https://github.com/example/app/pull/9'}
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / 'feat-pr9-v1.mp4'
            video.write_bytes(b'fixture')
            with patch('pro_tour.publishing.probe_video'), patch('pro_tour.publishing.require_media_support'), \
                    patch('pro_tour.publishing.find_upload', return_value=None), \
                    patch('pro_tour.publishing.run', side_effect=TourError('unknown')) as upload:
                with self.assertRaises(TourError): publish('gh', video, pr, 'fixture')
                with self.assertRaisesRegex(TourError, '--retry-upload'): publish('gh', video, pr, 'fixture')
                self.assertEqual(upload.call_count, 1)
            with patch('pro_tour.publishing.probe_video'), patch('pro_tour.publishing.require_media_support'), \
                    patch('pro_tour.publishing.find_upload', return_value=None), \
                    patch('pro_tour.publishing.run', return_value=pr['url'] + '#issuecomment-2') as upload:
                publish('gh', video, pr, 'fixture', retry_upload=True)
                self.assertEqual(upload.call_count, 1)

    def test_benchmark_oracle_rejects_completion_without_cancel_or_with_fixture_error(self):
        tasks = [{'name': 'Draft release notes', 'details': 'Summarize the latest changes for the team.', 'status': 'todo'}, {'name': 'Review onboarding flow'}, {'name': 'Approve color palette'}]
        events = [{'kind': 'render', 'filter': 'todo', 'visible': ['Draft release notes'], 'tasks': tasks},
                  {'kind': 'render', 'filter': 'all', 'visible': [t['name'] for t in tasks], 'tasks': tasks}]
        self.assertFalse(oracle('cancel_edit', events))
        events.insert(0, {'kind': 'cancel', 'name': 'Discarded synthetic draft', 'details': 'Discarded synthetic details'})
        self.assertTrue(oracle('cancel_edit', events))
        events.append({'kind': 'fixture-error', 'message': 'synthetic fixture failure'})
        self.assertFalse(oracle('cancel_edit', events))


if __name__ == '__main__': unittest.main()
