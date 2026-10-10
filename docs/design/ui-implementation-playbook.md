# UI implementation playbook

Visual source: the 2026 PDF portfolio (61 pages, 1920x1080).

## Tokens (assets/css/main.css :root)
- Background pure black `#000`; text `#f5f5f7` / `#a1a1a6` / `#6e6e73`.
- Headlines: Poppins 600–700 with the PDF's white→grey gradient (`.grad`).
- Cover / Thank-you: Playfair Display 900 (the PDF's serif "PORTFOLIO").
- Handwritten tags: Caveat. Signature "2026 Portfolio": Mrs Saint Delafield.
- Accents per case study: WooWoof teal `#54D4CD`, Bola lime `#D5E36D`, HYPED violet `#5C4EFF`.
- Radii: 36 / 28 / 20 / 14px; pills 999px.

## Components
- `.glass`, `.glass-slab` — frosted glass (backdrop-filter) with inner highlight, no outline.
- `.pill-glow` — the PDF's black glowing pills used in diagrams.
- `.folder` — glass folder cards from PDF p.4 (mask: `assets/img/ui/folder-mask.svg`).
- `.phone` — CSS iPhone frame; put a raw screen image inside. Add `.flat` when the image already has a frame.
- `.btn-primary`, `.btn-glass` — no strokes, by design.
- `.reveal` / `.reveal-scale` — scroll-in motion (respects reduced motion).
- `.stack-m` / `.two-m` — force inline-styled grids to 1 / 2 columns under 860px.
