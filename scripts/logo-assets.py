#!/usr/bin/env python3
"""Regenerates every logo file from the 4000px master (kept in the SBC Drive folder, 01_Brand and logo).
Usage: python3 scripts/logo-assets.py /path/to/Strong_Brave_Courageous_4000px.png
Needs Pillow 11.3 or newer (for AVIF). Writes: full logo (homepage opening, feed, share image), the simplified mark
(header, footer), and src/images/og-image.jpg. Favicons: scripts/favicon-assets.py.
"""
import sys, os, re
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'src', 'images'); SRC = os.path.join(ROOT, 'src')
master = Image.open(sys.argv[1]).convert('RGBA')
assert master.width == master.height, 'the master must be square'
# Every position below is measured on a 4000px master. A square master of another size (since Oct 8, 2026: the
# 2048px AI upscale in originals/logo/) is first resized to 4000px, so the same positions apply.
if master.size != (4000, 4000):
    master = master.resize((4000, 4000), Image.LANCZOS)
CX, CY, R = 1982, 1959, 1946          # centre and radius of the outer rose ring in the master
WHITE = (254, 254, 255, 255)
PAPER = (255, 253, 250)

def circle_crop(im):
    sq = im.crop((CX - R, CY - R, CX + R, CY + R))
    S = 4; big = Image.new('L', (sq.width // 2 * 1, sq.height // 2 * 1), 0)
    mask = Image.new('L', sq.size, 0); ImageDraw.Draw(mask).ellipse((2, 2, sq.width - 3, sq.height - 3), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5)); sq.putalpha(mask); return sq

def make_mark(im):
    """Simplified mark: same artwork with the small text removed (BLOG line, the description,
    and the words around the lower ring). The leaf-and-heart sprig moves up under the name."""
    im = im.copy(); d = ImageDraw.Draw(im)
    sprig = im.crop((1340, 3290, 2640, 3640))
    smask = Image.new('L', sprig.size, 0)
    ImageDraw.Draw(smask).ellipse((0, 10, sprig.width, 330), fill=255)   # keeps the ring words out of the copy
    smask = smask.filter(ImageFilter.GaussianBlur(6))
    # words around the lower ring: an annulus between the artwork and the thin inner ring
    ring = Image.new('L', im.size, 0); rd = ImageDraw.Draw(ring)
    rd.ellipse((CX-1815, CY-1815, CX+1815, CY+1815), fill=255)
    rd.ellipse((CX-1450, CY-1450, CX+1450, CY+1450), fill=0)
    rd.rectangle((0, 0, 4000, 3000), fill=0)
    im.paste(WHITE, (0, 0), ring)
    d.rectangle((860, 2780, 3140, 3400), fill=WHITE)   # BLOG and the description
    d.ellipse((CX-1460, CY-1460, CX+1460, CY+1460 ), fill=None)
    low = Image.new('L', im.size, 0); ld = ImageDraw.Draw(low)
    ld.ellipse((CX-1500, CY-1500, CX+1500, CY+1500), fill=255); ld.rectangle((0, 0, 4000, 3250), fill=0)
    im.paste(WHITE, (0, 0), low)                       # old sprig position
    im.paste(sprig, (1332, 3010), smask)
    return im

full = circle_crop(master)
mark = circle_crop(make_mark(master))

def save(im, size, path, **kw):
    out = im.resize((size, size), Image.LANCZOS); out.save(path, **kw); return out

save(full, 1200, f'{IMG}/sbc-logo-1200.png', optimize=True)
for s in (512, 256, 128): save(full, s, f'{IMG}/sbc-logo-{s}.png', optimize=True)
# Homepage opening: AVIF first, WebP as the fallback (the <picture> in src/pages/index.html lists both).
for s in (300, 480, 600, 720, 900):
    save(full, s, f'{IMG}/sbc-logo-{s}.avif', quality=64, speed=4); save(full, s, f'{IMG}/sbc-logo-{s}.webp', quality=80, method=6)
for s in (64, 96, 128, 256): save(mark, s, f'{IMG}/sbc-mark-{s}.webp', quality=88, method=6)
save(mark, 512, f'{IMG}/sbc-mark-512.png', optimize=True)

def on_paper(im, size):
    bg = Image.new('RGBA', (size, size), PAPER + (255,)); m = im.resize((size, size), Image.LANCZOS); bg.alpha_composite(m); return bg.convert('RGB')
# Favicons are no longer written here. Since Oct 6, 2026 they come from the blossom: run scripts/favicon-assets.py
# after this script (it reads originals/logo/flower-blossom-cut.png, written at the end of this script).

# Share image 1200x630: blue field, framed full logo, the homepage ridge.
W, H, S = 1200, 630, 2
og = Image.new('RGB', (W * S, H * S), (0x4A, 0x75, 0x90)); d = ImageDraw.Draw(og)
svg = open(os.path.join(SRC, 'pages', 'index.html'), encoding='utf-8').read()
ridge = re.search(r'<svg class="ridge".*?</svg>', svg, re.S).group(0)
for fill, path in re.findall(r'<path fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"', ridge):
    pts = [(float(x) / 1440 * W * S, (H - 140 + float(y)) * S) for x, y in re.findall(r'[ML]\s*([\d.]+)\s+([\d.]+)', path)]
    d.polygon(pts, fill=fill)
D = 420; cx, cy = W // 2, 252
d.ellipse(((cx - D/2 - 12) * S, (cy - D/2 - 12) * S, (cx + D/2 + 12) * S, (cy + D/2 + 12) * S), fill=(0xB4, 0x50, 0x5B))
d.ellipse(((cx - D/2 - 5) * S, (cy - D/2 - 5) * S, (cx + D/2 + 5) * S, (cy + D/2 + 5) * S), fill=PAPER)
lg = full.resize((D * S, D * S), Image.LANCZOS); og.paste(lg, (int((cx - D/2) * S), int((cy - D/2) * S)), lg)
og.resize((W, H), Image.LANCZOS).save(f'{IMG}/og-image.jpg', quality=88, optimize=True, progressive=True)
print('done')

# ---------- Flowers cut from the logo (decorations; see README "Flowers") ----------
import numpy as np
RGBm = master.convert('RGB')

def key_white(region, poly=None, thresh=244, drop_grey=False, max_r=None):
    """Cut a piece of the artwork off its white background: near-white pixels connected to the
    edge of the piece become transparent; whites enclosed by the drawing (petals) stay."""
    x0, y0, x1, y1 = region
    im = RGBm.crop(region); w, h = im.size
    a = np.array(im).astype(int)
    white = a.min(axis=2) >= thresh
    inside = np.ones((h, w), bool)
    if poly:
        pm = Image.new('L', (w, h), 0); ImageDraw.Draw(pm).polygon([(x - x0, y - y0) for x, y in poly], fill=255)
        inside = np.array(pm) > 0
    if max_r:   # stay inside the logo's thin inner ring
        yy, xx = np.mgrid[y0:y1, x0:x1]; inside &= ((xx - CX) ** 2 + (yy - CY) ** 2) < max_r ** 2
    if drop_grey:   # the rock behind the flowers: low-colour, mid-brightness pixels
        sat = a.max(axis=2) - a.min(axis=2); lum = a.mean(axis=2)
        grey = (sat < 34) & (lum > 95)
        white = white | np.array(Image.fromarray((grey * 255).astype('uint8')).filter(ImageFilter.MedianFilter(5))) .astype(bool)
    passable = white | ~inside
    seen = np.zeros((h, w), bool); stack = [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not passable[y, x]: continue
        seen[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    alpha = Image.fromarray((~seen * 255).astype('uint8')).filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.MinFilter(11)).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1.6))
    out = im.convert('RGBA'); out.putalpha(alpha)
    return out.crop(out.getbbox())

