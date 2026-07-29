# Mokka Dynamic Wallpaper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a procedural macOS dynamic wallpaper generator that produces a Catppuccin Mocha-themed `.heic` with time-of-day gradient shifts, noise grain, and randomized geometric motifs.

**Architecture:** A Python script generates 12 PNG images (one per time slot), composes three layers (gradient, grain, motifs), then invokes `wallpapper` to assemble them into a native `.heic` dynamic wallpaper. An `nrs` activation hook regenerates on rebuild.

**Tech Stack:** Python 3 + Pillow, wallpapper (Brew), Nix home-manager activation

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `nix/darwin/homebrew/brews.nix` | Modify | Add wallpapper Brew formula |
| `nix/common/packages/languages.nix` | Modify | Add `pillow` to Python packages |
| `scripts/mokka/generate.py` | Create | Core generator script |
| `scripts/mokka/.gitignore` | Create | Ignore generated output |
| `nix/common/dotfiles.nix` | Modify | Add mokka activation hook |

---

### Task 1: Add wallpapper Brew formula

**Files:**
- Modify: `nix/darwin/homebrew/brews.nix`

- [ ] **Step 1: Add wallpapper to brews list**

```nix
# Add to homebrew.brews list:
"mczachurski/wallpapper/wallpapper"
```

- [ ] **Step 2: Rebuild to install**

Run: `nrs`
Expected: `wallpapper` available at `/opt/homebrew/bin/wallpapper`

- [ ] **Step 3: Verify wallpapper works**

Run: `wallpapper -h`
Expected: Help output with `-i`, `-o`, `-e` flags

---

### Task 2: Add Pillow to Nix Python packages

**Files:**
- Modify: `nix/common/packages/languages.nix`

- [ ] **Step 1: Add pillow to python312.withPackages**

```nix
# In languages.nix, add to the python312.withPackages list:
(python312.withPackages (ps: with ps; [
  pip
  virtualenv
  jupyterlab
  numpy
  pillow
]))
```

- [ ] **Step 2: Rebuild to install**

Run: `nrs`
Expected: `python3 -c "from PIL import Image; print('ok')"` prints `ok`

---

### Task 3: Create generator script — scaffolding, palette, gradient layer

**Files:**
- Create: `scripts/mokka/generate.py`
- Create: `scripts/mokka/.gitignore`

- [ ] **Step 1: Create directory and .gitignore**

```bash
mkdir -p scripts/mokka
```

```gitignore
# scripts/mokka/.gitignore
output/
```

- [ ] **Step 2: Write generate.py — palette, time slots, config**

```python
#!/usr/bin/env python3
"""Mokka — procedurally generated Catppuccin Mocha dynamic wallpaper."""

import json
import math
import os
import random
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

# ── Configuration ─────────────────────────────────────────────

WIDTH = 3024
HEIGHT = 1964
OUTPUT_DIR = Path(__file__).parent / "output"

# Catppuccin Mocha palette (hex strings for Pillow)
PALETTE = {
    "base":      "#1e1e2e",
    "crust":     "#11111b",
    "mantle":    "#181825",
    "surface0":  "#313244",
    "surface1":  "#45475a",
    "surface2":  "#585b70",
    "overlay0":  "#6c7086",
    "overlay1":  "#7f849c",
    "overlay2":  "#9399b2",
    "subtext0":  "#a6adc8",
    "subtext1":  "#bac2de",
    "text":      "#cdd6f4",
    "rosewater": "#f5e0dc",
    "flamingo":  "#f2cdcd",
    "pink":      "#f5c2e7",
    "mauve":     "#cba6f7",
    "maroon":    "#eba0ac",
    "red":       "#f38ba8",
    "peach":     "#fab387",
    "yellow":    "#f9e2af",
    "green":     "#a6e3a1",
    "teal":      "#94e2d5",
    "sky":       "#89dceb",
    "sapphire":  "#74c7ec",
    "blue":      "#89b4fa",
    "lavender":  "#b4befe",
}

# Time slots: (HH:MM, phase)
SLOTS = [
    ("04:00", "night"),
    ("06:00", "dawn"),
    ("08:00", "morning"),
    ("10:00", "morning"),
    ("12:00", "noon"),
    ("14:00", "afternoon"),
    ("16:00", "afternoon"),
    ("18:00", "evening"),
    ("20:00", "dusk"),
    ("21:00", "night"),
    ("22:00", "night"),
    ("00:00", "night"),
]

# Phase → (top_color, bottom_color) for gradient
GRADIENTS = {
    "night":     ("crust",    "base"),
    "dawn":      ("surface0", "surface2"),
    "morning":   ("surface1", "overlay1"),
    "noon":      ("overlay1", "subtext1"),
    "afternoon": ("subtext0", "rosewater"),
    "evening":   ("overlay1", "peach"),
    "dusk":      ("surface2", "maroon"),
}

# Grain opacity by phase (higher at night)
GRAIN_ALPHA = {
    "night":     0.08,
    "dawn":      0.05,
    "morning":   0.03,
    "noon":      0.02,
    "afternoon": 0.03,
    "evening":   0.04,
    "dusk":      0.06,
}

# Motif colors: which palette keys to use for each motif type
TILE_COLORS = ["sapphire", "mauve"]
SNOWFLAKE_COLORS = ["green", "lavender", "blue"]
CONSTELLATION_COLORS = ["peach", "sapphire", "rosewater"]
```

