---
name: mokka-wallpaper
description: Use when modifying the Mokka procedural dynamic wallpaper generator — adding motifs, changing palettes, adjusting time slots, fixing generation or reload issues. Covers generate.py, activation hook, flag-based reload mechanism, and wallpapper binary management.
tags: [mokka, wallpaper, nix, catppuccin, macos]
---

# Mokka Wallpaper System

Procedurally generated Catppuccin dynamic wallpaper for macOS. Python script generates 12 time-slot PNGs composited from gradient + grain + motifs, assembles into native `.heic` via wallpapper, reloads on `nrs` via a flag-based `.zshrc` hook.

## Architecture

```
nrs → darwin-rebuild switch
  ├── system activation
  └── user activation
        └── generateMokka (home.activation, entryAfter writeBoundary)
              ├── python3 scripts/mokka/generate.py  → output/mokka.heic
              ├── cp → ~/Pictures/wallpapers/mokka-<timestamp>.heic
              └── touch ~/.mokka-reload
  → exec zsh (rebuild function)
        └── .zshrc sources init.nix
              └── sees ~/.mokka-reload → osascript sets latest wallpaper → rm flag
```

## Files

| File | Role |
|------|------|
| `scripts/mokka/generate.py` | Core generator: layers, motifs, time slots, wallpapper invocation |
| `scripts/mokka/.gitignore` | Ignores `output/` |
| `nix/common/dotfiles.nix` | Activation hook `generateMokka` |
| `nix/common/shell/init.nix` | `.zshrc` flag check for wallpaper reload |
| `nix/common/packages/languages.nix` | `pillow` in `python312.withPackages` |
| `~/.local/bin/wallpapper` | Compiled Swift binary (not Brew — formula broken) |

## Flag-Based Reload (Critical)

**NEVER** try to reload wallpaper from activation script. Activation context lacks TCC permissions for osascript, and `set -euo pipefail` kills the script on failure.

**ALWAYS** use the flag pattern:
1. Activation: `touch ~/.mokka-reload` (after generating + copying .heic)
2. `.zshrc` (init.nix): on shell start, check flag → osascript sets latest → delete flag

This runs AFTER `exec zsh` restarts the shell, in terminal context where osascript has permissions.

## generate.py Structure

5 layers per time slot:
1. `draw_sky()` — vertical gradient, palette-aware (MOCHA vs LATTE)
2. `draw_sun_glow()` — concentric ellipses at sun position
3. `draw_atmosphere()` — vignette + ambient glow orbs
4. `apply_grain()` — tiled noise texture, opacity by phase
5. Motifs (1-2 randomly selected): terminal, snowflakes, constellation

**Palettes:** `MOCHA` (dark, #1e1e2e) and `LATTE` (light, #eff1f5). Day phases → Latte, night/dawn/dusk → Mocha.

**Time slots:** `SLOTS` list — `(HH:MM:SS, phase, glow_x, glow_y, glow_color, palette_id)`. Glow tracks sun across sky.

## Adding a Motif

1. Add `draw_<name>(draw, w, h, pal)` — `pal` is the active dict (MOCHA or LATTE), use `pal[key]` for colors
2. Add to `pick_motifs()` pool
3. Add to dispatch dict in `generate_slot_image()`

## wallpapper Binary

- **NOT from Brew** — `depends_on macos: :mojave` removed from Homebrew
- Build from source: `git clone`, `swift build -c release`, copy to `~/.local/bin/wallpapper`
- `generate.py` uses absolute path `os.path.expanduser("~/.local/bin/wallpapper")`
- Requires `HH:MM:SS` time format

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| No reload after nrs | Activation script exited early | Check for errors in nrs output. Check `~/.mokka-reload` exists |
| `FileNotFoundError: wallpapper` | Binary not installed or wrong path | `ls ~/.local/bin/wallpapper`. Rebuild from source if missing |
| `Cannot decode date string` | Time format missing seconds | Use `HH:MM:SS` in SLOTS |
| `ModuleNotFoundError: PIL` | Pillow not in Nix | Check `languages.nix` has `pillow` |
| Wallpaper flickers then reverts | Something fighting the flag approach | Ensure `rebuild()` in init.nix does NOT set wallpaper |
