#!/usr/bin/env python3
"""Génère store/promo/small-tile-440x280.svg (petite tuile promo du Chrome Web Store).

Python standard uniquement, comme make-icons.py. Le texte ne peut pas être rastérisé sans PIL :
le PNG 440×280 est rendu par Chrome (capture d'écran de ce SVG à 440×280, voir store/SUBMISSION.md).

    python3 scripts/make-promo.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module

icons = import_module("make-icons")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "store", "promo")
WIDTH, HEIGHT = 440, 280
ICON = 112  # côté de l'icône dans la tuile
TITLE = "WhichProfile"
TAGLINE = "Which profile just pinged?"
FONT = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif"


def hex_color(rgb):
    return "#%02x%02x%02x" % rgb


def icon_group(x, y, size):
    """Même motif que les icônes (make-icons.py), mis à l'échelle."""
    (cx, cy), radius, width, ring_color, opacity = icons.RING
    parts = [
        f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{icons.BG_RADIUS * size:g}" fill="#2a2d34"/>',
        f'<circle cx="{x + cx * size:g}" cy="{y + cy * size:g}" r="{radius * size:g}" fill="none" '
        f'stroke="{hex_color(ring_color)}" stroke-opacity="{opacity}" stroke-width="{width * size:g}"/>',
    ]
    for (dx, dy), r, color in icons.DOTS:
        parts.append(f'<circle cx="{x + dx * size:g}" cy="{y + dy * size:g}" r="{r * size:g}" fill="{hex_color(color)}"/>')
    return "\n  ".join(parts)


def svg():
    icon_x, icon_y = 36, (HEIGHT - ICON) // 2
    text_x = icon_x + ICON + 26
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
  <rect width="{WIDTH}" height="{HEIGHT}" fill="{hex_color(icons.INK)}"/>
  {icon_group(icon_x, icon_y, ICON)}
  <text x="{text_x}" y="{HEIGHT // 2 - 4}" font-family="{FONT}" font-size="30" font-weight="700" fill="#ecebe8">{TITLE}</text>
  <text x="{text_x}" y="{HEIGHT // 2 + 26}" font-family="{FONT}" font-size="16" font-weight="400" fill="{hex_color(icons.ACCENT)}">{TAGLINE}</text>
</svg>
"""


def main():
    os.makedirs(ROOT, exist_ok=True)
    path = os.path.join(ROOT, "small-tile-440x280.svg")
    with open(path, "w") as f:
        f.write(svg())
    print("écrit", os.path.relpath(path))


if __name__ == "__main__":
    main()
