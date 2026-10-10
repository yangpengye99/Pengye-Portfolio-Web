"""Create an .avif next to every .webp in assets/img (max 2000px wide). WebP stays as fallback."""
import glob
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
before = after = 0
for f in glob.glob(os.path.join(ROOT, 'assets', 'img', '**', '*.webp'), recursive=True):
    out = f[:-5] + '.avif'
    im = Image.open(f)
    if im.width > 2000:
        im = im.resize((2000, round(im.height * 2000 / im.width)), Image.LANCZOS)
    im.save(out, 'AVIF', quality=62, speed=6)
    before += os.path.getsize(f)
    after += os.path.getsize(out)
print(f'webp {before // 1024} KB -> avif {after // 1024} KB')
