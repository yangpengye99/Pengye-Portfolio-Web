"""Add hreflang alternates to every EN page (English = x-default; the site targets US companies).
Idempotent; build_zh.py copies the <head>, so the /zh pages carry the same set."""
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://www.pengye-yang.com'
pages = ['index.html', 'about.html'] + [p.replace(os.sep, '/') for p in sorted(glob.glob('work/*.html', root_dir=ROOT))]
for page in pages:
    path = '/' + page[:-5].replace('index', '').rstrip('/') if page != 'index.html' else '/'
    en = SITE + path if path != '/' else SITE + '/'
    zh = SITE + '/zh' + (path if path != '/' else '')
    block = (f'<link rel="alternate" hreflang="en" href="{en}">\n'
             f'<link rel="alternate" hreflang="zh-CN" href="{zh}">\n'
             f'<link rel="alternate" hreflang="x-default" href="{en}">\n')
    f = os.path.join(ROOT, page)
    s = open(f, encoding='utf-8').read()
    s = re.sub(r'<link rel="alternate" hreflang="[^"]+" href="[^"]+">\n', '', s)
    s = s.replace('</head>', block + '</head>', 1)
    open(f, 'w', encoding='utf-8', newline='\n').write(s)
    print(page, en, zh)
