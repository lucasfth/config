# Mokka — Dynamic Wallpaper Generator

**Date:** 2026-07-29
**Status:** design-approved

## Overview

A procedurally generated macOS dynamic wallpaper (`.heic`) that shifts through Catppuccin Mocha tones across the day. Three composited layers: smooth time-driven gradients, procedural noise grain, and randomly-mixed geometric motifs (Aerospace tiles, Nix snowflakes, constellation nodes). Zero runtime overhead — macOS Dynamic Desktop handles transitions natively.

## Visual Design

### Three-layer composition

| Layer | Content | Behavior |
|-------|---------|----------|
| 1 | Smooth Catppuccin gradient | Palette shifts from cool mauve (dawn) → sky/sapphire (noon) → warm peach/rosewater (dusk) → deep base #1e1e2e (night) |
| 2 | Procedural noise grain | Perlin/simplex noise at low opacity. ~3% during daytime slots, ramps to ~8% during night slots |
| 3 | Motif mix | Per time slot, randomly includes 1–2 of: Aerospace-like tile outlines (sapphire/mauve borders), Nix snowflake shapes (sparse, scattered), constellation node networks (dots + thin connecting lines) |

### Time slots (12 images)

```
04:00 → 06:00 → 08:00 → 10:00 → 12:00 → 14:00 → 16:00 → 18:00 → 20:00 → 21:00 → 22:00 → 00:00
```

- **Day phase (06:00–20:00):** Lighter base tones, higher contrast motifs
- **Night phase (21:00–04:00):** Deep mocha base (#1e1e2e family), motifs at lower opacity with subtle glow
- **Transitions:** macOS blends smoothly between adjacent time slots
- **Dark/light schedule:** Respected automatically — the system's own appearance schedule determines when dark mode applies; wallpaper time slots align naturally

### Motif randomization

On each generation run, each of the 12 time slots randomly selects 1 or 2 motifs from the pool of 3 (Aerospace tiles, Nix snowflakes, constellation). This means each `nrs` produces a unique wallpaper — variety across both time and rebuilds. The random seed is optionally controllable for reproducibility.

### Resolution

Targets the current display resolution at generation time. Default: 3024×1964 (MacBook Pro 14" Retina). Configurable.

## Technical Architecture

### Pipeline

```
generate.py (Python + Pillow)
  → 12 PNG images (one per time slot)
  → wallpapper.json (time metadata)
  → wallpapper CLI (Brew formula)
  → mokka.heic (native macOS dynamic wallpaper)
```

### Dependencies

- **Python 3** + `Pillow` (image generation, noise, compositing)
- **wallpapper** (Swift CLI, via Homebrew — add to `nix/darwin/homebrew/brews.nix`)

### File layout in config repo

```
scripts/mokka/
  generate.py          # main generator
  output/              # generated PNGs + .heic (gitignored)
Pictures/wallpapers/
  mokka.heic           # target — copied here by activation script after generation
```

### Generator script (`generate.py`)

Responsibilities:
1. Accept display resolution (or default to 3024×1964)
2. For each of 12 time slots:
   - Compute gradient colors based on time-of-day position
   - Render base gradient (Pillow linear/radial gradient)
   - Overlay procedural noise grain at time-appropriate opacity
   - Randomly select 1–2 motifs, render at low opacity
   - Save PNG
3. Write `wallpapper.json` with time metadata
4. Invoke `wallpapper -i wallpapper.json -o mokka.heic`

### Color mapping by time

| Time | Base tone | Accent hints |
|------|-----------|-------------|
| 04:00 | #1e1e2e → #313244 | Subtle mauve horizon |
| 06:00 | #313244 → #585b70 | Mauve + lavender glow |
| 08:00 | #45475a → #7f849c | Sapphire sky |
| 10:00 | #585b70 → #bac2de | Sky + blue |
| 12:00 | #7f849c → #cdd6f4 | Brightest, cool blue-white |
| 14:00 | #9399b2 → #f2d5cf | Warming toward peach |
| 16:00 | #a6adc8 → #fab387 | Peach dominant |
| 18:00 | #bac2de → #eba0ac | Rosewater + maroon |
| 20:00 | #585b70 → #f38ba8 | Warm dusk tones |
| 21:00 | #45475a → #313244 | Darkening, warm remnants |
| 22:00 | #313244 → #1e1e2e | Cool night |
| 00:00 | #1e1e2e → #11111b | Deepest, minimal contrast |

All colors from the Catppuccin Mocha palette as defined in `starship.toml`.

## Nix Integration

### Activation hook

In `nix/darwin/dotfiles.nix` (or a new activation script), add a step that:
1. Runs `python3 scripts/mokka/generate.py` (produces `scripts/mokka/output/mokka.heic`)
2. Copies `mokka.heic` to `~/Pictures/wallpapers/mokka.heic`

Regeneration on `nrs`. The copy overwrites in-place so macOS maintains the wallpaper reference.

### wallpapper availability

Add to `nix/darwin/homebrew/brews.nix`:
```nix
"mczachurski/wallpapper/wallpapper"
```

### First-time setup

User manually sets `~/Pictures/wallpapers/mokka.heic` as wallpaper in System Settings. macOS remembers the path — in-place regeneration preserves the setting. If macOS does not pick up file changes automatically, re-selecting the file is the fallback.

## Non-goals

- No live animation (particles, real-time rendering) — zero runtime overhead is the priority
- No external image assets — everything is procedurally generated
- No configuration UI — parameters are in the Python script
- No multi-monitor awareness beyond generating at primary display resolution

## Acceptance criteria

1. `python3 scripts/mokka/generate.py` produces a valid `mokka.heic`
2. Setting it as macOS wallpaper shows time-based transitions in System Settings preview
3. Generated images visibly differ between day and night slots
4. Motif randomization produces varied output across runs
5. Wallpaper respects system appearance schedule (dark mode at 21:00, light at 06:00) — verified by observing the wallpaper at the transition boundary
6. `nrs` regenerates the wallpaper
