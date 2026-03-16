#!/usr/bin/env python3
"""
Generate PNG icons for the Stop Doom Scrolling extension.
Requires only the Python standard library — no Pillow needed.

Usage:
    python generate_icons.py

Output:
    icons/icon16.png
    icons/icon48.png
    icons/icon128.png
"""

import struct
import zlib
import math
import os


def make_rgba_png(size: int) -> bytes:
    """
    Draw a stop-sign-ish icon:
      - Red background circle
      - White ring border
      - Dark-red octagon
      - White dot in the centre
    All anti-aliasing is done with a simple super-sampling (2×).
    """
    SCALE   = 4                  # super-sample factor
    S       = size * SCALE       # working resolution
    cx = cy = S / 2.0
    r_outer  = S * 0.48          # outer red border
    r_white  = S * 0.42          # white ring
    r_oct    = S * 0.38          # octagon outer
    r_inner  = S * 0.23          # inner white dot

    def octagon_dist(x, y):
        """Distance from (x,y) to the nearest edge of a regular octagon of radius r_oct."""
        dx, dy = abs(x - cx), abs(y - cy)
        # rotate to nearest 22.5° sector and compute inset
        angle = math.atan2(dy, dx)
        sector = round(angle / (math.pi / 4)) * (math.pi / 4)
        proj = dx * math.cos(sector) + dy * math.sin(sector)
        return proj

    pixels = []
    for y in range(S):
        for x in range(S):
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            od   = octagon_dist(x, y)

            if dist > r_outer:
                pixels.append((0, 0, 0, 0))          # transparent
            elif dist > r_white:
                pixels.append((200, 30, 30, 255))     # dark-red outer edge
            elif dist > r_oct or od > r_oct:
                pixels.append((255, 255, 255, 255))   # white ring
            elif dist < r_inner:
                pixels.append((255, 255, 255, 255))   # white centre dot
            else:
                pixels.append((200, 30, 30, 255))     # red octagon fill

    # Downscale SCALE×SCALE → 1 with box filter
    out = []
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SCALE):
                for dx in range(SCALE):
                    p = pixels[(y * SCALE + dy) * S + (x * SCALE + dx)]
                    r += p[0]; g += p[1]; b += p[2]; a += p[3]
            n = SCALE * SCALE
            out.append((r // n, g // n, b // n, a // n))

    # Build raw PNG scanlines (filter byte 0 = None before each row)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        for x in range(size):
            p = out[y * size + x]
            raw.extend(p)           # R G B A

    compressed = zlib.compress(bytes(raw), level=9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        buf = tag + data
        return struct.pack(">I", len(data)) + buf + struct.pack(">I", zlib.crc32(buf) & 0xFFFFFFFF)

    # IHDR: width, height, bit-depth=8, color-type=6 (RGBA), compress=0, filter=0, interlace=0
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    os.makedirs("icons", exist_ok=True)
    for s in (16, 48, 128):
        path = os.path.join("icons", f"icon{s}.png")
        with open(path, "wb") as f:
            f.write(make_rgba_png(s))
        print(f"Created  {path}  ({s}×{s})")
    print("\nDone! Icons are in the icons/ folder.")
    print("Now load the extension in Chrome: chrome://extensions -> Load unpacked")