def fit(im, width):
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)

# leaf-and-heart sprig (sits on white under the description)
sprig = key_white((1340, 3290, 2640, 3640), poly=[(1340, 3440), (1500, 3310), (2500, 3310), (2640, 3440), (2500, 3610), (2250, 3640), (1750, 3640), (1500, 3610)])
fit(sprig, 480).save(f'{IMG}/flower-sprig.webp', quality=88, method=6)
for w in (240, 320): fit(sprig, w).save(f'{IMG}/flower-sprig-{w}.webp', quality=84, method=6)   # smaller copies for srcset
# blossom cluster (the wildflowers and fern at the foot of the rock, lower left)
V = lambda x, y: (round(100 + x * 4 / 3), round(1800 + y * 4 / 3))
cluster = key_white((120, 1840, 980, 3000), poly=[V(*p) for p in [(40, 175), (120, 140), (215, 135), (245, 225), (335, 290), (350, 395), (430, 440), (560, 520), (625, 600), (560, 880), (60, 700)]], drop_grey=True, max_r=1800)
fit(cluster, 420).save(f'{IMG}/flower-cluster.webp', quality=88, method=6)
for w in (96, 192, 288): fit(cluster, w).save(f'{IMG}/flower-cluster-{w}.webp', quality=84, method=6)
# single blossom (the pink flower below the white one): keep only its pink and gold
cx, cy = (round(2880 + 522 * 4 / 3), round(1200 + 572 * 4 / 3)); r = 135
b = RGBm.crop((cx - r, cy - r, cx + r, cy + r)); a = np.array(b).astype(int)
yy, xx = np.mgrid[0:2 * r, 0:2 * r]
keep = ((a[..., 0] > a[..., 1] + 22) & (a[..., 0] > 150)) & ((xx - r) ** 2 + (yy - r) ** 2 < (r - 4) ** 2)
k = Image.fromarray((keep * 255).astype('uint8')).filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.MaxFilter(9))
filled = k.copy(); ImageDraw.floodfill(filled, (0, 0), 128)             # outside becomes 128; holes stay 0
al = filled.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(1.5))
b = b.convert('RGBA'); b.putalpha(al); b = b.crop(b.getbbox())
fit(b, 120).save(f'{IMG}/flower-blossom.webp', quality=90, method=6)
fit(b, 72).save(f'{IMG}/flower-blossom-72.webp', quality=84, method=6)
# The blossom at full size, lossless, for scripts/favicon-assets.py (not published).
os.makedirs(os.path.join(ROOT, 'originals', 'logo'), exist_ok=True)
b.save(os.path.join(ROOT, 'originals', 'logo', 'flower-blossom-cut.png'))
print('flowers', sprig.size, cluster.size, b.size)