- [ ] **Step 3: Write gradient rendering function**

```python
def draw_gradient(img, top_key, bottom_key):
    """Draw a vertical linear gradient using Catppuccin palette keys."""
    draw = ImageDraw.Draw(img)
    tc = hex_to_rgb(PALETTE[top_key])
    bc = hex_to_rgb(PALETTE[bottom_key])
    # Precompute color for each row (faster than per-pixel)
    for y in range(img.height):
        t = y / (img.height - 1) if img.height > 1 else 0
        # Ease: slight curve for smoother feel
        t = t ** 0.85
        r = int(tc[0] + (bc[0] - tc[0]) * t)
        g = int(tc[1] + (bc[1] - tc[1]) * t)
        b = int(tc[2] + (bc[2] - tc[2]) * t)
        draw.line([(0, y), (img.width, y)], fill=(r, g, b))


def hex_to_rgb(h):
    """Convert '#1e1e2e' to (30, 30, 46)."""
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
```

- [ ] **Step 4: Test gradient generation**

Run: `python3 -c "
import sys; sys.path.insert(0, 'scripts/mokka')
from generate import draw_gradient, PALETTE
from PIL import Image
img = Image.new('RGB', (400, 300))
draw_gradient(img, 'crust', 'subtext1')
img.save('/tmp/test_gradient.png')
print('saved to /tmp/test_gradient.png')
"`
Expected: Image file created — inspect visually for smooth vertical gradient from dark to light.

---

### Task 4: Write noise grain layer

**Files:**
- Modify: `scripts/mokka/generate.py`

- [ ] **Step 1: Add grain texture generator**

```python
def make_grain_texture(size=256):
    """Generate a tileable noise grain texture (grayscale)."""
    # Generate random noise
    grain = Image.new("L", (size, size))
    pixels = grain.load()
    rng = random.Random(42)  # fixed seed for consistent texture shape
    for y in range(size):
        for x in range(size):
            pixels[x, y] = rng.randint(0, 255)
    # Blur for organic feel
    grain = grain.filter(ImageFilter.GaussianBlur(radius=1.5))
    return grain


def apply_grain(base_img, grain_texture, alpha):
    """Tile grain texture over base image at given alpha."""
    # Tile to match base dimensions
    tiled = Image.new("L", base_img.size)
    gw, gh = grain_texture.size
    for y in range(0, base_img.height, gh):
        for x in range(0, base_img.width, gw):
            tiled.paste(grain_texture, (x, y))
    # Convert grayscale to RGBA with alpha
    grain_rgba = Image.new("RGBA", base_img.size, (0, 0, 0, 0))
    grain_rgba.putalpha(tiled.point(lambda v: int(v * alpha)))
    # Composite
    base_rgba = base_img.convert("RGBA")
    result = Image.alpha_composite(base_rgba, grain_rgba)
    return result.convert("RGB")
```

- [ ] **Step 2: Test grain layer**

Run: `python3 -c "
import sys; sys.path.insert(0, 'scripts/mokka')
from generate import *
from PIL import Image
img = Image.new('RGB', (400, 300))
draw_gradient(img, 'base', 'surface2')
gt = make_grain_texture()
result = apply_grain(img, gt, 0.08)
result.save('/tmp/test_grain.png')
print('saved to /tmp/test_grain.png')
"`
Expected: Image with visible grain texture over gradient.

---

### Task 5: Write motif rendering — Aerospace tiles

**Files:**
- Modify: `scripts/mokka/generate.py`

- [ ] **Step 1: Add tile motif function**

```python
def draw_aerospace_tiles(draw, width, height):
    """Draw 3-5 floating rectangles with sapphire/mauve borders."""
    count = random.randint(3, 5)
    for _ in range(count):
        x = random.randint(80, width - 400)
        y = random.randint(80, height - 280)
        w = random.randint(200, 600)
        h = random.randint(150, 400)
        color = PALETTE[random.choice(TILE_COLORS)]
        # Border only, semi-transparent
        draw.rectangle([x, y, x + w, y + h], outline=color, width=2)
```

