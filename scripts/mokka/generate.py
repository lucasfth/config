#!/usr/bin/env python3
"""Mokka — procedurally generated Catppuccin dynamic wallpaper."""

import json
import math
import os
import random
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

# ── Configuration ─────────────────────────────────────────────

WIDTH = 3024
HEIGHT = 1964
OUTPUT_DIR = Path(__file__).parent / "output"

# Catppuccin Mocha (dark)
MOCHA = {
    "base":      "#1e1e2e",  "crust":     "#11111b",  "mantle":    "#181825",
    "surface0":  "#313244",  "surface1":  "#45475a",  "surface2":  "#585b70",
    "overlay0":  "#6c7086",  "overlay1":  "#7f849c",  "overlay2":  "#9399b2",
    "subtext0":  "#a6adc8",  "subtext1":  "#bac2de",  "text":      "#cdd6f4",
    "rosewater": "#f5e0dc",  "flamingo":  "#f2cdcd",  "pink":      "#f5c2e7",
    "mauve":     "#cba6f7",  "maroon":    "#eba0ac",  "red":       "#f38ba8",
    "peach":     "#fab387",  "yellow":    "#f9e2af",  "green":     "#a6e3a1",
    "teal":      "#94e2d5",  "sky":       "#89dceb",  "sapphire":  "#74c7ec",
    "blue":      "#89b4fa",  "lavender":  "#b4befe",
}

# Catppuccin Latte (light)
LATTE = {
    "base":      "#eff1f5",  "crust":     "#dce0e8",  "mantle":    "#e6e9ef",
    "surface0":  "#ccd0da",  "surface1":  "#bcc0cc",  "surface2":  "#acb0be",
    "overlay0":  "#9ca0b0",  "overlay1":  "#8c8fa1",  "overlay2":  "#7c7f93",
    "subtext0":  "#6c6f85",  "subtext1":  "#5c5f77",  "text":      "#4c4f69",
    "rosewater": "#dc8a78",  "flamingo":  "#dd7878",  "pink":      "#ea76cb",
    "mauve":     "#8839ef",  "maroon":    "#e64553",  "red":       "#d20f39",
    "peach":     "#fe640b",  "yellow":    "#df8e1d",  "green":     "#40a02b",
    "teal":      "#179299",  "sky":       "#04a5e5",  "sapphire":  "#209fb5",
    "blue":      "#1e66f5",  "lavender":  "#7287fd",
}

# (HH:MM:SS, phase, glow_x, glow_y, glow_color, palette)
# palette: "mocha" for dark phases, "latte" for light phases
SLOTS = [
    ("04:00:00", "night",     0.85, 0.25, "mauve",     "mocha"),
    ("06:00:00", "dawn",      0.15, 0.60, "rosewater", "mocha"),
    ("08:00:00", "morning",   0.30, 0.30, "peach",     "latte"),
    ("10:00:00", "morning",   0.45, 0.15, "yellow",    "latte"),
    ("12:00:00", "noon",      0.50, 0.05, "yellow",    "latte"),
    ("14:00:00", "afternoon", 0.55, 0.12, "yellow",    "latte"),
    ("16:00:00", "afternoon", 0.65, 0.30, "peach",     "latte"),
    ("18:00:00", "evening",   0.78, 0.55, "rosewater", "latte"),
    ("20:00:00", "dusk",      0.88, 0.72, "maroon",    "mocha"),
    ("21:00:00", "night",     0.90, 0.85, "mauve",     "mocha"),
    ("22:00:00", "night",     0.50, 0.92, "mauve",     "mocha"),
    ("00:00:00", "night",     0.20, 0.90, "blue",      "mocha"),
]

# Sky gradients: (top, bottom) palette keys
SKY = {
    "night":     ("crust",    "base"),
    "dawn":      ("surface0", "surface2"),
    "morning":   ("crust",    "base"),
    "noon":      ("surface0", "base"),
    "afternoon": ("surface0", "base"),
    "evening":   ("surface1", "base"),
    "dusk":      ("surface2", "maroon"),
}

GRAIN_ALPHA = {
    "night": 0.08, "dawn": 0.05, "morning": 0.03, "noon": 0.02,
    "afternoon": 0.03, "evening": 0.04, "dusk": 0.06,
}

SNOWFLAKE_COLORS = ["green", "teal", "blue", "lavender"]
CONSTELLATION_COLORS = ["peach", "rosewater", "sapphire", "yellow"]


def motif_opacity(phase):
    return {"night": 0.22, "dawn": 0.16, "morning": 0.18, "noon": 0.14,
            "afternoon": 0.18, "evening": 0.20, "dusk": 0.20}[phase]


def palette_for(phase):
    """Return MOCHA or LATTE based on phase."""
    return LATTE if phase in {"morning", "noon", "afternoon", "evening"} else MOCHA


# ── Helpers ───────────────────────────────────────────────────

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def lerp3(a, b, t):
    return tuple(int(va + (vb - va) * t) for va, vb in zip(a, b))


# ── Layer 1: Sky gradient ─────────────────────────────────────

