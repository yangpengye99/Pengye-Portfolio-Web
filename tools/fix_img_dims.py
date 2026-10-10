"""Sync <img width/height> attributes with the real asset sizes (run after regenerating images)."""
import glob
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = re.compile(r'<img\b[^>]*?src="(/assets/img/[^"]+)"[^>]*>')


def fix(tag, src):
    path = os.path.join(ROOT, src.lstrip("/"))
    if not os.path.exists(path):
        print("missing", src)
        return tag
    w, h = Image.open(path).size
    tag = re.sub(r'\swidth="\d+"', f' width="{w}"', tag)
    tag = re.sub(r'\sheight="\d+"', f' height="{h}"', tag)
    return tag


for f in glob.glob(os.path.join(ROOT, "*.html")) + glob.glob(os.path.join(ROOT, "work", "*.html")):
    s = open(f, encoding="utf-8").read()
    n = TAG.sub(lambda m: fix(m.group(0), m.group(1)), s)
    if n != s:
        open(f, "w", encoding="utf-8", newline="\n").write(n)
        print("updated", os.path.relpath(f, ROOT))
