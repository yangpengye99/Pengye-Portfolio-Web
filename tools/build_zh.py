"""Build the Chinese site (/zh/...) from the English pages.

Every visible text node is looked up in i18n/zh-*.json (exact match on whitespace-normalised
English). Internal links are re-pointed to /zh, the language bubble flips to "EN", and the
WooWoof slides are replaced by i18n/woowoof-slides-zh.html (built from the PDF's own Chinese).
Password-locked pages (<main data-locked>) are skipped here; tools/build_locked.py builds both
languages of those from private/ and reuses to_zh().
Run:  python tools/build_zh.py        (prints any English string that has no translation)
"""
import glob
import json
import os

from bs4 import BeautifulSoup, Comment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ZH = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'i18n', 'zh-*.json'))):
    ZH.update(json.load(open(f, encoding='utf-8')))


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


def to_zh(html, rel, zh=ZH):
    """English page HTML -> (Chinese page HTML, untranslated strings). rel = path like 'work/x.html'."""
    missing = []
    soup = BeautifulSoup(html, 'html.parser')
    soup.html['lang'] = 'zh-CN'

    for t in soup.find_all(string=True):
        if isinstance(t, Comment) or t.parent.name in ('script', 'style'):
            continue
        if t.find_parent(class_='slides') or t.find_parent(attrs={'translate': 'no'}):
            continue
        key = norm(t)
        if not key or not any(c.isalpha() for c in key):
            continue
        if key in zh:
            lead = ' ' if t[:1].isspace() else ''
            tail = ' ' if t[-1:].isspace() else ''
            t.replace_with(lead + zh[key] + tail)
        elif t.parent.name != 'title' and key not in ('html',):
            missing.append(key)

    # <title> and meta
    if soup.title and norm(soup.title.string or '') in zh:
        soup.title.string = zh[norm(soup.title.string)]
    for m in soup.find_all('meta'):
        k = m.get('name') or m.get('property')
        if k in ('description', 'og:title', 'og:description') and norm(m.get('content', '')) in zh:
            m['content'] = zh[norm(m['content'])]
    for el in soup.find_all(attrs={'aria-label': True}):
        if norm(el['aria-label']) in zh:
            el['aria-label'] = zh[norm(el['aria-label'])]

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
        zh_slides = BeautifulSoup(open(os.path.join(ROOT, 'i18n', 'woowoof-slides-zh.html'), encoding='utf-8').read(), 'html.parser')
        slides.replace_with(zh_slides)

    return str(soup), missing


def main():
    os.chdir(ROOT)
    pages = ['index.html', 'about.html'] + sorted(glob.glob('work/*.html'))
    missing, built = {}, 0
    for page in pages:
        rel = page.replace(os.sep, '/')
        src = open(page, encoding='utf-8').read()
        if 'data-locked' in src:
            continue                      # built by tools/build_locked.py
        html, miss = to_zh(src, rel)
        if miss:
            missing[rel] = miss
        out = os.path.join('zh', 'index.html' if rel == 'index.html' else rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8', newline='\n').write(html)
        built += 1

    if missing:
        print('UNTRANSLATED:')
        for k, v in missing.items():
            for s in dict.fromkeys(v):
                print(f'  [{k}] {s}')
    else:
        print('all strings translated')
    print('built', built, 'pages into zh/')


if __name__ == '__main__':
    main()
