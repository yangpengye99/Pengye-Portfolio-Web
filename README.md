# Pengye Yang — Portfolio 2026

English, web version of the 2026 Chinese PDF portfolio. Black, Apple-like, frosted-glass UI.

## Run locally
```
python tools/dev_server.py 5190
```
Open http://localhost:5190 (the server mimics Vercel clean URLs, e.g. `/work/bola`).

## Structure
- `index.html` — cover, about, experience, UI overview, projects, other work, contact
- `work/woowoof.html`, `work/bola.html`, `work/hyped.html` — case studies
- `assets/css/main.css` — design tokens + components
- `assets/js/main.js` — scroll reveals, nav state, marquee, cover parallax, copy email
- `assets/img/` — WebP assets cut from the PDF (see docs/engineering/assets.md)

## Deploy
Push to `main`; Vercel (project `pengye-portfolio-web`) serves the repo root as static files.