def draw_sky(img, phase):
    w, h = img.width, img.height
    pal = palette_for(phase)
    top_rgb = hex_to_rgb(pal[SKY[phase][0]])
    bot_rgb = hex_to_rgb(pal[SKY[phase][1]])
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = (y / (h - 1)) ** 0.8 if h > 1 else 0
        draw.line([(0, y), (w, y)], fill=lerp3(top_rgb, bot_rgb, t))


# ── Layer 2: Sun glow ─────────────────────────────────────────

def draw_sun_glow(img, sun_x, sun_y, glow_key, phase):
    w, h = img.width, img.height
    px, py = sun_x * w, sun_y * h
    pal = palette_for(phase)
    glow_rgb = hex_to_rgb(pal[glow_key])
    max_r = max(w, h) * 0.7
    draw = ImageDraw.Draw(img, "RGBA")
    alpha_base = 100 if pal is MOCHA else 80
    for i in range(60, 0, -1):
        rf = i / 60
        r = max_r * rf
        a = int((1 - rf) ** 2.5 * alpha_base)
        if a < 2:
            break
        draw.ellipse([px - r, py - r, px + r, py + r], fill=(*glow_rgb, a))


# ── Layer 3: Atmosphere ───────────────────────────────────────

def draw_atmosphere(img, phase):
    w, h = img.width, img.height
    pal = palette_for(phase)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = w / 2, h / 2
    max_d = math.hypot(cx, cy)
    vs = 0.15 if phase in ("night",) else 0.08 if pal is MOCHA else 0.04
    for y in range(0, h, 6):
        for x in range(0, w, 6):
            d = math.hypot(x - cx, y - cy) / max_d
            a = int(d ** 3 * vs * 255)
            if a > 0:
                draw.rectangle([x, y, x + 5, y + 5], fill=(0, 0, 0, a))
    for _ in range(random.randint(2, 4)):
        gx = random.randint(0, w)
        gy = random.randint(0, h)
        gr = random.randint(200, 600)
        gc = pal[random.choice(["mauve", "sapphire", "peach", "lavender"])]
        grgb = hex_to_rgb(gc)
        for r in range(gr, 0, -20):
            t = r / gr
            a = int(t ** 3 * 10)
            draw.ellipse([gx - r, gy - r, gx + r, gy + r], fill=(*grgb, a))
    base = img.convert("RGBA")
    return Image.alpha_composite(base, overlay).convert("RGB")


# ── Layer 4: Grain ────────────────────────────────────────────

def make_grain_texture(size=256):
    grain = Image.new("L", (size, size))
    px = grain.load()
    rng = random.Random(42)
    for y in range(size):
        for x in range(size):
            px[x, y] = rng.randint(0, 255)
    return grain.filter(ImageFilter.GaussianBlur(radius=1.5))


def apply_grain(img, tex, alpha):
    tiled = Image.new("L", img.size)
    gw, gh = tex.size
    for y in range(0, img.height, gh):
        for x in range(0, img.width, gw):
            tiled.paste(tex, (x, y))
    ga = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ga.putalpha(tiled.point(lambda v: int(v * alpha)))
    return Image.alpha_composite(img.convert("RGBA"), ga).convert("RGB")


# ── Layer 5: Motifs ───────────────────────────────────────────

def draw_terminal(draw, w, h, pal):
    """Terminal-inspired: arrows (➜), dot clusters, bracket marks."""
    color = pal[random.choice(["green", "sapphire", "lavender", "teal"])]
    crgb = hex_to_rgb(color)
    for _ in range(random.randint(6, 12)):
        ax = random.randint(30, w - 30)
        ay = random.randint(30, h - 30)
        sz = random.randint(8, 28)
        angle = random.uniform(0, 2 * math.pi)
        dx = sz * math.cos(angle)
        dy = sz * math.sin(angle)
        draw.line([(ax, ay), (ax + dx, ay + dy)], fill=color,
                  width=max(1, random.randint(1, 2)))
        hx, hy = ax + dx, ay + dy
        hs = sz * 0.35
        p1 = (hx - hs * math.cos(angle), hy - hs * math.sin(angle))
        p2 = (hx - hs * math.cos(angle + 2.2), hy - hs * math.sin(angle + 2.2))
        p3 = (hx - hs * math.cos(angle - 2.2), hy - hs * math.sin(angle - 2.2))
        draw.polygon([p1, p2, p3], fill=(*crgb, random.randint(25, 55)))
    for _ in range(random.randint(8, 15)):
        cx = random.randint(30, w - 30)
        cy = random.randint(30, h - 30)
        cr = random.randint(3, 8)
        hr = cr * random.uniform(2, 4)
        draw.ellipse([cx - hr, cy - hr, cx + hr, cy + hr],
                     fill=(*crgb, random.randint(4, 12)))
        draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr],
                     fill=(*crgb, random.randint(35, 75)))
    for _ in range(random.randint(3, 6)):
        bx = random.randint(40, w - 80)
        by = random.randint(40, h - 80)
        bh = random.randint(15, 50)
        bw = random.randint(4, 10)
        draw.line([(bx, by), (bx, by + bh)], fill=color, width=1)
        draw.line([(bx, by), (bx + bw, by)], fill=color, width=1)
        draw.line([(bx, by + bh), (bx + bw, by + bh)], fill=color, width=1)


