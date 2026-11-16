"""Android launcher icons and splash for mobile/android from the same starburst as tools/make_icon.py.

Writes, under mobile/android/app/src/main/res:
  mipmap-*/ic_launcher.png, ic_launcher_round.png   (legacy icons: terracotta tile / circle, cream mark)
  mipmap-*/ic_launcher_foreground.png               (adaptive foreground: cream mark on transparent, inside the safe zone)
  values/ic_launcher_background.xml                 (adaptive background colour = terracotta)
  drawable*/splash.png                              (dark splash with the mark)
Usage: python tools/make_android_icons.py
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_icon import render, lobes, R0, TERRACOTTA, CREAM   # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "mobile" / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def mark(size, scale=0.48, fg=CREAM, ss=4):
    """The starburst alone on a transparent square; scale = mark radius as a fraction of size/2."""
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    R = S / 2 * scale
    to = lambda p: (cx + p[0] * R, cy + p[1] * R)
    for poly, tip, tr in lobes():
        d.polygon([to(p) for p in poly], fill=fg + (255,))
        tx, ty = to(tip)
        d.ellipse([tx - tr * R, ty - tr * R, tx + tr * R, ty + tr * R], fill=fg + (255,))
    d.ellipse([cx - R0 * R * 1.05, cy - R0 * R * 1.05, cx + R0 * R * 1.05, cy + R0 * R * 1.05], fill=fg + (255,))
    return img.resize((size, size), Image.LANCZOS)


def round_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ss = 4
    S = size * ss
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse([0, 0, S - 1, S - 1], fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    bg = Image.new("RGBA", (size, size), TERRACOTTA + (255,))
    img.paste(bg, (0, 0), m)
    fgm = mark(size, scale=0.70)
    img.alpha_composite(fgm)
    return img


for dpi, k in DENSITIES.items():
    d = RES / f"mipmap-{dpi}"
    d.mkdir(parents=True, exist_ok=True)
    legacy = int(48 * k)
    render(legacy).save(d / "ic_launcher.png")
    round_icon(legacy).save(d / "ic_launcher_round.png")
    # adaptive foreground is 108dp; the visible safe zone is the central 66dp → mark radius ≈ 0.58 of half-size
    mark(int(108 * k), scale=0.58).save(d / "ic_launcher_foreground.png")

(RES / "values").mkdir(parents=True, exist_ok=True)
(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#D97757</color>\n</resources>\n', encoding="utf-8")

# splash: Capacitor's splash drawable is shown stretched/centred by the theme; a square dark image with the mark
for d in RES.glob("drawable*"):
    if (d / "splash.png").exists() or d.name == "drawable":
        s = 1024
        img = Image.new("RGBA", (s, s), (17, 17, 17, 255))
        img.alpha_composite(mark(s, scale=0.28, fg=TERRACOTTA))
        img.convert("RGB").save(d / "splash.png")
print("android icons + splash written under", RES)
