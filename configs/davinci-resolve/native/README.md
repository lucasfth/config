# CorridorKey 2.0 — native OFX adapter

Original MIT front end for the separately licensed CorridorKey MLX runtime. Not the official CorridorKey plugin or the separately licensed CorridorKey-Runtime wrapper. Model/engine licences remain upstream; see NOTICE.

## Supported native path

- Apple Silicon macOS / Resolve Studio; float32 RGBA CPU images, opaque input, square pixels, full-frame buffers. No tiles.
- Source size up to 8192 per side and 40 million pixels, including 1080p, UHD/DCI 4K, portrait and X-E4-sized developed stills.
- Fit source (default): aspect-preserving fit to 1280x720 with reflected padding, inference using the existing 768x1280 padded profile, crop/unpad and resize foreground/alpha back to source dimensions. This does **not** restore native-4K hair detail.
- Require 1280x720: explicit strict alternative.
- Isotropic preview scale above zero and <=1; grow/shrink and softness scale with preview resolution.
- Explicit display-sRGB, linear-sRGB or Gamma 2.4 with Rec.709 primaries. All inference input components must be finite and within [0,1]. No automatic log/gamut detection or RAW decoding.
- Outputs: model cutout (premultiplied RGBA), matte (opaque grayscale), raw model foreground, despilled foreground, checkerboard. Checkerboard composites in linear light.
- Matte refinement: black/white levels, grow/shrink -20..20 source pixels, softness 0..20 source pixels. White must exceed black. Defaults preserve the original matte.

The model resets every frame. A persistent worker keeps weights loaded, not temporal continuity. No realtime, flicker-reduction or whole-clip equivalence claim. Use a separate display-referred inference branch and apply its matte to the original linear image when preserving HDR/log source colour. A direct MP4 test contained decoded values -0.152..1.131 and correctly failed this strict native input contract; decoding a video does not guarantee [0,1]. Camera-specific transforms, CR3/RAF decoding and representative quality remain separate acceptance checks.

## Deployment and evidence

Nix owns the package and `scripts/install-corridorkey-ofx` installs it at `/Library/OFX/Plugins/CorridorKey2.ofx.bundle`. Source/build/publication and activation are separate. An activation built from old source can reinstall the old 720p-only bundle; compare installed binary/worker to the intended Nix package, not just the package version string.

On 2026-10-26 the installed bundle was found reverted to CK2OFX01. The replacement CK2OFX02 binary and worker were byte-compared to the tested build and its ad-hoc signature verified. A seven-frame synthetic 1920x1080 Resolve Deliver render completed; decoded frames were finite with nontrivial alpha. That repair check establishes functioning output, not independent matte accuracy or camera-footage quality. Native mock-host tests compare actual pixels to direct-worker references at 960x540, 1280x720, 1920x1080, 3840x2160 and 1080x1920, with positive and negative strides.

Earlier four-frame 720p ProRes 4444 checks measured alpha MAE <=0.000259 and premultiplied RGB MAE <=0.00029444. The largest RGB difference against the temporal batch reference was 0.10449 at a semitransparent edge; these workflows are not temporally equivalent. A single 6240x4160 worker-only request measured 1,011,630,080 bytes peak RSS and 13.44 seconds; not a worst-case bound, Resolve memory measurement or performance promise.

The separate single-node macro and render-first temporal bake UI are under development in another worktree. They are not supplied or qualified by this native-resolution publication. Do not infer Inspector/button acceptance from backend tests.

## Runtime and protocol

Runtime: `~/Library/Application Support/CorridorKey-Resolve`; requires its licensed `ready.json` setup, pinned Python environment and model assets. Per-instance worker log: `ofx-worker.log`. Avoid many simultaneous instances on an 18 GB Mac.

Private `CK2OFX02` pipe header is 52 bytes: `<8sIIIIfIIffff` for magic, width, height, screen, output, despill, encoding, policy, black, white, grow, softness. Input/output are source-size top-down float32 RGBA. Reply is uint32 status and length, then pixels or <=4096 UTF-8 error bytes. Version 1 / 32-byte workers are incompatible. Complete header+pixels identify the one cached result. Timeout is 180 seconds. Broken pipes, cancellation and invalid headers stop the worker; restart on next render. Binary stdout is isolated from Python and C-library logging.

## Verification

Use the licensed runtime venv for numerical/model tests:

- `tests/corridorkey-ofx-worker.py`, `tests/corridorkey-ofx-resize.py`: protocol, geometry, gamma, matte controls and checker composition.
- `tests/corridorkey-ofx-inference.py --fixture-root PATH`: real-model cache/order, 720p reference, 1080p/4K and output modes.
- `tests/corridorkey-ofx-resolutions.py --fixture PNG --host HOST --binary OFX`: direct-worker vs dynamically loaded host, both strides and physically reduced preview buffers.
- `tests/corridorkey-ofx-memory.py --fixture PNG --encoding 1 --softness 2`: full-size still worker-only measurement.
- C++ transport, failures and SIGPIPE tests; `tests/corridorkey-ofx-stdout-cache.py`; `tests/corridorkey-ofx-kill.py`.
- `python3 tests/corridorkey-ofx-install.py`: staged installation, read-only source, backups, refusal while Resolve is running, rollback.

The installer must run with Resolve closed. It retains `.corridorkey2-backup.*`, rejects unmanaged collisions, verifies signatures and restores the previous managed bundle on failure. Enter sudo credentials privately; never embed them in scripts. Models are not bundled or unrestricted FOSS: review Corridor Key Licence 2.0 and the upstream terms before setup.