---

### Task 6: Write motif rendering — Nix snowflakes

**Files:**
- Modify: `scripts/mokka/generate.py`

- [ ] **Step 1: Add snowflake motif function**

```python
def draw_snowflakes(draw, width, height):
    """Draw 5-10 sparse geometric snowflake shapes."""
    count = random.randint(5, 10)
    color = PALETTE[random.choice(SNOWFLAKE_COLORS)]
    for _ in range(count):
        cx = random.randint(100, width - 100)
        cy = random.randint(100, height - 100)
        size = random.randint(15, 50)
        # 6-pointed asterisk
        for angle_deg in range(0, 360, 60):
            rad = math.radians(angle_deg)
            dx = size * math.cos(rad)
            dy = size * math.sin(rad)
            # Main arm
            draw.line(
                [(cx, cy), (cx + dx, cy + dy)],
                fill=color, width=2
            )
            # Small branch at 60% point
            mx = cx + dx * 0.6
            my = cy + dy * 0.6
            bx = size * 0.25 * math.cos(rad + math.pi / 2.5)
            by = size * 0.25 * math.sin(rad + math.pi / 2.5)
            draw.line(
                [(mx, my), (mx + bx, my + by)],
                fill=color, width=1
            )
```

---

### Task 7: Write motif rendering — Constellation nodes

**Files:**
- Modify: `scripts/mokka/generate.py`

- [ ] **Step 1: Add constellation motif function**

```python
def draw_constellation(draw, width, height):
    """Draw 5-10 dots connected by thin lines (constellation/network)."""
    count = random.randint(5, 10)
    color = PALETTE[random.choice(CONSTELLATION_COLORS)]
    points = [
        (random.randint(100, width - 100), random.randint(100, height - 100))
        for _ in range(count)
    ]
    max_dist = min(width, height) * 0.35
    # Connect nearby points
    for i, p1 in enumerate(points):
        for j, p2 in enumerate(points):
            if j <= i:
                continue
            if math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < max_dist:
                draw.line([p1, p2], fill=color, width=1)
    # Draw node dots
    for x, y in points:
        draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=color)
```

---

### Task 8: Write time slot loop, motif randomization, wallpapper integration

**Files:**
- Modify: `scripts/mokka/generate.py`

- [ ] **Step 1: Add per-slot image generator**

```python
def generate_slot_image(phase, motifs):
    """Generate one time-slot image with all layers."""
    img = Image.new("RGB", (WIDTH, HEIGHT))
    top_key, bottom_key = GRADIENTS[phase]
    # Layer 1: gradient
    draw_gradient(img, top_key, bottom_key)
    # Layer 2: grain
    grain_tex = make_grain_texture()
    img = apply_grain(img, grain_tex, GRAIN_ALPHA[phase])
    # Layer 3: motifs (randomized per slot)
    # Use a new ImageDraw since we modified img
    motif_img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    motif_draw = ImageDraw.Draw(motif_img)
    motif_opacity = 0.15 if phase in ("night",) else 0.12
    for motif in motifs:
        if motif == "tiles":
            draw_aerospace_tiles(motif_draw, WIDTH, HEIGHT)
        elif motif == "snowflakes":
            draw_snowflakes(motif_draw, WIDTH, HEIGHT)
        elif motif == "constellation":
            draw_constellation(motif_draw, WIDTH, HEIGHT)
    # Reduce opacity of motif layer
    alpha = motif_img.split()[-1].point(lambda v: int(v * motif_opacity))
    motif_rgba = Image.merge("RGBA", (*motif_img.split()[:3], alpha))
    base_rgba = img.convert("RGBA")
    img = Image.alpha_composite(base_rgba, motif_rgba).convert("RGB")
    return img


def pick_motifs():
    """Randomly select 1 or 2 motifs from the pool."""
    pool = ["tiles", "snowflakes", "constellation"]
    count = random.randint(1, 2)
    return random.sample(pool, count)
```

- [ ] **Step 2: Add main generation function**

