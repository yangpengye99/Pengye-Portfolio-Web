"""Mobile reading order for the WooWoof front-end slides (work/woowoof.html).

Under 760px each .slide.fe drops its absolute layout and becomes one column ordered by --o.
A row-by-row order splits grids apart (three numbers, then three labels, then three captions).
This pass finds blocks of rows that share the same column positions and renumbers --o
column by column, so every label stays with its value, image or caption.
It also orders i18n/woowoof-slides-zh.html, the Chinese slides build_zh.py splices in.
Run it after any change to the WooWoof slides, then build_zh.py and stamp_assets.py."""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [os.path.join(ROOT, 'work', 'woowoof.html'), os.path.join(ROOT, 'i18n', 'woowoof-slides-zh.html')]
ROW_TOL = 16      # px (1920 grid): elements this close in y share a row
COL_TOL = 130     # px: centres this close belong to the same column
GAP_MAX = 340     # px: a larger vertical gap ends the block
HIDDEN = ('fe-card', 'fe-capsule', 'fe-orb', 'fe-lines', 'fe-deco', 'fe-sign', 'ghost', 'solid')
# slides whose flow is not a grid: list every visible element in reading order
# (a text snippet the element starts with, or part of an image file name)
OVERRIDES = {
    'Insight in Four S': ['From Health Data to AI Insight in Four S', 'From Health Data to AI Insights in Four', 'p18-0',
                          '1', 'Home Overview', 'Core health data on one screen',
                          '2', 'View Full Data', 'Every body metric and status',
                          '3', 'Explore a Metric', 'Dive into one metric',
                          '4', 'Ask AI About It', 'Analysis and advice from real-time data',
                          'Example: the pet'],
    'Poppins Font': ['Typography', 'Visual Design', 'p30-0', 'p30-1', 'p30-2', 'p30-3',
                     'Primary / ', 'Card / ', 'Background / ', 'Button / ',
                     'Regular', 'Medium', 'Semibold', 'Bold', 'Aa', 'Poppins Font'],
    'Test User 4': ['FEEDBACK', 'User Feedback',
                    'p32-0', 'Test User 1', '“A clean', '“This device',
                    'p32-1', 'Test User 2', '“Analysis tailored', '“With other',
                    'p32-2', 'Test User 3', '“I no longer', '“I used to',
                    'p32-3', 'Test User 4', '“At the vet', '“When the vet', '•••'],
    # Chinese slides (i18n/woowoof-slides-zh.html)
    '简单四步': ['简单四步', 'From Health Data to AI Insight', 'p18-0',
                '1', '首页查看', '核心健康数据', '2', '查看完整数据', '汇总各项',
                '3', '查看详细指标', '深入查看', '4', '根据当前数据询问AI', '基于实时数据', '以了解宠物'],
    '字体设计': ['Typography', '字体设计', 'p30-0', 'p30-1', 'p30-2', 'p30-3',
                'Primary / ', 'Card / ', 'Background / ', 'Button / ',
                'Regular', 'Medium', 'Semibold', 'Bold', 'Aa', 'Poppins Font'],
    '测试用户4': ['FEEDBACK', '用户的反馈',
                'p32-0', '测试用户1', '清晰简约', '“这个设备',
                'p32-1', '测试用户2', '可以直接针对', '“之前问其他',
                'p32-2', '测试用户3', '最大的变化', '“以前只知道',
                'p32-3', '测试用户4', '带她去医院', '“以前医生问', '•••'],
}

EL = re.compile(r'<(p|span|img|div|svg)\b([^>]*?)style="([^"]*--o:\s*-?\d+[^"]*)"')


