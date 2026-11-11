#!/usr/bin/env python3
"""Mokka — procedurally generated Catppuccin dynamic wallpaper."""

import argparse
import json
from datetime import datetime
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

if __package__:
    from .studies import STYLES, field
else:
    from studies import STYLES, field

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
# Geometry stays fixed: only the palette changes over the day.
SLOTS = [
    {"time": "04:00:00", "phase": "night",     "latte_mix": 0.00},
    {"time": "06:00:00", "phase": "dawn",      "latte_mix": 0.38},
    {"time": "08:00:00", "phase": "morning",   "latte_mix": 1.00},
    {"time": "10:00:00", "phase": "morning",   "latte_mix": 1.00},
    {"time": "12:00:00", "phase": "noon",      "latte_mix": 1.00},
    {"time": "14:00:00", "phase": "afternoon", "latte_mix": 1.00},
    {"time": "16:00:00", "phase": "afternoon", "latte_mix": 1.00},
    {"time": "18:00:00", "phase": "evening",   "latte_mix": 1.00},
    {"time": "20:00:00", "phase": "dusk",      "latte_mix": 0.52},
    {"time": "21:00:00", "phase": "night",     "latte_mix": 0.00},
    {"time": "22:00:00", "phase": "night",     "latte_mix": 0.00},
    {"time": "00:00:00", "phase": "night",     "latte_mix": 0.00},
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


# ── Light field ────────────────────────────────────────────────

DEFAULT_STYLE = "eclipse"
PHONE_SIZE = (1170, 2532)


def generate_slot_image(slot, size=(WIDTH, HEIGHT), style=DEFAULT_STYLE):
    palette = palette_for_mix(slot["latte_mix"])
    mask = field(style, *size)
    background = np.array(hex_to_rgb(palette["base"]), dtype=np.uint8)
    foreground = np.array(hex_to_rgb(palette[STYLES[style]]), dtype=np.uint8)
    pixels = np.where(mask[..., None], foreground, background)
    return Image.fromarray(pixels).resize(size, Image.Resampling.NEAREST)


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


def export_phone(style, output_dir):
    output_dir = Path(output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    for theme, mix in (("dark", 0.0), ("light", 1.0)):
        path = output_dir / f"mokka-{style}-iphone-16e-{theme}.png"
        generate_slot_image({"latte_mix": mix}, PHONE_SIZE, style).save(path)
        print(f"  -> {path}")


def generate(style=DEFAULT_STYLE, output_dir=OUTPUT_DIR, png_only=False):
    validate_slots(SLOTS)
    if style not in STYLES:
        raise ValueError(f"unknown style: {style}")
    wallpapper = Path.home() / ".local/bin/wallpapper"
    if not png_only and not wallpapper.is_file():
        raise FileNotFoundError(f"wallpapper binary not found: {wallpapper}")
    output_dir = Path(output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    entries = wallpapper_entries(SLOTS)

    for slot, entry in zip(SLOTS, entries):
        print(f"  [{slot['time']}] {style} latte={slot['latte_mix']:.2f}")
        generate_slot_image(slot, style=style).save(output_dir / entry["fileName"])

    metadata_path = output_dir / "wallpapper.json"
    metadata_path.write_text(json.dumps(entries, indent=2) + "\n")
    if png_only:
        return

    # Only replace the previous HEIC once assembly has succeeded.
    wallpaper_path = output_dir / "mokka.heic"
    pending_path = output_dir / "mokka.pending.heic"
    try:
        subprocess.run(
            [str(wallpapper), "-i", str(metadata_path), "-o", str(pending_path)],
            cwd=output_dir,
            check=True,
        )
        pending_path.replace(wallpaper_path)
    finally:
        pending_path.unlink(missing_ok=True)
    print(f"\n  -> {wallpaper_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--style", choices=STYLES, default=DEFAULT_STYLE)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--png-only", action="store_true", help="skip HEIC assembly")
    parser.add_argument("--phone", action="store_true", help="export portrait dark/light PNGs only")
    args = parser.parse_args()
    if args.phone:
        export_phone(args.style, args.output_dir)
    else:
        generate(args.style, args.output_dir, args.png_only)


if __name__ == "__main__":
    main()
