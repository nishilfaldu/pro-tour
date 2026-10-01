import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from pro_tour.common import TourError
from pro_tour.tabs import select_app_tab
from pro_tour.executor import initialize, execute


class AppTabTests(unittest.TestCase):
    def setUp(self):
        self.targets = [{'type': 'page', 'targetId': 'app', 'url': 'http://localhost:3000/tasks?filter=done'},
                        {'type': 'page', 'targetId': 'unrelated', 'url': 'https://example.test/'}]
        self.calls = []

    def cdp(self, method, **params):
        self.calls.append((method, params))
        if method == 'Target.getTargets': return {'targetInfos': self.targets}
        if method == 'Target.createTarget': return {'targetId': 'new-app'}
        if method == 'Browser.getWindowForTarget': return {'windowId': 17}
        if method == 'Target.attachToTarget': return {'sessionId': 'session'}
        if method == 'Runtime.evaluate': return {'result': {'value': 'complete'}}
        return {}

    def test_existing_app_route_is_reused_without_navigation(self):
        with patch('browser_harness.helpers.cdp', side_effect=self.cdp):
            self.assertEqual(select_app_tab('http://localhost:3000'), {'id': 'app', 'window_id': 17, 'created': False})
        self.assertFalse(any(method == 'Target.createTarget' for method, _ in self.calls))

    def test_absent_app_opens_requested_url_in_existing_window(self):
        self.targets = self.targets[1:]
        with patch('browser_harness.helpers.cdp', side_effect=self.cdp):
            self.assertTrue(select_app_tab('http://localhost:3000/tasks')['created'])
        self.assertIn(('Target.createTarget', {'url': 'http://localhost:3000/tasks', 'newWindow': False, 'background': False}), self.calls)

    def test_ambiguous_tabs_require_explicit_selection(self):
        self.targets.append({'type': 'page', 'targetId': 'other-app', 'url': 'http://localhost:3000/drafts'})
        with patch('browser_harness.helpers.cdp', side_effect=self.cdp):
            with self.assertRaisesRegex(TourError, '--tab-id.*app, other-app'):
                select_app_tab('http://localhost:3000')
            self.assertEqual(select_app_tab('http://localhost:3000', 'other-app')['id'], 'other-app')
            self.assertEqual(select_app_tab('http://localhost:3000/tasks')['id'], 'app')

    def test_closed_or_moved_selection_never_opens_replacement(self):
        with patch('browser_harness.helpers.cdp', side_effect=self.cdp):
            with self.assertRaisesRegex(TourError, 'closed'):
                select_app_tab('http://localhost:3000', 'unrelated')
            with self.assertRaisesRegex(TourError, 'moved'):
                select_app_tab('http://localhost:3000', 'app', expected_window=99)
        self.assertFalse(any(method == 'Target.createTarget' for method, _ in self.calls))

    def test_attachment_detaches_without_closing_or_reloading_app_even_on_failure(self):
        import pro_tour._vendor.jev_ultrafast.browser as browser
        import pro_tour._vendor.jev_ultrafast.agent as agent
        with patch.object(browser, 'Browser', browser.Browser), patch.object(agent, 'Browser', agent.Browser), \
                patch.object(browser, 'ensure_daemon'), patch('browser_harness.admin.require_existing_daemon'), \
                patch('browser_harness.helpers.cdp', side_effect=self.cdp), patch.object(browser, 'cdp', side_effect=self.cdp):
            attached = initialize(tab={'id': 'app', 'window_id': 17}).Browser('http://localhost:3000')
            attached.close()
            attached.close()
            with patch.object(browser.Browser, 'evaluate', side_effect=TourError('app unavailable')):
                with self.assertRaisesRegex(TourError, 'app unavailable'):
                    browser.Browser('http://localhost:3000')
        methods = [method for method, _ in self.calls]
        self.assertEqual(methods.count('Target.detachFromTarget'), 2)
        self.assertFalse(set(methods) & {'Target.closeTarget', 'Target.createTarget', 'Page.navigate', 'Page.reload', 'Emulation.setDeviceMetricsOverride'})

    def test_agent_initial_observation_failure_detaches_its_unreturned_browser(self):
        import pro_tour._vendor.jev_ultrafast.browser as browser
        import pro_tour._vendor.jev_ultrafast.agent as agent
        def fail_agent(url, goal):
            browser.Browser(url)
            raise TourError('Initial observation failed')
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(browser, 'Browser', browser.Browser), patch.object(agent, 'Browser', agent.Browser), \
                patch.object(agent, 'field_text', agent.field_text), patch.object(browser, 'ensure_daemon'), \
                patch('browser_harness.admin.require_existing_daemon'), \
                patch('browser_harness.helpers.cdp', side_effect=self.cdp), patch.object(browser, 'cdp', side_effect=self.cdp), \
                patch('pro_tour.executor.install_model_retries'), patch('pro_tour._vendor.jev_ultrafast.Agent', side_effect=fail_agent):
            trace = execute('http://localhost:3000', {'tab': {'id': 'app', 'window_id': 17},
                'text_values': [], 'steps': [{'goal': 'Show tasks'}]}, Path(tmp) / 'failure.mp4')
        self.assertEqual(trace['status'], 'failure')
        self.assertEqual(trace['error'], 'Initial observation failed')
        methods = [method for method, _ in self.calls]
        self.assertEqual(methods.count('Target.detachFromTarget'), 1)
        self.assertNotIn('Target.closeTarget', methods)


if __name__ == '__main__': unittest.main()
