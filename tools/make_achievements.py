"""Achievement art for Game Center (1024x1024 RGB PNG). Run from repo root."""
from PIL import Image, ImageDraw, ImageFont
import glob, math
F = glob.glob('/usr/share/fonts/truetype/sand-box/google/Fraunces/Fraunces-VariableFont*.ttf')[0]
ITEMS = [('firstbirdie', 'BIRDIE', '-1', (30, 127, 134)), ('eagle', 'EAGLE', '-2', (196, 150, 60)), ('holeinone', 'ACE', '1', (214, 80, 70)), ('breakpar', 'UNDER', '<', (70, 128, 70))]
for slug, label, sym, col in ITEMS:
    W = 1024; im = Image.new('RGB', (W, W), (11, 38, 48)); d = ImageDraw.Draw(im)
    for r in range(480, 0, -4):
        t = r / 480; c = tuple(int(col[i] * (1 - t) * 0.9 + (11, 38, 48)[i] * t) for i in range(3)); d.ellipse([W/2 - r, W/2 - r, W/2 + r, W/2 + r], fill=c)
    d.ellipse([W/2 - 330, W/2 - 330, W/2 + 330, W/2 + 330], outline=(255, 207, 90), width=18)
    big = ImageFont.truetype(F, 360); sm = ImageFont.truetype(F, 80)
    bb = d.textbbox((0, 0), sym, font=big); d.text((W/2 - (bb[2]-bb[0])/2 - bb[0], W/2 - 150 - bb[1]), sym, font=big, fill=(255, 255, 255))
    bb = d.textbbox((0, 0), label, font=sm); d.text((W/2 - (bb[2]-bb[0])/2 - bb[0], W/2 + 150), label, font=sm, fill=(255, 207, 90))
    im.save(f'docs/gamecenter/achievement-{slug}.png')
print('ok')
