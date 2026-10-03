#!/usr/bin/env python3
"""Regenerates every logo file from the 4000px master (kept in the SBC Drive folder, 01_Brand and logo).
Usage: python3 scripts/logo-assets.py /path/to/Strong_Brave_Courageous_4000px.png
Needs Pillow. Writes: full logo (homepage opening, feed, share image), the simplified mark
(header, footer, favicons), and src/images/og-image.jpg.
"""
import sys, os, re
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'src', 'images'); SRC = os.path.join(ROOT, 'src')
master = Image.open(sys.argv[1]).convert('RGBA')
assert master.size == (4000, 4000)
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
for s in (280, 560, 840, 1120): save(full, s, f'{IMG}/sbc-logo-{s}.webp', quality=86, method=6)
for s in (64, 128, 256): save(mark, s, f'{IMG}/sbc-mark-{s}.webp', quality=88, method=6)
save(mark, 512, f'{IMG}/sbc-mark-512.png', optimize=True)

def on_paper(im, size):
    bg = Image.new('RGBA', (size, size), PAPER + (255,)); m = im.resize((size, size), Image.LANCZOS); bg.alpha_composite(m); return bg.convert('RGB')
save(mark, 16, f'{SRC}/sbc-logo-16.png'); save(mark, 32, f'{SRC}/sbc-logo-32.png'); save(mark, 48, f'{SRC}/favicon-48.png')
save(mark, 32, f'{SRC}/favicon.png')
mark.resize((256, 256), Image.LANCZOS).save(f'{SRC}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
on_paper(mark, 180).save(f'{SRC}/apple-touch-icon.png')
save(mark, 192, f'{SRC}/icon-192.png'); save(mark, 512, f'{SRC}/icon-512.png')

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
