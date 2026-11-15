"""Case Canvas logo: a terracotta tile with a cream starburst (Claude-inspired).

Writes desktop/build/icon.png (512px), desktop/build/icon.ico (16..256) and prototype/logo.svg.
Usage: python tools/make_icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TERRACOTTA = (217, 119, 87)        # #D97757
CREAM = (250, 245, 236)            # #FAF5EC

# Starburst geometry in unit coordinates (centre 0,0; radius 1). Twelve tapered lobes of
# slightly uneven length, like a hand-drawn asterisk.
LOBES = 12
LENGTHS = [0.98, 0.80, 0.92, 0.76, 0.96, 0.82, 0.90, 0.78, 1.00, 0.80, 0.88, 0.78]
JITTER = [0.0, 0.04, -0.03, 0.05, -0.02, 0.03, -0.04, 0.02, 0.0, -0.03, 0.04, -0.02]
W0, W1, R0 = 0.30, 0.19, 0.08      # width at base, width at tip, start radius (chunky, rounded lobes)


def lobes():
    """Yield (polygon points, tip centre, tip radius) per lobe in unit space."""
    for i in range(LOBES):
        a = 2 * math.pi * i / LOBES + JITTER[i]
        L = LENGTHS[i]
        ux, uy = math.cos(a), math.sin(a)
        nx, ny = -uy, ux
        base = (ux * R0, uy * R0)
        tip = (ux * L, uy * L)
        poly = [
            (base[0] + nx * W0 / 2, base[1] + ny * W0 / 2),
            (tip[0] + nx * W1 / 2, tip[1] + ny * W1 / 2),
            (tip[0] - nx * W1 / 2, tip[1] - ny * W1 / 2),
            (base[0] - nx * W0 / 2, base[1] - ny * W0 / 2),
        ]
        yield poly, tip, W1 / 2


def render(size, tile=True, fg=CREAM, bg=TERRACOTTA, ss=4):
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if tile:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=bg + (255,))
    cx = cy = S / 2
    R = S * (0.36 if tile else 0.48)
    to = lambda p: (cx + p[0] * R, cy + p[1] * R)
    for poly, tip, tr in lobes():
        d.polygon([to(p) for p in poly], fill=fg + (255,))
        tx, ty = to(tip)
        d.ellipse([tx - tr * R, ty - tr * R, tx + tr * R, ty + tr * R], fill=fg + (255,))
    d.ellipse([cx - R0 * R * 1.05, cy - R0 * R * 1.05, cx + R0 * R * 1.05, cy + R0 * R * 1.05], fill=fg + (255,))
    return img.resize((size, size), Image.LANCZOS)


def svg(color="#D97757"):
    parts = []
    for poly, tip, tr in lobes():
        pts = " ".join(f"{50 + x * 48:.2f},{50 + y * 48:.2f}" for x, y in poly)
        parts.append(f'<polygon points="{pts}"/>')
        parts.append(f'<circle cx="{50 + tip[0] * 48:.2f}" cy="{50 + tip[1] * 48:.2f}" r="{tr * 48:.2f}"/>')
    parts.append(f'<circle cx="50" cy="50" r="{R0 * 48 * 1.05:.2f}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            f'<g fill="{color}">' + "".join(parts) + "</g></svg>")


if __name__ == "__main__":
    build = ROOT / "desktop" / "build"
    build.mkdir(parents=True, exist_ok=True)
    big = render(512)
    big.save(build / "icon.png")
    big.save(build / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    render(256, tile=False).save(ROOT / "prototype" / "logo-mark.png")
    (ROOT / "prototype" / "logo.svg").write_text(svg(), encoding="utf-8")
    print("wrote", build / "icon.png", build / "icon.ico", ROOT / "prototype" / "logo.svg")
