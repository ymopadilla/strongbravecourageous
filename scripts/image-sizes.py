#!/usr/bin/env python3
"""Writes the delivery sizes of the logo, the mark, and the flowers from files already in src/images,
for when the 4000px master (SBC Drive folder, 01_Brand and logo) is not at hand.
scripts/logo-assets.py writes the same sizes and settings from the master; prefer it when the master is available.
Usage: python3 scripts/image-sizes.py        Needs Pillow 11.3 or newer (for AVIF).
"""
import os
from PIL import Image
IMG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'images')
full = Image.open(f'{IMG}/sbc-logo-1200.png').convert('RGBA')   # lossless copy of the full logo
mark = Image.open(f'{IMG}/sbc-mark-512.png').convert('RGBA')    # lossless copy of the simplified mark

# Homepage opening: AVIF first, WebP as the fallback (the <picture> in src/pages/index.html lists both).
for s in (300, 480, 600, 720, 900):
    r = full.resize((s, s), Image.LANCZOS)
    r.save(f'{IMG}/sbc-logo-{s}.avif', quality=64, speed=0)
    r.save(f'{IMG}/sbc-logo-{s}.webp', quality=80, method=6)
mark.resize((96, 96), Image.LANCZOS).save(f'{IMG}/sbc-mark-96.webp', quality=88, method=6)

def fit(im, width):
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
for name, widths in (('flower-sprig', (240, 320)), ('flower-cluster', (96, 192, 288)), ('flower-blossom', (72,))):
    im = Image.open(f'{IMG}/{name}.webp').convert('RGBA')
    for w in widths:
        fit(im, w).save(f'{IMG}/{name}-{w}.webp', quality=84, method=6)
print('done')
