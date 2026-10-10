"""Cache-bust main.css / main.js: rewrite their links in every EN page to ?v=<content hash>.
/assets is cached for 7 days (vercel.json), so run this (then build_zh.py) whenever either file changes."""
import glob
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = {'/assets/css/main.css': 'href', '/assets/js/main.js': 'src'}
ver = {p: hashlib.md5(open(ROOT + p, 'rb').read()).hexdigest()[:8] for p in ASSETS}

pages = ['index.html', 'about.html'] + sorted(glob.glob(os.path.join(ROOT, 'work', '*.html')))
for page in pages:
    f = os.path.join(ROOT, page)
    s = open(f, encoding='utf-8').read()
    for p, attr in ASSETS.items():
        s = re.sub(rf'{attr}="{re.escape(p)}(\?v=[0-9a-f]+)?"', f'{attr}="{p}?v={ver[p]}"', s)
    open(f, 'w', encoding='utf-8', newline='\n').write(s)
print(ver)
