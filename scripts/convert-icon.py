"""
Gera app-icon.ico ultra-nitido.
- Tamanhos grandes (64-256): sua PNG com supersampling 8x
- Tamanhos pequenos (16-48): versao vetorial simplificada (tracos grossos)
"""
from __future__ import annotations

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "app-icon.ico"
SUPER = 8
SMALL_CUTOFF = 48


def find_png() -> Path:
    for docs in [
        Path.home() / "OneDrive" / "Documentos" / "IconeAPP",
        Path.home() / "Documents" / "IconeAPP",
    ]:
        if docs.exists():
            imgs = sorted(docs.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
            if imgs:
                return imgs[0]
    raise FileNotFoundError("Coloque um PNG na pasta IconeAPP")


def load_master() -> Image.Image:
    img = Image.open(find_png()).convert("RGBA")
    w, h = img.size
    side = max(w, h)
    if w != h:
        c = Image.new("RGBA", (side, side), (0, 0, 0, 255))
        c.paste(img, ((side - w) // 2, (side - h) // 2), img)
        img = c
    return img


def from_png(master: Image.Image, size: int) -> Image.Image:
    big = master.resize((size * SUPER, size * SUPER), Image.Resampling.LANCZOS)
    out = big.resize((size, size), Image.Resampling.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=120, threshold=2))


def draw_small_icon(size: int) -> Image.Image:
    """Versao simplificada com tracos grossos para 16-48px."""
    c = size * SUPER
    img = Image.new("RGBA", (c, c), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    cx = cy = c // 2
    r = int(c * 0.36)
    white = (255, 255, 255, 255)

    sw = max(3, int(c * 0.04))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=white, width=sw)
    d.line([(cx, cy - r), (cx, cy + r)], fill=white, width=max(2, int(c * 0.03)))

    # Rede esquerda (tracos grossos)
    hx, hy = int(cx - c * 0.14), cy
    nr = max(4, int(c * 0.055))
    hr = max(3, int(c * 0.04))
    lw = max(3, int(c * 0.035))
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=white)
    for nx, ny in [
        (int(cx - c * 0.24), int(cy - c * 0.13)),
        (int(cx - c * 0.27), cy),
        (int(cx - c * 0.24), int(cy + c * 0.13)),
    ]:
        d.line([(hx, hy), (nx, ny)], fill=white, width=lw)
        d.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], fill=white)

    # C direito (arco grosso)
    cxr = int(cx + c * 0.1)
    orr = int(c * 0.2)
    cw = max(5, int(c * 0.07))
    d.arc(
        [cxr - orr, cy - orr, cxr + orr, cy + orr],
        start=55, end=305, fill=white, width=cw,
    )

    out = img.resize((size, size), Image.Resampling.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=0.5, percent=140, threshold=1))


def png_to_ico(images: list[Image.Image], sizes: list[int], path: Path) -> None:
    entries: list[tuple[int, bytes]] = []
    for img, size in zip(images, sizes):
        buf = BytesIO()
        img.convert("RGBA").save(buf, format="PNG", optimize=True)
        entries.append((size, buf.getvalue()))

    header = struct.pack("<HHH", 0, 1, len(entries))
    dirs = b""
    data = b""
    base = 6 + 16 * len(entries)
    for i, (size, png) in enumerate(entries):
        w = h = 0 if size >= 256 else size
        off = base + sum(len(entries[j][1]) for j in range(i))
        dirs += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), off)
        data += png
    path.write_bytes(header + dirs + data)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    master = load_master()
    src = find_png()
    images: list[Image.Image] = []

    for s in SIZES:
        if s <= SMALL_CUTOFF:
            images.append(draw_small_icon(s))
        else:
            images.append(from_png(master, s))

    png_to_ico(images, SIZES, OUT)
    (ROOT / "public" / "app-icon.ico").write_bytes(OUT.read_bytes())
    images[-1].save(ROOT / "assets" / "icon-preview-256.png")
    images[0].save(ROOT / "assets" / "icon-preview-16.png")

    print(f"OK: {src.name}")
    print(f"    16-48px: vetor simplificado | 64-256px: PNG supersampling {SUPER}x")
    print(f"    -> {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()