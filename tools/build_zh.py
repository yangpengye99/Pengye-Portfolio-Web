"""Build the Chinese site (/zh/...) from the English pages.

Every visible text node is looked up in i18n/zh-*.json (exact match on whitespace-normalised
English). Internal links are re-pointed to /zh, the language bubble flips to "EN", and the
WooWoof slides are replaced by i18n/woowoof-slides-zh.html (built from the PDF's own Chinese).
Run:  python tools/build_zh.py        (prints any English string that has no translation)
"""
import glob
import json
import os
import re

from bs4 import BeautifulSoup, Comment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

ZH = {}
for f in sorted(glob.glob('i18n/zh-*.json')):
    ZH.update(json.load(open(f, encoding='utf-8')))

ATTR = {'title': None, 'meta': ('description', 'og:title', 'og:description')}
PAGES = ['index.html', 'about.html'] + sorted(glob.glob('work/*.html'))
missing = {}


def norm(s):
    return ' '.join(s.split())


def zh_href(h):
    if not h or not h.startswith('/') or h.startswith(('/assets/', '/play/', '/zh')):
        return h
    if h == '/':
        return '/zh'
    if h.startswith('/#'):
        return '/zh' + h[1:]
    return '/zh' + h


for page in PAGES:
    rel = page.replace(os.sep, '/')
    soup = BeautifulSoup(open(page, encoding='utf-8').read(), 'html.parser')
    soup.html['lang'] = 'zh-CN'

    for t in soup.find_all(string=True):
        if isinstance(t, Comment) or t.parent.name in ('script', 'style'):
            continue
        if t.find_parent(class_='slides'):
            continue
        key = norm(t)
        if not key or not any(c.isalpha() for c in key):
            continue
        if key in ZH:
            lead = ' ' if t[:1].isspace() else ''
            tail = ' ' if t[-1:].isspace() else ''
            t.replace_with(lead + ZH[key] + tail)
        elif t.parent.name != 'title' and key not in ('html',):
            missing.setdefault(rel, []).append(key)

    # <title> and meta
    if soup.title and norm(soup.title.string or '') in ZH:
        soup.title.string = ZH[norm(soup.title.string)]
    for m in soup.find_all('meta'):
        k = m.get('name') or m.get('property')
        if k in ('description', 'og:title', 'og:description') and norm(m.get('content', '')) in ZH:
            m['content'] = ZH[norm(m['content'])]

    for a in soup.find_all('a'):
        a['href'] = zh_href(a.get('href'))

    bubble = soup.find('a', class_='lang-bubble')
    if bubble:
        path = '/' if rel == 'index.html' else '/' + rel[:-5]
        bubble['href'] = path
        bubble['hreflang'] = 'en'
        bubble['lang'] = 'en'
        bubble['aria-label'] = 'Switch to English'
        bubble.string = 'EN'

    if rel == 'work/woowoof.html':
        slides = soup.find(class_='slides')
        zh_slides = BeautifulSoup(open('i18n/woowoof-slides-zh.html', encoding='utf-8').read(), 'html.parser')
        slides.replace_with(zh_slides)

    out = os.path.join('zh', 'index.html' if rel == 'index.html' else rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    html = str(soup)
    open(out, 'w', encoding='utf-8', newline='\n').write(html)

if missing:
    print('UNTRANSLATED:')
    for k, v in missing.items():
        for s in dict.fromkeys(v):
            print(f'  [{k}] {s}')
else:
    print('all strings translated')
print('built', len(PAGES), 'pages into zh/')
