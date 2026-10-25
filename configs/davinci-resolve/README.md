# DaVinci Resolve Studio

Nix-darwin owns installation policy in `nix/darwin/davinci-resolve.nix`.
Preferences, licence keys and project libraries are never managed or replaced.
Enabled only on `lucas-macbook-pro`; other Darwin hosts are left untouched.

## Studio 21.1.1

Lucas installed Studio manually during this session. The running application's
API identifies **DaVinci Resolve Studio 21.1.1.10**. The Studio-specific
`com.blackmagic-design.Manifest` receipt and application report 21.1.1; strict
signature verification passed. No licence key is stored in this repository.

`nix/darwin.nix` now enables management and pins the supplied installer:

- Filename: `DaVinci-Resolve-Studio-21.1.1.pkg`
- SHA-256: `sha256-WK7esoMidMzUCb8ceFHwkoUbhLDjFrDHGPymJnpSkt4=`
- Verified Blackmagic installer signature and notarization.
- Verified `Distribution` title and `Manifest.pkg/PackageInfo` Studio receipt.

On a new machine, download the Studio macOS installer from Blackmagic yourself,
extract its PKG, and copy it to the space-free filename above. Then:

```sh
python3 scripts/install-resolve-studio /path/to/DaVinci-Resolve-Studio-21.1.1.pkg
nix hash file /path/to/DaVinci-Resolve-Studio-21.1.1.pkg
nix-store --add-fixed sha256 /path/to/DaVinci-Resolve-Studio-21.1.1.pkg
```

Close Resolve before activation. The helper validates signature, Gatekeeper,
Studio metadata and installed version, refuses free packages/downgrades, and
skips reinstalling an already matching Studio receipt/app. Apple's installer
uses the signed package's default component choices. Keys are entered privately.
A system rollback does not downgrade/uninstall a PKG-installed application.

Setting `installer = null` leaves the installed application untouched. Setting
`enable = false` disables this module's plugin, menu and installer deployment.
Updates require a new explicit version/hash pin and a verified supplied PKG.

## Gyroflow OpenFX 2.1.1

The standalone Homebrew cask and OFX effect are separate. The effect is pinned
from `gyroflow/gyroflow-plugins`; the older `gyroflow/gyroflow-ofx` redirects there.

Nix retains the original signed DMG. Extraction into a normalized Nix output can
lose signature extended attributes, so activation mounts read-only, verifies
Developer ID and Gatekeeper, and copies with `ditto` into
`/Library/OFX/Plugins/Gyroflow.ofx.bundle`. A trap detaches only its own mount.

- Routine rebuilds while Resolve is open warn and defer video installation.
- Identical installs verify and do nothing; unmanaged/modified collisions fail.
- Ownership markers use content hashes, not garbage-collectable store paths.
- Successful upgrades retain `.gyroflow-backup.*` beside the plugin, without
  automatic expiry. Remove manually only after acceptance of the new version.
- Failed final marker writes roll back the old plugin and marker.
- Other OFX plugins are untouched.

Live verification: strict signature passed; Resolve registered `ofx.xyz.gyroflow`
and successfully instantiated the Fusion tool with its Gyroflow controls.
**Stabilization with a real `.gyroflow` project and a completed render is still
unverified.** A standalone Fusion Saver control failed even without Gyroflow,
so that experiment cannot diagnose a plugin fault. No successful render is claimed.

Use **Effects → Open FX → Gyroflow**, then load the matching video/`.gyroflow`
project. The standalone app creates motion/lens settings; installation alone
cannot provide those for arbitrary footage.

## CorridorKey 2.0: custom batch menu

This is **not a live OFX effect**. The official paid Mac OFX plugin at
<https://corridorkey.com> is not purchased or installed. Lucas explicitly chose
the community batch bridge and accepted its model licence on 2026-10-24.

Nix/Home Manager deploys **Workspace → Scripts → Utility → CorridorKey 2.0**.
Menu deployment needs activation; restart Resolve if the new entry is not listed.
Errors and output paths appear in **Workspace → Console → Python 3**. The menu
blocks while processing: do not switch projects or selections during the job.

