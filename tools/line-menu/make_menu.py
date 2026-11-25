"""Kring LINE rich menu image, 2500x1686, 3x2 grid. Bangkok skyline at dusk + blue/pink Kring rings."""
import math
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

W, H = 2500, 1686
S = 2  # supersample for crisp vector shapes
BLUE = (91, 108, 255)
PINK = (255, 79, 163)
WHITE = (255, 255, 255)
FONT = '/root/.fonts/Kanit-Medium.ttf'

src = sys.argv[1]
out = sys.argv[2]

# ---- background: skyline, cover-fit, darkened, soft blur
bg = Image.open(src).convert('RGB')
sc = max(W / bg.width, H / bg.height)
bg = bg.resize((math.ceil(bg.width * sc), math.ceil(bg.height * sc)), Image.LANCZOS)
ox = (bg.width - W) // 2
oy = (bg.height - H) // 2
bg = bg.crop((ox, oy, ox + W, oy + H)).filter(ImageFilter.GaussianBlur(6))
bg = ImageEnhance.Color(bg).enhance(1.15)
# night overlay: deep violet-black, darker toward the bottom so labels read
ov = Image.new('RGBA', (W, H))
od = ImageDraw.Draw(ov)
for y in range(H):
    a = int(95 + 80 * (y / H))
    od.line([(0, y), (W, y)], fill=(9, 7, 20, a))
bg = Image.alpha_composite(bg.convert('RGBA'), ov)

# ---- vector layer at 2x
L = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
d = ImageDraw.Draw(L)

# hairline cell dividers (very faint, no boxes)
for cx in (1, 2):
    x = int(W * cx / 3) * S
    d.line([(x, 120 * S), (x, H * S - 120 * S)], fill=(255, 255, 255, 34), width=2 * S)
y = (H // 2) * S
for c in range(3):
    x0 = int(W * c / 3) * S + 110 * S
    x1 = int(W * (c + 1) / 3) * S - 110 * S
    d.line([(x0, y), (x1, y)], fill=(255, 255, 255, 34), width=2 * S)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def grad_ring(cx, cy, r, w):
    """Ring stroke with a blue->pink sweep (left->right)."""
    m = Image.new('L', L.size, 0)
    md = ImageDraw.Draw(m)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=w)
    g = Image.new('RGBA', L.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for x in range(cx - r - 2, cx + r + 3):
        t = (x - (cx - r)) / (2 * r)
        gd.line([(x, cy - r - 2), (x, cy + r + 2)], fill=lerp(BLUE, PINK, max(0, min(1, t))) + (255,))
    L.paste(g, (0, 0), m)
    # faint fill so the icon sits on a calm disc
    d.ellipse([cx - r + w, cy - r + w, cx + r - w, cy + r - w], fill=(255, 255, 255, 18))


lw = 14 * S  # icon line width


def icon_rings(cx, cy, k):  # My Rings: two linked rings
    r = 62 * k
    d.ellipse([cx - 40 * k - r, cy - r, cx - 40 * k + r, cy + r], outline=WHITE, width=lw)
    d.ellipse([cx + 40 * k - r, cy - r, cx + 40 * k + r, cy + r], outline=PINK + (255,), width=lw)


def icon_board(cx, cy, k):  # podium bars
    bw = 46 * k
    base = cy + 70 * k
    for dx, h, col in ((-62, 90, WHITE), (0, 140, PINK), (62, 60, WHITE)):
        x = cx + dx * k
        d.rounded_rectangle([x - bw / 2, base - h * k, x + bw / 2, base], radius=10 * k, fill=col + (255,) if len(col) == 3 else col)
    # small crown dot above the middle bar
    d.ellipse([cx - 14 * k, base - 140 * k - 46 * k, cx + 14 * k, base - 140 * k - 18 * k], fill=(255, 211, 107, 255))


def icon_question(cx, cy, k):  # speech bubble with "?"
    d.rounded_rectangle([cx - 92 * k, cy - 74 * k, cx + 92 * k, cy + 50 * k], radius=36 * k, outline=WHITE, width=lw)
    d.polygon([(cx - 40 * k, cy + 44 * k), (cx - 70 * k, cy + 92 * k), (cx - 8 * k, cy + 44 * k)], fill=WHITE)
    f = ImageFont.truetype(FONT, int(112 * k))
    d.text((cx, cy - 10 * k), '?', font=f, fill=PINK + (255,), anchor='mm')


def icon_vote(cx, cy, k):  # A | B split card
    d.rounded_rectangle([cx - 96 * k, cy - 66 * k, cx - 10 * k, cy + 66 * k], radius=22 * k, fill=BLUE + (255,))
    d.rounded_rectangle([cx + 10 * k, cy - 66 * k, cx + 96 * k, cy + 66 * k], radius=22 * k, fill=PINK + (255,))
    f = ImageFont.truetype('/root/.fonts/Kanit-SemiBold.ttf', int(76 * k))
    d.text((cx - 53 * k, cy - 4 * k), 'A', font=f, fill=WHITE, anchor='mm')
    d.text((cx + 53 * k, cy - 4 * k), 'B', font=f, fill=WHITE, anchor='mm')


def icon_open(cx, cy, k):  # phone with play triangle (Reels app)
    d.rounded_rectangle([cx - 56 * k, cy - 96 * k, cx + 56 * k, cy + 96 * k], radius=24 * k, outline=WHITE, width=lw)
    d.polygon([(cx - 20 * k, cy - 34 * k), (cx - 20 * k, cy + 34 * k), (cx + 34 * k, cy)], fill=PINK + (255,))


def icon_help(cx, cy, k):  # chat bubble with three dots
    d.rounded_rectangle([cx - 96 * k, cy - 70 * k, cx + 96 * k, cy + 52 * k], radius=52 * k, outline=WHITE, width=lw)
    d.polygon([(cx + 30 * k, cy + 46 * k), (cx + 72 * k, cy + 96 * k), (cx + 64 * k, cy + 40 * k)], fill=WHITE)
    for i, col in enumerate((BLUE, (175, 100, 230), PINK)):
        x = cx + (i - 1) * 50 * k
        d.ellipse([x - 15 * k, cy - 24 * k, x + 15 * k, cy + 6 * k], fill=col + (255,))


cells = [
    ('คะแนนของฉัน', icon_rings),
    ('อันดับสัปดาห์นี้', icon_board),
    ('คำถามวันนี้', icon_question),
    ('โหวตวันนี้', icon_vote),
    ('เปิดกริ๊ง', icon_open),
    ('ติดต่อทีมงาน', icon_help),
]
font = ImageFont.truetype(FONT, 86 * S)
for i, (label, icon) in enumerate(cells):
    col, row = i % 3, i // 3
    cx = int((W * col / 3 + W * (col + 1) / 3) / 2) * S
    top = (H // 2) * row * S
    cy = top + 330 * S
    grad_ring(cx, cy, 190 * S, 12 * S)
    icon(cx, cy, S * 1.05)
    # label with a soft shadow for legibility
    sh = Image.new('RGBA', L.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((cx, top + 660 * S), label, font=font, fill=(0, 0, 0, 170), anchor='mm')
    sh = sh.filter(ImageFilter.GaussianBlur(10 * S))
    L.alpha_composite(sh)
    d.text((cx, top + 660 * S), label, font=font, fill=WHITE, anchor='mm')

L = L.resize((W, H), Image.LANCZOS)
img = Image.alpha_composite(bg, L).convert('RGB')
img.save(out, 'PNG', optimize=True)
print(out, img.size)
