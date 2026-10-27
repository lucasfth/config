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
