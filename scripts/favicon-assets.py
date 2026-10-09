#!/usr/bin/env python3
"""Writes every favicon from the blossom (src/images/flower-blossom.webp, the pink wildflower cut from the logo),
centered on the site's paper color. Decided by Yvonne on Oct 6, 2026: the simplified mark keeps the scene and
the script lettering and cannot be read at 16 px.
Usage: python3 scripts/favicon-assets.py        Needs Pillow.
Writes into src/: favicon.ico (16, 32, 48), sbc-logo-16.png, sbc-logo-32.png, favicon.png (32), favicon-48.png,
apple-touch-icon.png (180), icon-192.png, icon-512.png. File names are unchanged, so no page markup changes.
The header mark, the homepage logo, and the share image are not touched.
"""
import os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
PAPER = (255, 253, 250, 255)   # --paper in styles.css
# Prefer the lossless full-size cut written by scripts/logo-assets.py; fall back to the published 120px blossom.
CUT = os.path.join(ROOT, 'originals', 'logo', 'flower-blossom-cut.png')
blossom = Image.open(CUT if os.path.exists(CUT) else os.path.join(SRC, 'images', 'flower-blossom.webp')).convert('RGBA')
# Keep only the flower itself: drop any stray specks left around it by the cut from the logo.
px = blossom.load(); W, H = blossom.size; seen = set(); best = []
for y0 in range(H):
    for x0 in range(W):
        if (x0, y0) in seen or px[x0, y0][3] < 40: continue
        blob, stack = [], [(x0, y0)]; seen.add((x0, y0))
        while stack:
            x, y = stack.pop(); blob.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and px[nx, ny][3] >= 40:
                    seen.add((nx, ny)); stack.append((nx, ny))
        if len(blob) > len(best): best = blob
keep = set(best)
for y in range(H):
    for x in range(W):
        if (x, y) not in keep and not any((x + dx, y + dy) in keep for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            px[x, y] = px[x, y][:3] + (0,)
blossom = blossom.crop(blossom.getbbox())

def icon(size, fill):
    """Blossom centered on a paper square. `fill` is the share of the square the blossom's longer side takes."""
    box = max(1, round(size * fill))
    scale = box / max(blossom.size)
    w, h = max(1, round(blossom.width * scale)), max(1, round(blossom.height * scale))
    im = Image.new('RGBA', (size, size), PAPER)
    im.alpha_composite(blossom.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return im.convert('RGB')

# Small sizes fill more of the square so the petals stay readable; large sizes get more breathing room.
i16, i32, i48 = icon(16, 0.88), icon(32, 0.84), icon(48, 0.82)
i16.save(f'{SRC}/sbc-logo-16.png'); i32.save(f'{SRC}/sbc-logo-32.png'); i32.save(f'{SRC}/favicon.png'); i48.save(f'{SRC}/favicon-48.png')
i48.save(f'{SRC}/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[i16, i32])
icon(180, 0.70).save(f'{SRC}/apple-touch-icon.png')
icon(192, 0.72).save(f'{SRC}/icon-192.png'); icon(512, 0.72).save(f'{SRC}/icon-512.png')
print('favicons written')