```python
def generate():
    """Generate all 12 time-slot images and assemble .heic."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    wallpapper_json = []
    for i, (time_str, phase) in enumerate(SLOTS):
        motifs = pick_motifs()
        print(f"  [{time_str}] {phase:9s}  motifs: {motifs}")
        img = generate_slot_image(phase, motifs)
        filename = f"{i:02d}_{time_str.replace(':', '')}.png"
        img.save(OUTPUT_DIR / filename)
        entry = {
            "fileName": filename,
            "time": time_str,
        }
        if i == 0:
            entry["isPrimary"] = True
        wallpapper_json.append(entry)
    # Write wallpapper.json
    json_path = OUTPUT_DIR / "wallpapper.json"
    with open(json_path, "w") as f:
        json.dump(wallpapper_json, f, indent=2)
    # Run wallpapper
    heic_path = OUTPUT_DIR / "mokka.heic"
    subprocess.run(
        ["wallpapper", "-i", str(json_path), "-o", str(heic_path)],
        cwd=OUTPUT_DIR,
        check=True,
    )
    print(f"\n  → {heic_path}")


if __name__ == "__main__":
    seed = int(os.environ.get("MOKKA_SEED", random.randint(0, 2**31)))
    random.seed(seed)
    print(f"Mokka seed: {seed}")
    generate()
```

- [ ] **Step 3: Test full generation**

Run: `python3 scripts/mokka/generate.py`
Expected: 12 PNGs + `mokka.heic` in `scripts/mokka/output/`. Inspect a few PNGs.

- [ ] **Step 4: Verify .heic is valid dynamic wallpaper**

Run: `wallpapper -e scripts/mokka/output/mokka.heic`
Expected: Metadata dump showing 12 time entries with correct times.

---

### Task 9: Add Nix activation hook

**Files:**
- Modify: `nix/common/dotfiles.nix`

- [ ] **Step 1: Add mokka generation to home.activation**

```nix
# In nix/common/dotfiles.nix, add after the existing home.file block,
# inside the main { config, pkgs, lib, flakeDir, ... }: { ... } attrset:

home.activation.generateMokka = lib.hm.dag.entryAfter ["writeBoundary"] ''
  $DRY_RUN_CMD ${pkgs.writeShellScript "generate-mokka" ''
    set -euo pipefail
    SCRIPT="$HOME/config/scripts/mokka/generate.py"
    OUTPUT="$HOME/config/scripts/mokka/output/mokka.heic"
    TARGET="$HOME/Pictures/wallpapers/mokka.heic"
    if [ -f "$SCRIPT" ]; then
      echo "Mokka: generating dynamic wallpaper..."
      ${pkgs.python312.withPackages (ps: [ ps.pillow ])}/bin/python3 "$SCRIPT"
      echo "Mokka: copying to $TARGET"
      mkdir -p "$(dirname "$TARGET")"
      cp "$OUTPUT" "$TARGET"
      echo "Mokka: done"
    fi
  ''}
'';
```

Note: This references `flakeDir` which should already be in scope. If `flakeDir` is not available, use `"$HOME/config"` directly as the path base.

- [ ] **Step 2: Rebuild**

Run: `nrs`
Expected: Output includes "Mokka: generating dynamic wallpaper..." and "Mokka: done"

- [ ] **Step 3: Verify .heic is at target**

Run: `ls -la ~/Pictures/wallpapers/mokka.heic`
Expected: File exists, recent timestamp.

---

### Task 10: End-to-end verification

- [ ] **Step 1: Open System Settings → Wallpaper**

Open System Settings → Wallpaper → Add Photo → select `~/Pictures/wallpapers/mokka.heic`

- [ ] **Step 2: Verify dynamic preview**

In the wallpaper picker, the preview should show "Dynamic" badge and time-based thumbnail scrubbing.

- [ ] **Step 3: Spot-check time slots**

In System Settings → Wallpaper, hover over the mokka thumbnail. macOS shows a time-of-day preview slider. Verify:
- 04:00: dark (crust/base)
- 12:00: bright (overlay/subtext)
- 21:00: dark (base tones)
- Motifs visible at varying opacities

- [ ] **Step 4: Verify rebuild regeneration**

Run: `nrs`
Expected: "Mokka: generating..." in output. New seed produces different motif layout.

- [ ] **Step 5: Verify no runtime overhead**

Check Activity Monitor — no extra processes. Wallpaper is static .heic managed by macOS.

---

### Task 11: Cleanup

- [ ] **Step 1: Add `.superpowers/` to .gitignore if not present**

```bash
grep -q '\.superpowers' .gitignore || echo '.superpowers/' >> .gitignore
```

- [ ] **Step 2: Commit**

```bash
git add nix/darwin/homebrew/brews.nix \
        nix/common/packages/languages.nix \
        nix/common/dotfiles.nix \
        scripts/mokka/generate.py \
        scripts/mokka/.gitignore \
        docs/superpowers/specs/2026-07-29-mokka-dynamic-wallpaper-design.md \
        docs/superpowers/plans/2026-07-29-mokka-implementation.md
git commit -m "feat(mokka): procedural Catppuccin dynamic wallpaper generator"
```
