"""midas-mcp logo, kelime işareti ve kilit SVG'lerini üretir (docs/brand/ içine yazar).

Çalıştır: python3 docs/brand/logo-uret.py  (fonttools gerekir; Geist değişken TTF'i GEIST
ortam değişkeniyle ya da ~/.local/share/fonts/google/Geist[wght].ttf yolunda).
Yazı Geist 620 ile dizilip yola çevrilir; SVG'ler font gerektirmez.
PNG ve favicon: README'deki rsvg-convert / magick komutları.
"""
import os
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

OUT = Path(__file__).resolve().parent
F = os.environ.get("GEIST") or os.path.expanduser("~/.local/share/fonts/google/Geist[wght].ttf")
font = instantiateVariableFont(TTFont(F), {"wght": 620})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
hmtx = font["hmtx"]

GECE = "#0A0D2A"
BEYAZ = "#FFFFFF"
MAVI = "#4959EA"
BUZ = "#E1E4FF"
GOK = "#8C96F6"
KENAR = "#262C63"  # karonun gece zeminde kaybolmaması için iç kenar


def r(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def text_path(s, size, x0, baseline, tracking=-0.02):
    sc = size / upm
    x = x0
    out = []
    for ch in s:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=r)
        gs[g].draw(TransformPen(pen, (sc, 0, 0, -sc, x, baseline)))
        out.append((ch, pen.getCommands()))
        x += hmtx[g][0] * sc + tracking * size
    return out, x - x0 - tracking * size


def mark(x=0, y=0, s=128, small=False, kenar=0.0):
    """Kapı: gece karo, iki beyaz direk, aralarında bekleyen mavi nokta. kenar: iç çizgi kalınlığı (px)."""
    k = s / 128
    posts = [(26, 26, 20, 76), (82, 26, 20, 76)] if small else [(30, 30, 14, 68), (84, 30, 14, 68)]
    dot = 17 if small else 13
    g = f'<rect x="{r(x)}" y="{r(y)}" width="{r(s)}" height="{r(s)}" rx="{r(28 * k)}" fill="{GECE}"/>'
    if kenar:
        w = kenar
        g += (f'<rect x="{r(x + w / 2)}" y="{r(y + w / 2)}" width="{r(s - w)}" height="{r(s - w)}" '
              f'rx="{r(28 * k - w / 2)}" fill="none" stroke="{KENAR}" stroke-width="{r(w)}"/>')
    for px, py, pw, ph in posts:
        g += (f'<rect x="{r(x + px * k)}" y="{r(y + py * k)}" width="{r(pw * k)}" height="{r(ph * k)}" '
              f'rx="{r(pw * k / 2)}" fill="{BEYAZ}"/>')
    g += f'<circle cx="{r(x + 64 * k)}" cy="{r(y + 64 * k)}" r="{r(dot * k)}" fill="{MAVI}"/>'
    return g


def svg(w, h, body, label="midas-mcp"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'role="img" aria-label="{label}"><title>{label}</title>{body}</svg>\n')


def word(x0, baseline, size, base, accent):
    parts, w = text_path("midas-mcp", size, x0, baseline)
    body = ""
    for i, (_, d) in enumerate(parts):
        body += f'<path d="{d}" fill="{accent if i >= 5 else base}"/>'
    return body, w


(OUT / "logo.svg").write_text(svg(128, 128, mark(kenar=3)))
(OUT / "logo-16.svg").write_text(svg(128, 128, mark(small=True)))
for name, base, acc, kenar in [("acik", GECE, MAVI, 0), ("koyu", BUZ, GOK, 2.5)]:
    b, w = word(0, 46, 56, base, acc)
    (OUT / f"yazi-{name}.svg").write_text(svg(round(w) + 2, 60, b))
    b2, w2 = word(88, 52, 52, base, acc)
    (OUT / f"kilit-{name}.svg").write_text(svg(round(88 + w2) + 4, 72, mark(0, 0, 72, kenar=kenar) + b2))
print("yazıldı:", OUT)
