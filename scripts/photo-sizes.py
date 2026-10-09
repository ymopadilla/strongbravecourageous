#!/usr/bin/env python3
"""Writes the published sizes of the family photos from the copies kept in originals/photos/ (not published).
Usage: python3 scripts/photo-sizes.py        Needs Pillow 11.3 or newer (for AVIF).
For each originals/photos/<name>.jpg it writes src/images/photos/<name>-<width>.avif and .webp at the widths
below (never wider than the original), and src/images/photos/photos.json with each photo's size and widths.
Every published file is written from pixels only: no EXIF (so no location), no XMP, no ICC profile, no comment.
Captions and alt text live in build.js (PHOTOS); the photos came from Becky's Edits.docx, Oct 8, 2026.
"""
import json, os
from PIL import Image, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'originals', 'photos'); OUT = os.path.join(ROOT, 'src', 'images', 'photos')
WIDTHS = (240, 320, 480, 640, 800, 1024)
os.makedirs(OUT, exist_ok=True)
info = {}
for f in sorted(os.listdir(SRC)):
    if not f.lower().endswith('.jpg'): continue
    name = f[:-4]
    im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, f))).convert('RGB')
    clean = Image.new('RGB', im.size); clean.paste(im)          # a fresh image carries no metadata at all
    W, H = clean.size
    widths = [w for w in WIDTHS if w < W] + [W]
    for w in widths:
        r = clean if w == W else clean.resize((w, round(H * w / W)), Image.LANCZOS)
        r.save(os.path.join(OUT, f'{name}-{w}.avif'), quality=60, speed=4)
        r.save(os.path.join(OUT, f'{name}-{w}.webp'), quality=80, method=6)
    info[name] = {'width': W, 'height': H, 'widths': widths}
with open(os.path.join(OUT, 'photos.json'), 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(info, fh, indent=2); fh.write('\n')
print('photos written:', ', '.join(f'{k} {v["width"]}x{v["height"]}' for k, v in info.items()))
