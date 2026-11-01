# Resolve Studio and video plugins

macOS ownership: `nix/darwin/davinci-resolve.nix`; enabled only on
`lucas-macbook-pro` from `nix/darwin.nix`. Source, built package, live installation,
publication and system activation are separate states.

## Resolve Studio

Lucas installed Studio 21.1.1 manually during setup. Studio receipt
`com.blackmagic-design.Manifest`, app version and Blackmagic code signature were
verified. Keys are entered privately in Resolve, never in Nix or this repository.

Nix retains the supplied PKG via `requireFile`:

```nix
programs.resolveStudio = {
  enable = true;
  installer = {
    name = "DaVinci-Resolve-Studio-21.1.1.pkg";
    hash = "sha256-WK7esoMidMzUCb8ceFHwkoUbhLDjFrDHGPymJnpSkt4=";
  };
};
```

Import a future installer with a unique Studio-specific name, verify it, and pin
its flat hash. The upstream filename `Install Resolve 21.1.1.pkg` does not itself
prove Studio; signed Distribution/Manifest metadata does.

```sh
python3 scripts/install-resolve-studio /path/to/DaVinci-Resolve-Studio-VERSION.pkg
nix hash file /path/to/DaVinci-Resolve-Studio-VERSION.pkg
nix-store --add-fixed sha256 /path/to/DaVinci-Resolve-Studio-VERSION.pkg
```

Only `--install` invokes Apple's installer. It checks the Blackmagic signer and
notarization, refuses free-edition payloads and downgrades, requires Resolve
closed, and checks Studio receipt/app versions afterward. Default installer
options include Blackmagic's optional components; no custom component selection
is managed. `installer = null` leaves the app untouched. System-generation
rollback does not downgrade Apple's installed PKG.

## Asciify OFX — opt-in user install

