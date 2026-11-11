# Mokka wallpapers

CPU-rendered, edge-cropped Catppuccin wallpapers. **Eclipse** is the default;
`--style` also accepts `blackhole-circle`, `orbital-horizon` and `torus`.
No browser, image model, GPU service or animated desktop process is needed.

## Generate locally

Requires Python 3.12, Pillow and NumPy. The Home Manager activation hook declares
its own `python312.withPackages (ps: [ps.pillow ps.numpy])` interpreter; the normal
shell Python environment also includes both dependencies.

```bash
# Twelve 3024×1964 frames + time-based dynamic HEIC (macOS):
python3 scripts/mokka/generate.py

# Another style, keeping it separate from the default output:
python3 scripts/mokka/generate.py --style torus --output-dir /tmp/mokka-torus

# Portable PNGs only; no wallpapper binary required:
python3 scripts/mokka/generate.py --style orbital-horizon --png-only \
  --output-dir /tmp/mokka-horizon

# Recompose for iPhone 16e, rather than cropping the desktop image:
python3 scripts/mokka/generate.py --style eclipse --phone \
  --output-dir ~/Downloads/mokka-phone

python3 -m unittest scripts.mokka.test_generate -v
```

Phone exports are `mokka-<style>-iphone-16e-{dark,light}.png` at 1170×2532.
Generated images belong outside Git; `output/` is ignored. Reusing an output
directory replaces that directory's generated frames. Use separate directories
for different studies. HEIC assembly replaces a previous HEIC only after success.

The twelve original timestamps and Mocha/Latte blend values are preserved.
Geometry stays fixed between frames: dawn/dusk change the palette, not the
figure's placement. This is **time-based**, not an OS dark-mode toggle listener.
Finite corona falloffs remove detached halos; deliberate fine dithering remains.

## Deployment ownership

`nix/common/dotfiles.nix` runs the default generator for the laptop and Gimle
**during an approved Home Manager/system activation**. It copies `output/mokka.heic`
to a timestamped file under `~/Pictures/wallpapers/`, then touches
`~/.mokka-reload`. `nix/common/shell/init.nix` consumes that flag from a terminal
shell to set the wallpaper. Never run osascript inside the activation hook.

HEIC assembly requires the existing source-built `~/.local/bin/wallpapper` binary.
Generating files manually does not set a wallpaper, write a reload flag, activate
Nix, or transfer anything to another device. Linux can consume the PNGs, but its
automatic switching is not wired here. iPhone installation/switching is manual.
Keep the previous timestamped wallpaper for rollback.

## Attribution

`studies.py` adapts pattern formulas from
[Astrobubu/dithering-shader](https://github.com/Astrobubu/dithering-shader), MIT;
see [LICENSE-Astrobubu.txt](LICENSE-Astrobubu.txt). They are cleaned-up static CPU
adaptations, not pixel-identical WebGL screenshots.