def num(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def centre(e):
    x, w = e['x'], e['w']
    if 'c' in e['cls']:
        return x
    if 'r' in e['cls']:
        return x - w / 2
    return x + w / 2


ALIGN = {'c', 'l', 'r', 'sm', 'zh', 'reveal'}


def bottom(row):
    return max(e['y'] + e['h'] for e in row)


def kind(e):
    if 'fe-img' in e['cls']:
        return 'img'
    return ' '.join(sorted(c for c in e['cls'] if c not in ALIGN))


def order_slide(body):
    els = []
    for m in EL.finditer(body):
        attrs, style = m.group(2), m.group(3)
        cls = re.search(r'class="([^"]*)"', attrs)
        cls = cls.group(1).split() if cls else []
        v = dict(re.findall(r'--(\w+):\s*([^;]+)', style))
        tag = body[m.start():body.find('>', m.end())]
        src = re.search(r'src="([^"]*)"', tag)
        iw, ih = re.search(r'\swidth="(\d+)"', tag), re.search(r'\sheight="(\d+)"', tag)
        w = num(v.get('w'), 0)
        h = w * int(ih.group(1)) / int(iw.group(1)) if iw and ih and src else 0
        text = body[m.end():].split('>', 1)[-1].split('<', 1)[0].strip()
        els.append({'m': m, 'cls': cls, 'text': text, 'src': src.group(1) if src else '', 'o': int(v['o']), 'x': num(v.get('x')), 'y': num(v.get('y')),
                    'w': w, 'h': h, 'hidden': any(h in cls for h in HIDDEN) or 'x' not in v})
    seq = sorted(els, key=lambda e: e['o'])
    vis = [e for e in seq if not e['hidden']]
    # rows of visible elements
    rows = []
    for e in sorted(vis, key=lambda e: (e['y'], e['x'])):
        if rows and abs(rows[-1][0]['y'] - e['y']) <= ROW_TOL:
            rows[-1].append(e)
        else:
            rows.append([e])
    blocks, i, claimed, spans = [], 0, set(), {}
    while i < len(rows):
        row = rows[i]
        cents = sorted({round(centre(e)) for e in row})
        spacing = min((b - a for a, b in zip(cents, cents[1:])), default=0)

        def fits(e, cents):
            # a wide element (a section heading or paragraph) never belongs to one grid column
            return min(abs(centre(e) - c) for c in cents) <= COL_TOL and e['w'] <= 1.6 * spacing

        if len(row) < 2 or len(cents) < 2 or min(b - a for a, b in zip(cents, cents[1:])) < COL_TOL:
            i += 1
            continue
        block, j = [row], i + 1
        while j < len(rows):
            nxt = rows[j]
            if nxt[0]['y'] - bottom(block[-1]) > GAP_MAX:
                break
            if not all(fits(e, cents) for e in nxt):
                break
            block.append(nxt)
            j += 1
        # a header row just above (e.g. "After" / "Before") that sits on some of these columns
        prev = rows[i - 1] if i and not any(id(e) in claimed for e in rows[i - 1]) else None
        if prev and block[0][0]['y'] - bottom(prev) <= GAP_MAX and all(fits(e, cents) for e in prev):
            block.insert(0, prev)
        if len(block) >= 2:
            claimed.update(id(e) for r in block for e in r)
            cols = {c: [] for c in cents}
            for r in block:
                for e in r:
                    cols[min(cents, key=lambda c: abs(centre(e) - c))].append(e)
            # grid of cells (each row one kind: numbers, then labels) -> read down each column;
            # list of rows (each row icon + label) -> keep reading across each row
            def same(group):
                return len({kind(e) for e in group}) == 1
            by_row = sum(same(r) for r in block if len(r) > 1) / max(1, sum(len(r) > 1 for r in block))
            by_col = sum(same(c) for c in cols.values() if len(c) > 1) / max(1, sum(len(c) > 1 for c in cols.values()))
            if by_row >= by_col:
                blocks.append([e for c in cents for e in sorted(cols[c], key=lambda e: e['y'])])
            else:
                blocks.append([e for r in block for e in sorted(r, key=lambda e: e['x'])])
            spans[id(blocks[-1])] = spacing
            i = j
        else:
            i += 1
    tried = [m for m in OVERRIDES if m in body]
    for marker in tried:
        picked = []
        for want in OVERRIDES[marker]:
            hit = next((e for e in vis if e not in picked and (want in e['src'] if re.fullmatch(r'p\d\d-\d', want) else e['text'].startswith(want))), None)
            if not hit:
                break
            picked.append(hit)
        else:
            rest = [e for e in seq if e not in picked]
            return renumber(body, els, picked + rest), 1
    assert not tried, f'no override fits the slide marked {tried}'
    if not blocks:
        return body, 0
    owner = {id(e): b for b in blocks for e in b}
    out, done = [], set()
    for e in seq:
        if id(e) in done:
            continue
        b = owner.get(id(e))
        if b is None:
            out.append(e)
            done.add(id(e))
            continue
        # an intro paragraph still waiting that sits above the block and spans its columns is read first
        top = min(x['y'] for x in b)
        lo, hi = min(centre(x) for x in b) - COL_TOL, max(centre(x) for x in b) + COL_TOL
        for x in seq:
            if (id(x) not in done and id(x) not in owner and not x['hidden'] and 'fe-img' not in x['cls']
                    and x['w'] > 1.6 * spans[id(b)] and x['y'] < top - ROW_TOL and lo <= centre(x) <= hi):
                out.append(x)
                done.add(id(x))
        out.extend(b)
        done.update(id(x) for x in b)
    return renumber(body, els, out), len(blocks)


def renumber(body, els, out):
    new = {id(e): k for k, e in enumerate(out)}
    pieces, last = [], 0
    for e in els:
        m = e['m']
        st = re.sub(r'--o:\s*-?\d+', f'--o:{new[id(e)]}', m.group(3))
        pieces.append(body[last:m.start(3)] + st)
        last = m.end(3)
    pieces.append(body[last:])
    return ''.join(pieces)


def run(page):
    s = open(page, encoding='utf-8').read()
    total = 0

    def fix(m):
        nonlocal total
        body, n = order_slide(m.group(2))
        total += n
        return m.group(1) + body + m.group(3)

    s2 = re.sub(r'(<section class="slide fe"[^>]*>)(.*?)(</section>)', fix, s, flags=re.S)
    open(page, 'w', encoding='utf-8', newline='\n').write(s2)
    print(os.path.relpath(page, ROOT), 'reordered', total, 'grid blocks')


def main():
    for page in PAGES:
        run(page)


if __name__ == '__main__':
    main()