1. Select exactly one source clip in the Media Pool, not the timeline.
2. Input must be **1280×720**, progressive, square-pixel, constant-frame-rate,
   explicitly tagged display-referred **sRGB** (`iec61966-2-1`). Unknown transfer,
   HDR, other sizes and image sequences are refused. Export a separate supported
   copy; the bridge does not silently resize or change production colour.
3. Run the menu. A new private job directory is created in `~/Movies/CorridorKey`.
4. Only the transparent **cutout** sequence is imported, into a new named bin,
   with verified FPS and **Straight** alpha. The separate RGB matte stays on disk.
   Original media, existing bins/clips, audio and timelines are unchanged.

Output is numbered 16-bit PNGs plus manifest, benchmark and inference log. Failed
jobs are never imported; failures preserve their outputs. Audio is not copied.
Only the FP16 `768x1280-t1` model and temporal chunk/stride 1/1 are supported.
Native 4K, HDR/EXR, temporal blending and live playback are not implemented.

### Runtime and reproducibility

The local runtime (about 3.2 GB) is separate from Nix and Resolve's Python:
`~/Library/Application Support/CorridorKey-Resolve`. Nix owns the menu/worker and
absolute ffprobe path; it never downloads weights or accepts licences on rebuild.

```sh
python3 scripts/setup-corridorkey-resolve --accept-model-license
```

Setup refuses an existing runtime; preserve it and choose `--runtime` for a
separate rebuild. It hash-checks dependencies, source and every model file.
Code/NOTICE/provenance and weight licence are retained in the runtime.

- Community engine: `peterteravskis/corridorkey-v2-mlx`, commit
  `74065491ebd2eddea494ab34c15a6d84d7415353`.
- FP16 weights: `cdelta/CorridorKey-v2-MLX-fp16`, revision
  `3c75d4756579e2bdd21307c64a1af381bde1cdc1`.
- Python 3.12.11; dependency hashes in `requirements.txt`, model hashes in
  `corridorkey-models.json`. Regenerate on the same Apple Silicon Mac:

```sh
uv pip compile configs/davinci-resolve/requirements.in \
  --python "$HOME/Library/Application Support/CorridorKey-Resolve/venv/bin/python" \
  --generate-hashes --no-annotate --no-header \
  -o configs/davinci-resolve/requirements.txt
```

Code is Apache-2.0, but weights use **Corridor Key Licence 2.0**, supplementing
CC BY-NC-SA 4.0: no paid inference service, attribution/free-access/share-alike
conditions, and seats for organisations above US $20M gross revenue. Commercial
software integration may require a separate agreement. Foundation licences apply.
This is not unrestricted FOSS; see the actual retained licence before reuse.

### Verification and remaining acceptance

A durable four-frame fixture completed inference, verified 1280×720 16-bit output,
and imported into Studio as online clips at 24000/1001 FPS. The cutout's Straight
alpha was read back. The earlier test bin `CorridorKey-Fixture-60bb260a` in `hugi`
contains both cutout and matte; subsequent imports are cutout-only. No existing
timeline was edited. The scratch standalone composition was closed; its failed
render artifact is retained under `~/Movies/CorridorKey-Fixture-Tests/render-checks`.

**Full menu invocation and final compositing/render acceptance remain pending.**
During later checks the external API returned no save success and refused a new
bin. No timeline or Deliver job was created. Save `hugi` manually and return to
Project Manager before another disposable-project check. `check_resolve_bridge.py`
refuses to leave any loaded project and never deletes projects.

## Focused checks

```sh
python3 tests/gyroflow-install.py
python3 tests/resolve-studio.py
python3 tests/resolve-activation.py
python3 tests/corridorkey-bridge.py
python3 tests/corridorkey-menu.py
```

Mocks verify contracts/rollback, not live UI rendering. `resolve-activation.py`
evaluates the real module and tests open/closed deferral with isolated commands.

## Build status

This publication includes the approved Backrefs 6.2 single-timeout-test
deselection (`nix/common/packages/python312.nix`), MacBook terminal-only Vim
(preserving Gimle's existing package), and Sioyek staged replacement/backup
repair. They address the upstream build and activation blockers encountered
during this work. Runtime Backrefs code is unchanged. Revisit the deselection
after a version/upstream test fix. The menu/Studio pin still require activation.
