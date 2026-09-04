#!/usr/bin/env python3
"""Mokka — procedurally generated Catppuccin dynamic wallpaper."""

import json
from datetime import datetime
import os
import random
import subprocess
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

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

# latte_mix: 0.0 = Mocha, 1.0 = Latte. Dawn and dusk blend both palettes.
# Shape values evolve gently without moving the light source across the screen.
SLOTS = [
    {"time": "04:00:00", "phase": "night",     "latte_mix": 0.00, "scale_x": 0.98, "scale_y": 1.02, "intensity": 0.88},
    {"time": "06:00:00", "phase": "dawn",      "latte_mix": 0.38, "scale_x": 1.01, "scale_y": 1.00, "intensity": 0.91},
    {"time": "08:00:00", "phase": "morning",   "latte_mix": 1.00, "scale_x": 1.04, "scale_y": 0.98, "intensity": 0.94},
    {"time": "10:00:00", "phase": "morning",   "latte_mix": 1.00, "scale_x": 1.06, "scale_y": 0.97, "intensity": 0.97},
    {"time": "12:00:00", "phase": "noon",      "latte_mix": 1.00, "scale_x": 1.08, "scale_y": 0.96, "intensity": 1.00},
    {"time": "14:00:00", "phase": "afternoon", "latte_mix": 1.00, "scale_x": 1.07, "scale_y": 0.97, "intensity": 0.98},
    {"time": "16:00:00", "phase": "afternoon", "latte_mix": 1.00, "scale_x": 1.05, "scale_y": 0.99, "intensity": 0.96},
    {"time": "18:00:00", "phase": "evening",   "latte_mix": 1.00, "scale_x": 1.03, "scale_y": 1.01, "intensity": 0.94},
    {"time": "20:00:00", "phase": "dusk",      "latte_mix": 0.52, "scale_x": 1.01, "scale_y": 1.03, "intensity": 0.92},
    {"time": "21:00:00", "phase": "night",     "latte_mix": 0.00, "scale_x": 0.99, "scale_y": 1.04, "intensity": 0.90},
    {"time": "22:00:00", "phase": "night",     "latte_mix": 0.00, "scale_x": 0.97, "scale_y": 1.05, "intensity": 0.88},
    {"time": "00:00:00", "phase": "night",     "latte_mix": 0.00, "scale_x": 0.96, "scale_y": 1.04, "intensity": 0.86},
]

PHASES = {
    "night",
    "dawn",
    "morning",
    "noon",
    "afternoon",
    "evening",
    "dusk",
}


# ── Helpers ───────────────────────────────────────────────────

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def lerp3(a, b, t):
    return tuple(int(va + (vb - va) * t) for va, vb in zip(a, b))

def rgb_to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def palette_for_mix(latte_mix):
    if latte_mix == 0.0:
        return MOCHA
    if latte_mix == 1.0:
        return LATTE
    return {
        key: rgb_to_hex(lerp3(hex_to_rgb(MOCHA[key]), hex_to_rgb(LATTE[key]), latte_mix))
        for key in MOCHA
    }


def validate_slots(slots):
    seen = set()
    for slot in slots:
        try:
            datetime.strptime(slot["time"], "%H:%M:%S")
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"invalid timestamp: {slot.get('time')!r}") from error
        if slot["time"] in seen:
            raise ValueError(f"duplicate timestamp: {slot['time']}")
        seen.add(slot["time"])
        if slot.get("phase") not in PHASES:
            raise ValueError(f"invalid phase: {slot.get('phase')!r}")
        if not 0.0 <= slot.get("latte_mix", -1.0) <= 1.0:
            raise ValueError(f"invalid latte_mix: {slot.get('latte_mix')!r}")
        for key in ("scale_x", "scale_y", "intensity"):
            if not isinstance(slot.get(key), (int, float)) or slot[key] <= 0:
                raise ValueError(f"invalid {key}: {slot.get(key)!r}")


# ── Light field ────────────────────────────────────────────────

FIELD_DIVISOR = 4


def scaled_box(box, width, height, scale_x, scale_y):
    cx, cy, rx, ry = box
    return (
        int((cx - rx * scale_x) * width),
        int((cy - ry * scale_y) * height),
        int((cx + rx * scale_x) * width),
        int((cy + ry * scale_y) * height),
    )


def make_light_mask(size, slot, box, strength, blur_factor):
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        scaled_box(box, width, height, slot["scale_x"], slot["scale_y"]),
        fill=int(strength * slot["intensity"]),
    )
    return mask.filter(
        ImageFilter.GaussianBlur(max(width, height) * blur_factor)
    )


