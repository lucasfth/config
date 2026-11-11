# Mokka dither integration

Approved scope: replace the ordered-dot field with the four reviewed CPU-rendered
studies: black-hole circle, eclipse, orbital horizon and torus. Use the revised
large, deliberately edge-cropped desktop and portrait compositions. Eclipse is
the default; select another study explicitly with `--style`. Do not rotate between
unrelated shapes during the day.

## Architecture and implementation

- `scripts/mokka/generate.py`: retain palettes, twelve timestamps, metadata names
  and the default `output/mokka.heic` interface consumed by Home Manager. Replace
  the old dot field with deterministic two-color Bayer dithering. Keep geometry
  fixed across time slots; blend palettes using the existing `latte_mix` schedule.
- `scripts/mokka/studies.py`: bounded NumPy field/ray-marching implementation,
  adapted from the approved v2 preview renderer. Tight finite glow falloffs and a
  camera-facing torus opening avoid the original noise blobs and pinched slit.
  Include upstream MIT attribution.
- CLI: `--style`, `--output-dir`, `--png-only`, `--phone` (portrait dark/light
  exports only). No browser, image model, GPU service or new live process.
- `nix/common/dotfiles.nix`: add NumPy to the exact Pillow-only activation Python
  environment. Keep activation guards and flag-based reload unchanged.
- `scripts/mokka/test_generate.py`: preserve palette/timestamp checks; replace
  tests of the retired dot field with checks for deterministic RGB output,
  palette-independent geometry, edge cropping, style validation and CLI exports.
- `scripts/mokka/README.md`: describe generation, phone exports, dependency and
  activation boundaries; link from existing script documentation.

## Acceptance

1. Prove a new style/render check fails against the old generator.
2. Run the tests with the exact Nix `python312.withPackages (ps: [ps.pillow
   ps.numpy])` interpreter resolved from the pinned flake, not an ambient Python.
3. Run the real CLI for every study's PNG output and phone exports. View actual
   generator outputs in both palettes and orientations.
4. Generate a twelve-frame default HEIC using the installed wallpapper binary;
   verify its frame dimensions, metadata inputs and successful assembly.
5. Check the changed Nix expression and diff. No commits, pushes, nrs, wallpaper
   setting, reload flag writes or remote/device activation.

## Rollback and limits

Existing previews under Downloads are untouched. Generate local acceptance
artifacts into a separate output directory. Existing deployed wallpapers remain
unchanged until separately approved activation. Linux gets portable PNGs only;
no Linux automatic theme switch or iOS automatic wallpaper installation is added.
The wallpaper remains time-driven, not driven by the operating system theme.
