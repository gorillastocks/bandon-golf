"""Generate Abandoned Dunes app icon + splash with Pillow (no alpha in icon). Run from repo root: python3 tools/make_icons.py"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, glob

S = 2048  # supersample, downscale to 1024
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def scene(size, with_text=False):
    W = size
    im = Image.new('RGB', (W, W))
    px = ImageDraw.Draw(im)
    top, mid, bot = (14, 42, 51), (30, 127, 134), (241, 190, 120)
    for y in range(W):
        t = y / W
        c = lerp(top, mid, t / 0.55) if t < 0.55 else lerp(mid, bot, (t - 0.55) / 0.45)
        px.line([(0, y), (W, y)], fill=c)
    # sun glow
    glow = Image.new('RGB', (W, W), (0, 0, 0)); g = ImageDraw.Draw(glow)
    g.ellipse([W*0.58, W*0.22, W*0.86, W*0.50], fill=(255, 207, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.05))
    im = Image.blend(im, Image.eval(Image.merge('RGB', [Image.eval(c, lambda v: v) for c in im.split()]), lambda v: v), 0)
    from PIL import ImageChops
    im = ImageChops.add(im, glow.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(im)
    # dunes (layered sine ridges)
    def ridge(base, amp, freq, ph, col):
        pts = [(0, W)]
        for x in range(0, W + 8, 8):
            pts.append((x, base + amp * math.sin(x / W * freq * math.pi + ph) + amp * .35 * math.sin(x / W * freq * 2.3 * math.pi + ph * 1.7)))
        pts.append((W, W)); d.polygon(pts, fill=col)
    ridge(W*0.60, W*0.035, 2.0, 0.6, (196, 150, 96))
    ridge(W*0.69, W*0.04, 1.6, 2.2, (222, 182, 120))
    ridge(W*0.80, W*0.03, 2.4, 4.0, (92, 150, 84))  # green fairway strip
    ridge(W*0.88, W*0.025, 1.3, 1.0, (70, 128, 70))
    # flag
    px_, py_ = W*0.36, W*0.80
    d.rectangle([px_ - W*0.006, W*0.28, px_ + W*0.006, py_], fill=(245, 245, 240))
    d.polygon([(px_ + W*0.006, W*0.28), (px_ + W*0.20, W*0.35), (px_ + W*0.006, W*0.42)], fill=(255, 107, 94))
    # hole + ball
    d.ellipse([px_ - W*0.05, py_ - W*0.010, px_ + W*0.05, py_ + W*0.012], fill=(30, 50, 40))
    bx, by, r = W*0.60, W*0.84, W*0.035
    d.ellipse([bx - r*1.2, by + r*0.6, bx + r*1.2, by + r*1.1], fill=(50, 90, 55))
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=(250, 250, 250))
    return im

def font(sz):
    for f in glob.glob('/usr/share/fonts/truetype/sand-box/google/Fraunces/Fraunces-VariableFont*.ttf'):
        ft = ImageFont.truetype(f, sz)
        try: ft.set_variation_by_axes([144, 0, 0, 800]) if False else None
        except Exception: pass
        return ft
    return ImageFont.load_default()

icon = scene(S)
icon = icon.resize((1024, 1024), Image.LANCZOS).convert('RGB')  # RGB => no alpha channel
icon.save('resources/icon-1024.png')
for n, sz in [('icon-512', 512), ('icon-192', 192), ('apple-touch-icon', 180)]:
    icon.resize((sz, sz), Image.LANCZOS).save(f'icons/{n}.png')
icon.resize((1024, 1024)).save('icons/icon-1024.png')

# splash: deep teal, centred icon-art + wordmark
W = 2732
sp = Image.new('RGB', (W, W), (11, 38, 48))
# keep everything inside the central ~1100px square so aspect-fill crops on phones (portrait) and wide screens never clip it
art = icon.resize((620, 620), Image.LANCZOS)
mask = Image.new('L', (620, 620), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, 619, 619], radius=140, fill=255)
sp.paste(art, ((W - 620)//2, W//2 - 480), mask)
d = ImageDraw.Draw(sp)
f = font(108)
t1 = 'Abandoned Dunes'
bb = d.textbbox((0, 0), t1, font=f)
d.text(((W - (bb[2]-bb[0]))//2, W//2 + 170), t1, font=f, fill=(238, 246, 244))
f2 = font(40); t2 = 'FIRST-PERSON SLINGSHOT GOLF'
bb = d.textbbox((0, 0), t2, font=f2)
d.text(((W - (bb[2]-bb[0]))//2, W//2 + 330), t2, font=f2, fill=(255, 207, 90))
sp.save('resources/splash-2732.png')
print('ok', icon.mode, icon.size)