def draw_snowflakes(draw, w, h, pal):
    """15-25 snowflakes, varied sizes, filled centres."""
    color = pal[random.choice(SNOWFLAKE_COLORS)]
    crgb = hex_to_rgb(color)
    for _ in range(random.randint(15, 25)):
        cx = random.randint(20, w - 20)
        cy = random.randint(20, h - 20)
        sz = random.randint(8, 60)
        arms = random.randint(4, 8)
        ao = random.uniform(0, math.pi)
        cr = max(2, sz * 0.18)
        draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr],
                     fill=(*crgb, random.randint(40, 80)))
        for i in range(arms):
            rad = ao + (2 * math.pi * i / arms)
            dx = sz * math.cos(rad)
            dy = sz * math.sin(rad)
            draw.line([(cx, cy), (cx + dx, cy + dy)],
                      fill=color, width=max(1, random.randint(1, 3)))
            for frac in [0.45, 0.7]:
                mx = cx + dx * frac
                my = cy + dy * frac
                br = sz * 0.22 * random.uniform(0.7, 1.3)
                ba = rad + random.choice([-1, 1]) * math.pi / random.uniform(2.5, 4)
                draw.line([(mx, my), (mx + br * math.cos(ba), my + br * math.sin(ba))],
                          fill=color, width=1)


def draw_constellation(draw, w, h, pal):
    """Glowing nodes with halo rings, connected by faint lines."""
    color = pal[random.choice(CONSTELLATION_COLORS)]
    crgb = hex_to_rgb(color)
    n = random.randint(15, 25)
    pts = [(random.randint(30, w - 30), random.randint(30, h - 30)) for _ in range(n)]
    for x, y in pts:
        sz = random.randint(3, 8)
        hr = sz * random.uniform(3, 6)
        draw.ellipse([x - hr, y - hr, x + hr, y + hr],
                     fill=(*crgb, random.randint(8, 20)))
    md = min(w, h) * random.uniform(0.25, 0.45)
    for i, p1 in enumerate(pts):
        for j in range(i + 1, len(pts)):
            p2 = pts[j]
            d = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            if d < md:
                a = int((1 - d / md) * 40)
                draw.line([p1, p2], fill=(*crgb, a), width=random.randint(1, 2))
    for x, y in pts:
        sz = random.randint(3, 8)
        draw.ellipse([x - sz, y - sz, x + sz, y + sz],
                     fill=(*crgb, random.randint(45, 95)))


# ── Compositing ───────────────────────────────────────────────

def pick_motifs():
    return random.sample(["terminal", "snowflakes", "constellation"],
                         random.randint(1, 2))


def generate_slot_image(phase, sun_x, sun_y, glow_key, motifs, pal):
    img = Image.new("RGB", (WIDTH, HEIGHT))
    draw_sky(img, phase)
    draw_sun_glow(img, sun_x, sun_y, glow_key, phase)
    img = draw_atmosphere(img, phase)
    img = apply_grain(img, make_grain_texture(), GRAIN_ALPHA[phase])
    mop = motif_opacity(phase)
    mc = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    md = ImageDraw.Draw(mc)
    for m in motifs:
        {"terminal": draw_terminal, "snowflakes": draw_snowflakes,
         "constellation": draw_constellation}[m](md, WIDTH, HEIGHT, pal)
    a = mc.split()[-1].point(lambda v: int(v * mop))
    mr = Image.merge("RGBA", (*mc.split()[:3], a))
    return Image.alpha_composite(img.convert("RGBA"), mr).convert("RGB")


# ── Pipeline ──────────────────────────────────────────────────

def generate():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    wj = []
    for i, (ts, phase, sx, sy, gk, pk) in enumerate(SLOTS):
        pal = LATTE if pk == "latte" else MOCHA
        motifs = pick_motifs()
        print(f"  [{ts}]  {phase:9s}  {pk:5s}  glow=({sx:.1f},{sy:.1f})  motifs: {motifs}")
        img = generate_slot_image(phase, sx, sy, gk, motifs, pal)
        fn = f"{i:02d}_{ts.replace(':', '')}.png"
        img.save(OUTPUT_DIR / fn)
        e = {"fileName": fn, "time": ts}
        if i == 0:
            e["isPrimary"] = True
        wj.append(e)
    jp = OUTPUT_DIR / "wallpapper.json"
    with open(jp, "w") as f:
        json.dump(wj, f, indent=2)
    hp = OUTPUT_DIR / "mokka.heic"
    wallpapper = os.path.expanduser("~/.local/bin/wallpapper")
    subprocess.run([wallpapper, "-i", str(jp), "-o", str(hp)],
                   cwd=OUTPUT_DIR, check=True)
    print(f"\n  -> {hp}")


if __name__ == "__main__":
    seed = int(os.environ.get("MOKKA_SEED", random.randint(0, 2**31)))
    random.seed(seed)
    print(f"Mokka  seed: {seed}")
    generate()
