# Mokka Gradient Wallpaper Design

## Goal

Redesign the Mokka dynamic wallpaper around the desktop background visible in the supplied reference: a broad, organic lavender illumination diffused through a neutral field. Preserve Catppuccin Latte and Mocha, the existing 12-frame time cycle, and slight grain. Remove the current illustrative layers.

## Visual System

The wallpaper consists of two rendered layers:

1. One solid Catppuccin base field.
2. A perfectly regular lattice of opaque, fixed-size dots whose colours are pre-blended 55% toward a Catppuccin accent and 45% toward the solid background.

The lattice covers the frame at constant spacing. Dot colour—not dot density, position, or size—changes across the field. The ordered progression uses muted surface, blue, lavender, mauve, and rosewater, with lavender as the visual identity. Pre-blending gives the appearance of translucency while retaining discrete pixels and preventing visible 8-bit gradient banding.

Mocha uses a deep solid field beneath muted pale dots. Latte uses the same geometry over a pale solid field with restrained accent dots.

Remove the current sky gradient, sun, atmosphere orbs, vignette implementation, terminal marks, snowflakes, and constellations. The replacement contains no icons, symbols, or recognisable objects.

## Time Behaviour

Keep all 12 existing HEIC timestamps unchanged.

The composition remains recognisably stable throughout the day. Adjacent frames gently vary the hidden colour field's scale, aspect ratio, intensity, and falloff. Dot geometry remains fixed, and colour assignment is deterministic, so the illumination does not flicker or travel like the current sun.

Morning through evening uses Latte. Night uses Mocha. Dawn and dusk are mixed-palette transitional frames that bridge the light and dark fields without an abrupt tonal jump.

## Rendering

Implement the illumination as deterministic ordered colour dithering in Pillow:

1. Create the palette-appropriate solid base at full output resolution.
2. Build a small grayscale control mask from overlapping oversized shapes.
3. Blur and upscale that internal mask; it controls colour selection only and is never rendered.
4. Traverse a perfectly regular seven-pixel lattice without jitter.
5. Draw an opaque two-pixel dot at every lattice position.
6. Map mask intensity through `surface0`, `blue`, `lavender`, `mauve`, and `rosewater`.
7. Pre-blend the selected accent 55% over the background colour.
8. Use a 4×4 Bayer matrix to alternate adjacent palette colours at transition thresholds.

The output contains only the base and five discrete, background-blended dot colours—no interpolated colour ramp to band. The implementation requires no new dependency and remains deterministic under `MOKKA_SEED`.

## Pipeline and Failure Handling

Preserve the existing PNG generation, `wallpapper` JSON creation, HEIC assembly, activation flag, and shell-based wallpaper reload pipeline.

Generation must fail clearly when `~/.local/bin/wallpapper` is unavailable, a slot has an invalid timestamp or palette mode, an intermediate image cannot be written, or HEIC assembly fails. Do not emit or activate fallback output.

The generator writes all 12 PNG frames before assembling `mokka.heic`. It must not replace the active desktop wallpaper during design verification.

## Verification

Generate the complete 12-frame set with a fixed `MOKKA_SEED` and verify:

- Representative Latte, dawn/dusk transition, and Mocha frames use the approved composition.
- No frame exposes a geometric glow boundary or recognisable ellipse.
- Lavender remains the dominant accent in both palettes.
- Adjacent frames evolve gently without composition jumps.
- Dawn and dusk bridge Latte and Mocha without abrupt tonal changes.
- The rendered image uses only the solid base and five discrete muted dot colours; ordered colour changes provide the perceived falloff without banding.
- The pipeline emits 12 PNGs, valid `wallpapper` metadata, and a non-empty `mokka.heic`.

Generated previews require explicit approval before activating or replacing the current wallpaper.