def make_density_mask(size, slot):
    small_size = (
        max(1, size[0] // FIELD_DIVISOR),
        max(1, size[1] // FIELD_DIVISOR),
    )
    density = Image.new("L", small_size, 0)
    layers = (
        ((0.40, 0.54, 0.42, 0.66), 120, 0.115),
        ((0.38, 0.51, 0.30, 0.49), 190, 0.100),
        ((0.40, 0.49, 0.18, 0.34), 245, 0.085),
    )
    for box, strength, blur_factor in layers:
        layer = make_light_mask(
            small_size,
            slot,
            box,
            strength,
            blur_factor,
        )
        density = ImageChops.lighter(density, layer)
    return density.resize(size, Image.Resampling.LANCZOS)


def make_base(size, palette, latte_mix):
    base_key = "base" if latte_mix >= 0.5 else "crust"
    return Image.new("RGB", size, palette[base_key])


DOT_SPACING = 7
DOT_RADIUS = 2
DOT_OPACITY = 0.55
DOT_COLOURS = ("surface0", "blue", "lavender", "mauve", "rosewater")
BAYER_4 = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)


def muted_dot_colour(base, accent):
    return lerp3(base, accent, DOT_OPACITY)


def ordered_dot_colour(palette, density, column, row):
    position = density / 255 * (len(DOT_COLOURS) - 1)
    lower = min(int(position), len(DOT_COLOURS) - 1)
    if lower == len(DOT_COLOURS) - 1:
        return palette[DOT_COLOURS[lower]]
    fraction = position - lower
    threshold = BAYER_4[row % 4][column % 4] / 16
    index = lower + 1 if fraction > threshold else lower
    return palette[DOT_COLOURS[index]]


def draw_dot_field(base, palette, slot):
    density = make_density_mask(base.size, slot)
    image = base.copy()
    draw = ImageDraw.Draw(image)
    base_colour = image.getpixel((0, 0))
    offset = DOT_SPACING // 2
    for row, y in enumerate(range(offset, image.height, DOT_SPACING)):
        for column, x in enumerate(range(offset, image.width, DOT_SPACING)):
            accent = hex_to_rgb(
                ordered_dot_colour(
                    palette,
                    density.getpixel((x, y)),
                    column,
                    row,
                )
            )
            colour = muted_dot_colour(base_colour, accent)
            draw.ellipse(
                (
                    x - DOT_RADIUS,
                    y - DOT_RADIUS,
                    x + DOT_RADIUS,
                    y + DOT_RADIUS,
                ),
                fill=colour,
            )
    return image


def generate_slot_image(slot, size=(WIDTH, HEIGHT)):
    palette = palette_for_mix(slot["latte_mix"])
    image = make_base(size, palette, slot["latte_mix"])
    return draw_dot_field(image, palette, slot)


# ── Pipeline ──────────────────────────────────────────────────

def wallpapper_entries(slots):
    entries = []
    for index, slot in enumerate(slots):
        timestamp = slot["time"]
        entry = {
            "fileName": f"{index:02d}_{timestamp.replace(':', '')}.png",
            "time": timestamp,
        }
        if index == 0:
            entry["isPrimary"] = True
        entries.append(entry)
    return entries


def generate():
    validate_slots(SLOTS)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = wallpapper_entries(SLOTS)

    for slot, entry in zip(SLOTS, entries):
        print(
            f"  [{slot['time']}]  {slot['phase']:9s}  "
            f"latte={slot['latte_mix']:.2f}  "
            f"shape=({slot['scale_x']:.2f},{slot['scale_y']:.2f})"
        )
        generate_slot_image(slot).save(OUTPUT_DIR / entry["fileName"])

    metadata_path = OUTPUT_DIR / "wallpapper.json"
    with metadata_path.open("w") as metadata_file:
        json.dump(entries, metadata_file, indent=2)

    wallpaper_path = OUTPUT_DIR / "mokka.heic"
    wallpapper = Path.home() / ".local/bin/wallpapper"
    if not wallpapper.is_file():
        raise FileNotFoundError(f"wallpapper binary not found: {wallpapper}")
    subprocess.run(
        [str(wallpapper), "-i", str(metadata_path), "-o", str(wallpaper_path)],
        cwd=OUTPUT_DIR,
        check=True,
    )
    print(f"\n  -> {wallpaper_path}")


if __name__ == "__main__":
    seed = int(os.environ.get("MOKKA_SEED", random.randint(0, 2**31)))
    random.seed(seed)
    print(f"Mokka  seed: {seed}")
    generate()
