"""Build password-locked case studies (EN + /zh) from private/.

private/ is git- and vercel-ignored: it holds the plain-English page (private/<slug>.html), its
Chinese dictionary (private/zh-*.json) and the password (private/.password, or $LOCK_PASSWORD).
For each page this translates to Chinese with build_zh.to_zh(), stamps asset URLs, encrypts the
<main> content with tools/encrypt.mjs (AES-GCM, PBKDF2 key) and writes a lock-screen shell to
work/<slug>.html and zh/work/<slug>.html. assets/js/lock.js decrypts it in the browser.
Run (after build_zh.py, before stamp_assets.py):  python tools/build_locked.py
"""
import glob
import json
import os
import subprocess
import sys

from bs4 import BeautifulSoup, Comment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from build_zh import ZH, to_zh  # noqa: E402
from stamp_assets import stamp_text  # noqa: E402

PRIVATE = os.path.join(ROOT, 'private')
LOCK_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            'stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>')
UI = {
    'en': dict(eyebrow='Private case study', body='This project is shared privately during interviews. Enter the password to view it.',
               placeholder='Password', button='Unlock', error='Incorrect password. Please try again.', label='Password'),
    'zh': dict(eyebrow='私密案例', body='这个项目仅在面试时展示，请输入密码查看。',
               placeholder='密码', button='解锁', error='密码不正确，请重试。', label='密码'),
}


def password():
    pw = os.environ.get('LOCK_PASSWORD')
    if not pw and os.path.exists(os.path.join(PRIVATE, '.password')):
        pw = open(os.path.join(PRIVATE, '.password'), encoding='utf-8').read().strip()
    if not pw:
        sys.exit('No password: set LOCK_PASSWORD or create private/.password')
    return pw


def encrypt(text, pw):
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'encrypt.mjs')], input=text.encode('utf-8'),
                       capture_output=True, env={**os.environ, 'LOCK_PASSWORD': pw}, check=True)
    return json.loads(r.stdout)


def shell(html, lang, pw):
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.find('main')
    for c in main.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()                      # comments would otherwise surface as text
    inner = stamp_text(main.decode_contents())
    payload = encrypt(inner, pw)
    title = soup.find('h1').get_text(strip=True)
    og = soup.find('meta', property='og:image')        # wide hero art, blurred behind the lock card
    hero_src = og['content'].rsplit('.', 1)[0] + '.avif'
    t = UI[lang]
    main.clear()
    main['class'] = 'locked'
    main['data-locked'] = ''
    main.append(BeautifulSoup(
        f'<div class="lock-bg" aria-hidden="true"><img decoding="async" src="{hero_src}" alt=""></div>'
        f'<div class="lock-card"><span class="lock-icon">{LOCK_SVG}</span>'
        f'<span class="eyebrow">{t["eyebrow"]}</span><h1 class="h-2"><span class="grad">{title}</span></h1>'
        f'<p class="body">{t["body"]}</p>'
        f'<form class="lock-form" autocomplete="off"><input type="password" inputmode="numeric" aria-label="{t["label"]}" '
        f'placeholder="{t["placeholder"]}" required><button class="btn btn-primary" type="submit">{t["button"]}</button></form>'
        f'<p class="lock-error" role="alert" hidden>{t["error"]}</p></div>'
        f'<script type="application/json" id="locked-payload">{json.dumps(payload)}</script>', 'html.parser'))
    main_js = soup.find('script', src=lambda s: s and s.startswith('/assets/js/main.js'))
    main_js.insert_before(BeautifulSoup('<script src="/assets/js/lock.js" defer></script>\n', 'html.parser'))
    return str(soup)


def main():
    pw = password()
    zh = dict(ZH)
    for f in sorted(glob.glob(os.path.join(PRIVATE, 'zh-*.json'))):
        zh.update(json.load(open(f, encoding='utf-8')))
    for src in sorted(glob.glob(os.path.join(PRIVATE, '*.html'))):
        slug = os.path.basename(src)
        rel = 'work/' + slug
        en = open(src, encoding='utf-8').read()
        zh_html, missing = to_zh(en, rel, zh)
        for lang, html, out in (('en', en, rel), ('zh', zh_html, 'zh/' + rel)):
            path = os.path.join(ROOT, out)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'w', encoding='utf-8', newline='\n').write(shell(html, lang, pw))
        print('locked', rel, '+ zh/' + rel)
        for s in dict.fromkeys(missing):
            print('  UNTRANSLATED', s)


if __name__ == '__main__':
    main()
