#!/usr/bin/env python3
"""Tiny static server for the black hole game. Usage: python3 serve.py [port]"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
DIR = os.path.dirname(os.path.abspath(__file__))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, *args):  # keep console clean
        pass

    # Dev caching: never serve stale modules to an installed PWA. Without this
    # browsers heuristically cache .js by Last-Modified and keep mixing old and
    # new module files after a refactor (breaks import graphs).
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, max-age=0, must-revalidate")
        super().end_headers()


print(f"Serving blackhole-game at:")
print(f"  http://localhost:{PORT}/")
print(f"  (on your phone, use http://<this-machine-ip>:{PORT}/)")
http.server.ThreadingHTTPServer(("0.0.0.0", PORT), QuietHandler).serve_forever()
