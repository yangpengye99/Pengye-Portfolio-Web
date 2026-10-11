"""Cache-bust: rewrite main.css / main.js links and every <img src="/assets/img/..."> to ?v=<content hash>.
/assets is cached for 7 days (vercel.json), so a changed file must get a new URL or returning visitors
keep the old one. Run this LAST (after build_zh.py), whenever CSS, JS or any image changes; it stamps
both the EN pages and the generated /zh pages."""
import glob
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_hash = {}


def ver(path):
    if path not in _hash:
        f = ROOT + path
        _hash[path] = hashlib.md5(open(f, 'rb').read()).hexdigest()[:8] if os.path.exists(f) else None
    return _hash[path]


def stamp(m):
    attr, path = m.group(1), m.group(2)
    v = ver(path)
    return f'{attr}="{path}?v={v}"' if v else m.group(0)


# the avif -> webp fallback must keep working when the src carries a ?v= query
OLD_FALLBACK = 'if(t.tagName==="IMG"&&/\\.avif$/.test(t.getAttribute("src")||""))t.src=t.getAttribute("src").replace(/\\.avif$/,".webp")'
NEW_FALLBACK = 'if(t.tagName==="IMG"&&/\\.avif(\\?|$)/.test(t.getAttribute("src")||""))t.src=t.getAttribute("src").replace(/\\.avif(?=\\?|$)/,".webp")'

pages = ['index.html', 'about.html'] + sorted(glob.glob('work/*.html', root_dir=ROOT)) + sorted(glob.glob('zh/**/*.html', root_dir=ROOT, recursive=True))
n = 0
for page in pages:
    f = os.path.join(ROOT, page)
    s = open(f, encoding='utf-8').read()
    s = s.replace(OLD_FALLBACK, NEW_FALLBACK)
    s2 = re.sub(r'(href|src)="(/assets/(?:css/main\.css|js/main\.js|img/[^"?]+))(?:\?v=[0-9a-f]+)?"', stamp, s)
    n += len(re.findall(r'\?v=[0-9a-f]{8}', s2))
    open(f, 'w', encoding='utf-8', newline='\n').write(s2)
print(len(pages), 'pages,', n, 'versioned urls')
