import importlib.util
import json
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('todo_fixture', ROOT / 'benchmarks/sample-todo-app/server.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.server = fixture.FixtureServer()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=3)
        self.server.server_close()

    def get(self, path):
        return self.opener.open(self.url + path, timeout=3)

    def test_browser_fixture_contract_has_no_login_or_cookie(self):
        with self.get('/fixture') as response:
            data = json.load(response)
            self.assertEqual(data, {'epoch': self.server.epoch})
            self.assertIsNone(response.headers.get('Set-Cookie'))
        for path in ('/session', '/setup'):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.get(path)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()
        with self.get('/app.js') as response:
            self.assertIn("fetch('/fixture')", response.read().decode())

    def test_player_styles_load_under_its_content_security_policy(self):
        with self.get('/player/synthetic.mp4') as response:
            page = response.read().decode()
            self.assertIn('href="/player.css"', page)
            self.assertNotIn('style=', page)
        with self.get('/player.css') as response:
            self.assertEqual(response.headers.get('Content-Type'), 'text/css')
            self.assertIn('object-fit:contain', response.read().decode())


if __name__ == '__main__': unittest.main()
