"""Local static server that mimics Vercel cleanUrls (/work/bola -> /work/bola.html)."""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and os.path.exists(p + ".html"):
            return p + ".html"
        return p


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5190
    http.server.ThreadingHTTPServer(("localhost", port), Handler).serve_forever()
