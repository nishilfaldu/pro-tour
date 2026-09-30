"""Trusted synthetic benchmark setup, launched only by the benchmark runner."""
import json
import secrets
import threading
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class FixtureServer(ThreadingHTTPServer):
    def __init__(self):
        super().__init__(('127.0.0.1', 0), Handler)
        self.epoch = secrets.token_hex(4)
        self.events = []
        self.lock = threading.Lock()

    def reset(self):
        with self.lock:
            self.epoch = secrets.token_hex(4)
            self.events = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def send(self, body, content_type='application/json', cookie=False):
        if isinstance(body, dict): body = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'")
        if cookie: self.send_header('Set-Cookie', 'pro_tour_demo_session=synthetic-only; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/session':
            self.send({'epoch': self.server.epoch, 'signed_in': 'pro_tour_demo_session=synthetic-only' in self.headers.get('Cookie', '')})
        elif self.path == '/setup':
            self.send({'status': 'Synthetic demo session ready'}, cookie=True)
        elif self.path == '/events':
            with self.server.lock: self.send({'events': list(self.server.events)})
        elif self.path.startswith('/videos/'):
            name = self.path.removeprefix('/videos/')
            if Path(name).name != name or not name.endswith('.mp4'): return self.send_error(404)
            file = self.server.videos / name
            if not file.is_file() or file.is_symlink(): return self.send_error(404)
            self.send(file.read_bytes(), 'video/mp4')
        elif self.path.startswith('/player/'):
            name = self.path.removeprefix('/player/')
            if Path(name).name != name or not name.endswith('.mp4'): return self.send_error(404)
            self.send(('<!doctype html><title>Pro Tour playback</title><video controls autoplay muted style="width:100%;max-height:100vh" src="/videos/' + escape(name, quote=True) + '"></video>').encode(), 'text/html')
        elif self.path in {'/', '/app.js', '/style.css'}:
            name = 'index.html' if self.path == '/' else self.path[1:]
            types = {'index.html': 'text/html', 'app.js': 'text/javascript', 'style.css': 'text/css'}
            self.send(Path(__file__).with_name(name).read_bytes(), types[name])
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == '/reset':
            self.server.reset()
            return self.send({'ok': True})
        if self.path != '/events': return self.send_error(404)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length < 100_000: return self.send_error(400)
            event = json.loads(self.rfile.read(length))
            with self.server.lock: self.server.events.append(event)
            self.send({'ok': True})
        except (ValueError, TypeError): self.send_error(400)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--ready', type=Path, required=True)
    parser.add_argument('--videos', type=Path, required=True)
    args = parser.parse_args()
    server = FixtureServer()
    server.videos = args.videos.resolve()
    args.ready.write_text(json.dumps({'url': f'http://127.0.0.1:{server.server_port}'}))
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
