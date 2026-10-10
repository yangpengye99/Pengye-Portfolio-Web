# Pengye-Portfolio-Web — agent notes

- Static site (plain HTML/CSS/JS, no build). Deployed by Vercel from `main` of
  `github.com/yangpengye99/Pengye-Portfolio-Web` to www.pengye-yang.com.
- Read `docs/design/ui-implementation-playbook.md` before changing UI.
- Source of truth for content: `E:\工作\找工作\2026 杨朋烨作品集.pdf` (Chinese). The site is the English version.
- All visible copy must be English. Chinese only survives inside product screenshots of the
  RED Vibe Coding entries (those apps are Chinese-language products).
- Buttons have no strokes. Use tokens in `assets/css/main.css`.
- After regenerating images run `python tools/fix_img_dims.py`.
- Never push to `main` without the owner's approval — it deploys the live domain.
