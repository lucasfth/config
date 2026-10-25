# CorridorKey 2.0 — experimental native OFX

Original C++ OFX front end with a persistent, private-pipe MLX inference worker.
Not the official plugin. No community CorridorKey OFX implementation is copied.

## Current status

**Experimental native effect installed and tested in Resolve Studio 21.1.1.**
Resolve loads `ofx.org.lucasfth.CorridorKey2` with Screen, Output, Encoding and
Despill controls after removing unsupported optional OfxPropPluginDescription.
Preview frame 0 has identical alpha to batch frame 0. A four-frame ProRes 4444
Deliver export completed in disposable project `CorridorKey-Native-5922253efd`.
This is fixture acceptance, not a production-quality or temporal-equivalence
claim. The bundle is ad-hoc signed, not Developer-ID signed or notarized.
Native source is not published or wired into system activation yet.

The mock OFX host dynamically loads the built binary and exercises the public
entry point. It proves **adapter-to-worker consistency on one fixture frame**
against the batch PNG reference, positive/negative row strides, image cleanup and
specific unsupported-size/scale messages. It does not prove Resolve compatibility.

Real worker tests process four fixture frames and check repeat/out-of-order
consistency, nontrivial alpha, matte and linear encoding, and invalid input errors.
The largest measured alpha MAE versus temporal batch output is 0.0002220118 on
this fixture; acceptance is <0.001 mean error, not pixel identity or general
visual-quality equivalence. The model is reset per frame for deterministic
non-sequential host requests. Temporal smoothing is not implemented.

Six installer tests cover read-only source, repeat install, retained upgrade
backup, marker-failure rollback, unmanaged collision, signature failure and
Resolve-open refusal. An isolated real-bundle first/repeat install also passes.
Only process detection is stubbed for that isolated check; no live plugin folder
is used.

### Actual Resolve output and temporal difference

Versus temporal batch output, decoded ProRes frames have alpha MAEs 0.00004895,
0.00018508, 0.00020589, 0.00025900; premultiplied RGB MAEs 0.00020271, 0.00024973,
0.00026683, 0.00029444. Maximum absolute RGB errors are 0.00583, 0.02251, 0.04984,
0.10449. The last-frame maximum is at pixel (822,231), a semi-transparent edge:
stateless alpha 0.76709 versus batch 0.86865. Native single-frame versus temporal
batch RGB max there is 0.10156. ProRes versus the matching native single-frame
output has max RGB error <=0.00597 and mean <=0.000203. Thus temporal edge
differences can be visible; low whole-image mean errors do not prove general
visual equivalence or quality on other footage.

The first AddFusionComp-only test exported unprocessed source (opaque alpha).
Exporting/importing the graph via ImportFusionComp persisted its timeline
composition table; Deliver then evaluated the native node. Earlier opaque files
remain failed attempts. Passing output:
`~/Movies/CorridorKey-Native-Tests/render/native-cutout-verified.mov`.

## Supported contract

- Apple Silicon macOS, licensed user-owned CorridorKey runtime already set up.
- Opaque 1280×720 full-frame SDR float32 RGBA input; square pixels, no proxies.
- Explicit sRGB or linear-sRGB encoding; Rec.709/sRGB primaries only. Convert log,
  HDR and other gamuts upstream. This adapter does not infer project colour space.
- Green/blue screen, despill, premultiplied cutout or opaque grayscale matte.
- No real-time promise, other sizes, temporal windows or multi-resolution tiles.
- Model stays resident per instance; avoid multiple simultaneous instances on a
  memory-constrained Mac. Worker timeout is 180 seconds; render cancellation and
  destruction terminate only the child this instance created.

## Private protocol

32-byte little-endian `<8sIIIIfI`: magic `CK2OFX01`, width, height, screen, output,
despill float32, encoding. Then 1280×720×4 little-endian float32 top-down pixels.
Reply: uint32 status and length, followed by premultiplied float32 RGBA or <=4096
UTF-8 error bytes. Header and pixels form the one-entry cache key. Stdout fd 1 is
redirected to stderr after duplicating the protocol descriptor, protecting binary
replies from Python and C-level logging. No listening socket or shell command.
macOS `F_SETNOSIGPIPE` protects the input pipe without changing Resolve's global
signal disposition.

## Local checks

Use the existing runtime venv for worker tests. OpenFX headers come from the pinned
SDK revision in `nix/darwin/corridorkey-ofx-package.nix`.

```sh
python3 tests/corridorkey-ofx-install.py
"$HOME/Library/Application Support/CorridorKey-Resolve/venv/bin/python" tests/corridorkey-ofx-worker.py
"$HOME/Library/Application Support/CorridorKey-Resolve/venv/bin/python" tests/corridorkey-ofx-inference.py --fixture-root /path/to/fixture-root
```

Real inference fixtures are not shipped as model weights or automatically fetched.
A test root needs `ck2-sequence/000000.png` through `000003.png` and matching batch
`ck2-sequence-output/cutout/` files. Float32 host reference is derived from the
first batch PNG: reorder BGRA to RGBA, divide by 65535, premultiply RGB by alpha.

## Installation and licences

`scripts/install-corridorkey-ofx` defaults to `/Library/OFX/Plugins`. Do not run it
while Resolve is open. It verifies the bundle identifier/signature, refuses
unmanaged changes, stages a writable copy, swaps with rollback, and keeps
`.corridorkey2-backup.*` directories intentionally without automatic deletion.
The approved Resolve module invokes it on activation (deferred while Resolve is
open) and retires only the old store-managed batch-menu link. Source wiring
and a passing build are not proof of live system activation; verify its receipt.

Wrapper: MIT. OpenFX headers: BSD-3-Clause with bundled licence. Existing MLX
engine: Apache-2.0 with runtime NOTICE/CODE-LICENSE. Model weights are separate
and governed by Corridor Key Licence 2.0, including commercial-integration and
revenue/seat restrictions. No weights are bundled and no licence acceptance is
performed by the plugin. Local testing permission is not permission to sell or
redistribute a commercial integration.