**1.0.6**, MIT upstream: [stoatworks-labs/asciify](https://github.com/stoatworks-labs/asciify).
Artifact: [macOS universal ZIP](https://github.com/stoatworks-labs/asciify/releases/download/v1.0.6/asciify-ofx-macos-universal.zip).
SHA-256: `52f811715e0dcbc0991c004496697c4986a275dd067550f3fa8d9d0c039ae2d1`.
Signed by **ALLAN SARGEANT**, team `3G7USP8N73`, bundle identifier
`com.stoatworks.asciify.ofx`; the pinned ZIP has a valid stapled notarization ticket.
No licence key, paid pack, standalone app, or GLYPH install is needed.

From this checkout (Python 3, macOS `codesign`, `xcrun stapler`, `ditto` required):

```sh
python3 scripts/install-asciify-ofx status

# Quit Resolve manually first. Downloads only this pinned release:
python3 scripts/install-asciify-ofx install

# Or install offline from the exact same archive:
python3 scripts/install-asciify-ofx install --archive /path/to/asciify-ofx-macos-universal-v1.0.6.zip

# Inspect without launching, even while Resolve is running:
python3 scripts/resolve-user-ofx --print-command

# Only after manually quitting Resolve:
python3 scripts/resolve-user-ofx

# Optional removal, also with Resolve closed:
python3 scripts/install-asciify-ofx uninstall
```

Only `~/Library/OFX/Plugins/Asciify.ofx.bundle` is managed. Installation checks
the archive checksum, exact bundle contents/permissions, Apple signature and
signer, then validates the stapled ticket before staging with `ditto`. Status
and uninstall need no archive/network and verify exact pinned contents and
signature. Status exits 1 for absent; modified/different bundles fail without
mutation. Exact existing installs are no-ops, including the initial manual
install. Different versions are never overwritten or removed automatically;
review them separately. No sudo, system OFX writes, cache deletion, quarantine
removal, app-bundle edits or project modifications. A stale `.asciify-install.lock`
must be inspected manually after an interrupted operation.

### Persistent opt-in launch path

Resolve **21.1.1.10** on Gimle discovered the user plugin only after an explicit
`OFX_PLUGIN_PATH` launch. `resolve-user-ofx` uses macOS `open -a … --env` for
**that app launch only**, prepending the user directory, preserving nonempty
existing path entries in order, deduplicating them, and retaining the standard
`/Library/OFX/Plugins` directory explicitly. No global `launchctl setenv` or shell
export, replacement app, login service, or forced second instance. Regular
Finder/Dock launches are unchanged and may still miss this user plugin. The
launcher refuses while Resolve is running because an existing process cannot
receive a new launch environment. macOS `open` must support `--env`.

Home Manager declares `install-asciify-ofx` and `resolve-user-ofx` in
`~/.local/bin` for Gimle and the MacBook via `nix/common/dotfiles.nix`. It deploys
commands **only** after an approved activation; no activation hook downloads or
installs Asciify or launches Resolve. Until then use the explicit checkout paths
above. This source integration does not activate Nix or modify another checkout.

### Verified host evidence

Resolve **21.1.1.10** on Gimle registered Fusion ID
**`ofx.com.stoatworks.asciify`** (not raw `com.stoatworks.asciify`). In Fusion,
search **Asciify** and connect `MediaIn → Asciify → MediaOut`; scripting uses
the `ofx.` ID. The initial manual render remains at
`/Users/gimle/loki-data/live/hermes/cache/scratch/asciify-test/verified-render/asciify-resolve-proof.mov`.

**Fresh wrapper launch verified 2026-11-01, after removal of the redundant
Fusion test copy:** the parent verification saved and quit Resolve normally
(`SaveProject` and `Quit` both true), then ran this checkout's
`scripts/resolve-user-ofx` (exit 0). Resolve launched as PID **50141**, replacing
prior PID **30656**. Project `asciify-verify-20261101` loaded, and its current
Fusion graph retained `Asciify1` with ID `ofx.com.stoatworks.asciify`.

Fresh render job `dc62caa3-6d11-423d-a9b7-8d9cede77eb7` completed **100% in
4561 ms**. Permanent movie:
`/Users/gimle/Movies/Asciify-Resolve-Verification/asciify-fresh-launch-proof.mov`.
The parent's ffprobe check confirmed **ProRes, 1920×1080, 30 fps, 120 frames**;
visual inspection of
`/Users/gimle/Movies/Asciify-Resolve-Verification/fresh-proof.png` confirmed ASCII
glyphs with no obvious watermark. This records the parent's actual fresh-launch
and render verification, not another render by the documentation worker.
Installer tests previously passed **14/14** with the real pinned archive and
temporary HOME. Nix command wrappers were built and exercised but **not activated
or pushed**. Finder/Dock launches remain unchanged; this does not establish
ordinary-launch discovery or fresh validation of every other system effect.

The experimental `Fusion/Plugins/Asciify.ofx.bundle` is not a managed install
destination. Do not delete a copy unless it exactly matches the test bundle and
its redundancy is established; preserve the user OFX bundle. GLYPH is separate:
this setup neither installs nor removes it (including any system copy).

## Gyroflow OFX

Pinned **2.1.1** from `gyroflow/gyroflow-plugins` (the old `gyroflow-ofx` repository
redirects there). The signed/notarized upstream DMG remains intact in the store.
Activation mounts read-only, verifies the source, and preserves signed attributes
with `ditto` into `/Library/OFX/Plugins/Gyroflow.ofx.bundle`. Other bundles are
untouched. Successful-upgrade `.gyroflow-backup.*` directories are retained until
manually reviewed; failures roll back.

Installed signature verifies and Resolve registers `ofx.xyz.gyroflow`; a native
Fusion instance exposes its controls. Find **Gyroflow** in the effect/tool search.
For actual stabilization, load a matching `.gyroflow` project for the source
footage. No representative gyro-data stabilization render was available in this
session: discovery/instantiation is verified, stabilization quality is not.
The standalone Gyroflow app remains separately Brew-managed.

## CorridorKey 2.0 — native experimental OFX

**Use the editable single-node wrapper:** select the source directly connected to
MediaOut1 in Fusion, then run **Workspace → Scripts → Utility → CorridorKey
Original-colour matte**. Choose the actual input primaries/gamma. The command
backs up the composition, inserts one connected **CorridorKey** group, and selects it.
The raw **CorridorKey 2.0** tool in Shift-Space bypasses that colour-managed wrapper.
Try a **duplicate timeline first**. The clip must have exactly one Fusion composition,
with a direct source→MediaOut1 connection; existing CorridorKey groups and ambiguous
routing are refused. Select an existing outer group to edit it instead of adding another.
Check the result, then **save manually**. Setup never saves your project automatically;
its failure rollback is mock-tested only. See the [step-by-step guide](native/README.md#use-one-node).

Inspector controls include input/output colour, output view, screen/model despill,
matte levels/grow/softness, fit policy, and **Temporal mode / Lookahead 0–3**.
Changes remain editable on the same node; no project-switching bake/export/import
workflow is used. The earlier Render/Apply button is retired, not a native render requirement.

Independent mode (default): <=8192 per side / 40 million pixels. Experimental
four-frame context: <=4096 per side / 4096×2160 pixels. Both fit inference to the
720p model and restore source dimensions, not native-4K detail. The wrapper keeps
original linear colour separate from its finite [0,1] inference branch. No automatic
camera gamma/gamut detection or RAW decoding.

Temporal mode is deterministic bounded context, **not** upstream whole-clip
recurrence/overlap equivalence; differences can be visible. No realtime or
flicker-quality claim. See the [native guide](native/README.md) for measured
reference checks, source limits, setup backups and unresolved quality/cache gates.

The native bundle is built by `nix/darwin/corridorkey-ofx-package.nix` and installed
at `/Library/OFX/Plugins/CorridorKey2.ofx.bundle`. It is original wrapper code around
a persistent private MLX worker, not the official paid plugin or copied community
OFX code. Bundle signing is ad-hoc, not Developer-ID notarization.

### Verified consumer evidence and limits

Installed describe-fixed build loads in Resolve Studio 21.1.1. Native frame-0
preview alpha matches the batch fixture exactly. Disposable project
`CorridorKey-Native-5922253efd` rendered four frames to ProRes 4444 with alpha at
`~/Movies/CorridorKey-Native-Tests/render/native-cutout-verified.mov`. Decoded
1280×720 output has nontrivial alpha in all frames. Alpha mean errors versus
temporal batch: 0.00004895–0.00025900; premultiplied RGB mean errors:
0.00020271–0.00029444. Maximum RGB error reaches 0.10449 at a semi-transparent
edge, primarily from stateless versus temporal model state (native-vs-batch max
0.10156); ProRes-vs-native max is <=0.00597. This is a passing fixture integration,
not general temporal equivalence or production visual acceptance.

Initial AddFusionComp-only render attempts incorrectly exported opaque source.
ImportFusionComp persisted the node graph into the timeline composition table,
after which Deliver rendered the native result. See the [native guide](native/README.md)
for detailed protocol, evidence, tests and limitations. `hugi` was not used for
native rendering. The earlier batch fixture bin `CorridorKey-Fixture-60bb260a`
remains in `hugi` unless Lucas removes it; no automatic project cleanup occurs.

### Runtime and model licence

Set up the separate private runtime before using the effect:

```sh
python3 scripts/setup-corridorkey-resolve --accept-model-license
```

It refuses an existing runtime; never overwrite it casually. Runtime root:
`~/Library/Application Support/CorridorKey-Resolve`; model/engine licences and
provenance remain there. Source commit: `74065491ebd2eddea494ab34c15a6d84d7415353`.
Weights: `cdelta/CorridorKey-v2-MLX-fp16`, revision
`3c75d4756579e2bdd21307c64a1af381bde1cdc1`, profile `fp16/768x1280-t1`.

Wrapper is MIT, OpenFX headers BSD-3-Clause, MLX engine Apache-2.0. **Weights are
not unrestricted FOSS**: Corridor Key Licence 2.0 adds restrictions to
CC BY-NC-SA 4.0, including no paid inference service, free/share-alike derivatives,
commercial-integration agreement requirements and per-user plugin seats for
organisations above US $20 million gross revenue. Local testing approval does not
authorize selling/distributing a commercial integration. No weights are bundled,
and activation does not accept or download model licences.

Worker diagnostics: `~/Library/Application Support/CorridorKey-Resolve/ofx-worker.log`.
Failures are also reported as persistent OFX host errors. Avoid many simultaneous
instances on this 18 GB Mac; each effect instance owns a model worker. Native
installer verifies identifier/signature, refuses unmanaged changes, stages with
rollback and retains `.corridorkey2-backup.*` without automatic expiry.

### Dependency lock regeneration

From the repository root on Apple Silicon macOS with `uv` installed, regenerate
the fully hash-pinned lock after editing `requirements.in`:

```sh
uv pip compile configs/davinci-resolve/requirements.in --generate-hashes --output-file configs/davinci-resolve/requirements.txt
```

The setup helper installs this lock with `uv pip sync --require-hashes` into its private Python 3.12.11 runtime.

## Activation and old-menu migration

Routine activation defers video installer steps while Resolve is running. It
retains the original signed Gyroflow DMG and supplied Studio PKG in the closure.
The native install is idempotent when installed content matches. Backups and
project media are not removed by rebuilds.

The approved native module stops managing the old batch `CorridorKey 2.0.py`
menu and removes only its store-managed symlink. User-owned files/non-store links
are preserved. Batch engine/setup sources remain for fixtures and diagnosis;
console fix `96441907` stays in history but the menu is no longer the intended UI.
Native source publication and activation receipts must be checked separately from
the already-verified standalone plugin installation.

## Checks

```sh
python3 tests/gyroflow-install.py
python3 tests/asciify-ofx.py
python3 tests/asciify-ofx.py --archive /path/to/asciify-ofx-macos-universal-v1.0.6.zip
python3 tests/resolve-studio.py
python3 tests/resolve-activation.py
python3 tests/sioyek-install.py
python3 tests/corridorkey-bridge.py
python3 tests/corridorkey-menu.py
python3 tests/corridorkey-ofx-install.py
"$HOME/Library/Application Support/CorridorKey-Resolve/venv/bin/python" tests/corridorkey-ofx-worker.py
"$HOME/Library/Application Support/CorridorKey-Resolve/venv/bin/python" tests/corridorkey-ofx-inference.py --fixture-root /path/to/fixture-root
```

Mock/unit evidence does not establish host acceptance. Real-model and real-Resolve
checks require the separate licensed runtime and disposable fixture project.

## Existing build repairs

The earlier publication includes the approved Backrefs 6.2 single-timeout-test
deselection (`nix/common/packages/python312.nix`), MacBook terminal-only Vim
(preserving Gimle's existing package), and Sioyek staged replacement/backup repair.
Runtime Backrefs code is unchanged; revisit the test deselection after an upstream
fix. Native development does not modify those unrelated repair modules.
