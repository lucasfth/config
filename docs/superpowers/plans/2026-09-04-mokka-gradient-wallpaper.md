# Mokka Gradient Wallpaper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing sky, sun, atmosphere, and motifs with an approved Catppuccin Latte/Mocha ordered-dot light field that cannot exhibit smooth-gradient banding.

**Architecture:** Keep the single-file Pillow generator and existing HEIC pipeline. Give each time slot explicit palette-mix and shape-evolution values; build an internal blurred control mask, then map its values onto discrete Catppuccin colours across a fixed dot lattice using 4×4 Bayer ordering. Pre-blend each selected accent 55% toward the accent and 45% toward the solid background, producing a muted translucent appearance without rendering an interpolated colour ramp.

**Tech Stack:** Python 3.12, Pillow, standard-library `unittest`, wallpapper CLI

---

### Task 1: Lock the palette and slot contracts

**Files:**
- Create: `scripts/mokka/test_generate.py`
- Modify: `scripts/mokka/generate.py:44-88`

- [ ] Write failing tests proving palette interpolation preserves exact Mocha/Latte endpoints, dawn/dusk mix both palettes, invalid timestamps and mix values fail, and all 12 existing timestamps remain unchanged.
- [ ] Run `python3 -m unittest scripts/mokka/test_generate.py -v`; confirm failures are caused by the missing palette-mix and validation APIs.
- [ ] Replace tuple slots with explicit dictionaries containing `time`, `phase`, `latte_mix`, `scale_x`, `scale_y`, and `intensity`.
- [ ] Add `palette_for_mix(latte_mix)` and `validate_slots(slots)` using `datetime.strptime(..., "%H:%M:%S")` and numeric range checks.
- [ ] Run the focused tests; expect every palette and slot test to pass.

### Task 2: Implement the approved ordered-dot light field

**Files:**
- Modify: `scripts/mokka/test_generate.py`
- Modify: `scripts/mokka/generate.py:102-301`

- [ ] Write failing tests for `generate_slot_image(slot, size)`: RGB mode, requested dimensions, deterministic bytes, output restricted to the solid base plus five background-blended accent colours, and colour-changing dots centred on every point of a regular seven-pixel lattice.
- [ ] Run the focused tests and confirm failure from the old function signature or interpolated output colours.
- [ ] Delete `draw_sky`, `draw_sun_glow`, `draw_atmosphere`, all motif functions/constants, `pick_motifs`, and their dispatch.
- [ ] Add `make_density_mask(size, slot)`: combine three oversized left-of-centre masks, vary dimensions with slot scale, blur internally, and upscale with `LANCZOS`.
- [ ] Add `ordered_dot_colour(...)`: map mask intensity through `surface0`, `blue`, `lavender`, `mauve`, and `rosewater`, using a 4×4 Bayer matrix between adjacent colours.
- [ ] Add `muted_dot_colour(...)`: pre-blend every selected accent 55% toward the accent and 45% toward the active solid background.
- [ ] Add `draw_dot_field(base, palette, slot)`: traverse a seven-pixel lattice without jitter and draw one opaque, fixed-radius, pre-blended dot at every position.
- [ ] Run the focused tests; adjust renderer parameters rather than weakening behavioral assertions.

### Task 3: Wire generation and validate failures

**Files:**
- Modify: `scripts/mokka/test_generate.py`
- Modify: `scripts/mokka/generate.py:304-334`

- [ ] Write a failing test proving wallpapper metadata contains exactly 12 entries, keeps the original timestamps, marks only the first primary, and produces the expected filenames.
- [ ] Add `wallpapper_entries(slots)` and call `validate_slots(SLOTS)` before rendering.
- [ ] Update `generate()` to consume slot dictionaries and the new image API.
- [ ] Check `~/.local/bin/wallpapper` explicitly and raise `FileNotFoundError` before subprocess execution when absent.
- [ ] Run `python3 -m unittest scripts/mokka/test_generate.py -v`; expect all tests to pass without warnings.

### Task 4: Generate and review without activation

**Files:**
- Generated: `scripts/mokka/output/*.png`
- Generated: `scripts/mokka/output/wallpapper.json`
- Generated: `scripts/mokka/output/mokka.heic`

- [ ] Run `MOKKA_SEED=20260904 python3 scripts/mokka/generate.py`; expect 12 frames and a non-empty HEIC.
- [ ] Verify metadata contains 12 entries and every referenced PNG plus `mokka.heic` is non-empty.
- [ ] Visually inspect 06:00 mixed dawn, 12:00 Latte, 20:00 mixed dusk, and 21:00 Mocha.
- [ ] Confirm output uses only the solid base and five discrete muted dot colours on a symmetrical lattice, has consistent left-of-centre colour progression and lavender identity in both palettes, shows no banding, and evolves gently between adjacent frames.
- [ ] Present previews for Lucas's approval. Do not run `nrs`, `darwin-rebuild`, AppleScript, or otherwise activate the wallpaper without explicit approval.
