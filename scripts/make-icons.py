#!/usr/bin/env python3
"""Génère icons/16.png, 48.png, 128.png et icons/icon.svg.

Python standard uniquement (zlib + struct) : PIL n'est pas disponible sur la machine.
Motif : trois profils (points), celui du milieu « parle » (plein, accent, onde autour).
Anticrénelage par sur-échantillonnage 4x4.

    python3 scripts/make-icons.py
"""
import math
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
SIZES = (16, 48, 128)
SAMPLES = 4

INK = (0x1D, 0x1F, 0x24)
MUTED = (0x8B, 0x8F, 0x98)
ACCENT = (0xE9, 0x96, 0x4A)

# Formes en coordonnées unitaires [0, 1], dessinées dans l'ordre.
BG_RADIUS = 0.22
DOTS = [((0.16, 0.5), 0.065, MUTED), ((0.84, 0.5), 0.065, MUTED), ((0.5, 0.5), 0.15, ACCENT)]
RING = ((0.5, 0.5), 0.235, 0.035, ACCENT, 0.6)  # centre, rayon, épaisseur, couleur, opacité
RING_MIN_SIZE = 48  # l'onde est illisible en 16 px


def in_rounded_rect(x, y, r):
    dx = max(r - x, 0, x - (1 - r))
    dy = max(r - y, 0, y - (1 - r))
    return dx * dx + dy * dy <= r * r


def blend(dst, color, alpha):
    return tuple(d * (1 - alpha) + c * alpha for d, c in zip(dst, color))


def sample(x, y, size):
    """Couleur et opacité (0..1) d'un point."""
    if not in_rounded_rect(x, y, BG_RADIUS):
        return (0, 0, 0), 0.0
    color = INK
    if size >= RING_MIN_SIZE:
        (cx, cy), radius, width, ring_color, opacity = RING
        if abs(math.hypot(x - cx, y - cy) - radius) <= width / 2:
            color = blend(color, ring_color, opacity)
    for (cx, cy), radius, dot_color in DOTS:
        if math.hypot(x - cx, y - cy) <= radius:
            color = dot_color
    return color, 1.0


def render(size):
    rows = []
    for py in range(size):
        row = bytearray([0])  # filtre PNG : aucun
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            alpha = 0.0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    x = (px + (sx + 0.5) / SAMPLES) / size
                    y = (py + (sy + 0.5) / SAMPLES) / size
                    color, a = sample(x, y, size)
                    alpha += a
                    for i in range(3):
                        acc[i] += color[i] * a
            n = SAMPLES * SAMPLES
            if alpha:
                pixel = [round(acc[i] / alpha) for i in range(3)]
            else:
                pixel = [0, 0, 0]
            row.extend(pixel + [round(255 * alpha / n)])
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def hex_color(rgb):
    return "#%02x%02x%02x" % rgb


def svg():
    (cx, cy), radius, width, ring_color, opacity = RING
    dots = "\n".join(
        f'  <circle cx="{x * 128:g}" cy="{y * 128:g}" r="{r * 128:g}" fill="{hex_color(c)}"/>' for (x, y), r, c in DOTS
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="{BG_RADIUS * 128:g}" fill="{hex_color(INK)}"/>
  <circle cx="{cx * 128:g}" cy="{cy * 128:g}" r="{radius * 128:g}" fill="none" stroke="{hex_color(ring_color)}" stroke-opacity="{opacity}" stroke-width="{width * 128:g}"/>
{dots}
</svg>
"""


def main():
    os.makedirs(ROOT, exist_ok=True)
    for size in SIZES:
        path = os.path.join(ROOT, f"{size}.png")
        with open(path, "wb") as f:
            f.write(png(size, render(size)))
        print("écrit", os.path.relpath(path))
    with open(os.path.join(ROOT, "icon.svg"), "w") as f:
        f.write(svg())
    print("écrit icons/icon.svg")


if __name__ == "__main__":
    main()
