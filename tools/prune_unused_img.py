"""Delete images in assets/img that no page or stylesheet references."""
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
text = "".join(open(f, encoding="utf-8").read() for f in ["index.html", "assets/css/main.css"] + glob.glob("work/*.html"))
used = set(re.findall(r"assets/img/([^\"')\s]+)", text)) | set(re.findall(r"\.\./img/([^\"')\s]+)", text))
removed = []
for f in glob.glob("assets/img/**/*.*", recursive=True):
    rel = os.path.relpath(f, "assets/img").replace(os.sep, "/")
    if rel not in used:
        os.remove(f)
        removed.append(rel)
for d in glob.glob("assets/img/*/"):
    if not os.listdir(d):
        os.rmdir(d)
print(len(removed), "removed:", ", ".join(sorted(removed)))
