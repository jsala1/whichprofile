#!/usr/bin/env python3
"""Génère icons/16.png, 32.png, 48.png et 128.png depuis icons/icon.svg (source unique).

Python standard uniquement (xml + zlib + struct) : pas de PIL sur la machine.
Gère ce que contient l'icône : <rect> (rx, fill, stroke, stroke-width, stroke-opacity, fill-opacity)
et <circle> (fill). Anticrénelage par sur-échantillonnage 8×8.

- 16, 32, 48 : dessin plein cadre.
- 128 : 96 px de dessin + 16 px de marge transparente (exigence du Chrome Web Store).

    python3 scripts/make-icons.py
"""
import math
import os
import struct
import xml.etree.ElementTree as ET
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.join(HERE, "..", "icons")
SOURCE = os.path.join(ICONS, "icon.svg")
SAMPLES = 8
# taille du PNG → (taille du dessin, marge)
LAYOUT = {16: (16, 0), 32: (32, 0), 48: (48, 0), 128: (96, 16)}


def parse_color(value):
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))


def number(el, name, default=0.0):
    return float(el.get(name, default))


def rounded_rect_distance(x, y, rx, ry, w, h, r):
    """Distance signée au bord d'un rectangle arrondi (négative à l'intérieur)."""
    cx, cy = rx + w / 2, ry + h / 2
    qx = abs(x - cx) - (w / 2 - r)
    qy = abs(y - cy) - (h / 2 - r)
    outside = math.hypot(max(qx, 0), max(qy, 0))
    return outside + min(max(qx, qy), 0) - r


def load_shapes():
    root = ET.parse(SOURCE).getroot()
    view = [float(v) for v in root.get("viewBox").split()]
    shapes = []
    for el in root:
        tag = el.tag.split("}")[-1]
        if tag == "rect":
            geom = (number(el, "x"), number(el, "y"), number(el, "width"), number(el, "height"), number(el, "rx"))
            dist = lambda x, y, g=geom: rounded_rect_distance(x, y, *g)
        elif tag == "circle":
            cx, cy, r = number(el, "cx"), number(el, "cy"), number(el, "r")
            dist = lambda x, y, c=(cx, cy, r): math.hypot(x - c[0], y - c[1]) - c[2]
        else:
            raise ValueError(f"forme non gérée : {tag}")
        fill = el.get("fill", "#000")
        stroke = el.get("stroke")
        shapes.append(
            {
                "dist": dist,
                "fill": None if fill == "none" else parse_color(fill),
                "fill_opacity": number(el, "fill-opacity", 1),
                "stroke": parse_color(stroke) if stroke and stroke != "none" else None,
                "stroke_opacity": number(el, "stroke-opacity", 1),
                "stroke_width": number(el, "stroke-width", 1),
            }
        )
    return view, shapes


def over(dst, color, alpha):
    """Composition « source-over » en alpha non prémultiplié. dst = (r, g, b, a)."""
    r, g, b, a = dst
    out_a = alpha + a * (1 - alpha)
    if out_a == 0:
        return (0.0, 0.0, 0.0, 0.0)
    mix = lambda s, d: (s * alpha + d * a * (1 - alpha)) / out_a
    return (mix(color[0], r), mix(color[1], g), mix(color[2], b), out_a)


def sample(shapes, x, y):
    pixel = (0.0, 0.0, 0.0, 0.0)
    for shape in shapes:
        d = shape["dist"](x, y)
        if shape["fill"] and d <= 0:
            pixel = over(pixel, shape["fill"], shape["fill_opacity"])
        if shape["stroke"] and abs(d) <= shape["stroke_width"] / 2:
            pixel = over(pixel, shape["stroke"], shape["stroke_opacity"])
    return pixel


def render(size, view, shapes):
    art, margin = LAYOUT[size]
    vx, vy, vw, vh = view
    rows = []
    for py in range(size):
        row = bytearray([0])  # filtre PNG : aucun
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]  # couleurs prémultipliées + alpha
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    u = (px + (sx + 0.5) / SAMPLES - margin) / art
                    v = (py + (sy + 0.5) / SAMPLES - margin) / art
                    if not (0 <= u <= 1 and 0 <= v <= 1):
                        continue  # marge : transparente
                    r, g, b, a = sample(shapes, vx + u * vw, vy + v * vh)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            n = SAMPLES * SAMPLES
            alpha = acc[3] / n
            rgb = [round(255 * acc[i] / acc[3]) if acc[3] else 0 for i in range(3)]
            row.extend(rgb + [round(255 * alpha)])
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main():
    view, shapes = load_shapes()
    for size in LAYOUT:
        path = os.path.join(ICONS, f"{size}.png")
        with open(path, "wb") as f:
            f.write(png(size, render(size, view, shapes)))
        print("écrit", os.path.relpath(path))


if __name__ == "__main__":
    main()
