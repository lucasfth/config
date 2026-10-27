# CorridorKey 2.0 — editable native keyer

Original MIT OFX front end plus a colour-managed Fusion wrapper. Not the official CorridorKey plugin or the separately licensed CorridorKey-Runtime wrapper. Engine/models retain upstream terms; see NOTICE. The models are not unrestricted FOSS.

## Use one node

1. Open a timeline clip in Fusion. Select the source directly connected to `MediaOut1`.
2. Run **Workspace → Scripts → Utility → CorridorKey Original-colour matte**.
3. Choose the colour space/gamma of the actual pixels at that node, not merely the camera's recording mode. Cancel makes no graph change.
4. The command inserts, connects and selects **one CorridorKey group**. Use its Inspector:
   - **Colour:** input/output primaries and gamma.
   - **Key:** output view, green/blue screen, model despill.
   - **Matte:** black/white levels, grow/shrink, softness.
   - **Advanced:** Fit source / Require 1280x720.
   - **Temporal:** Independent frames (default) / Four-frame context, Lookahead 0–3.

This is an editable effect: parameter edits reevaluate the existing node. There is **no Render/Apply button, project-cloning bake action or external matte to import**. Resolve's normal render cache can be used for ahead-of-time playback; this is not a realtime promise. Actual host disk-cache reuse/invalidation has not been independently measured.

**Shift-Space → CorridorKey 2.0** adds the raw OFX keyer, not the colour-managed group. The setup command is the recommended entry point. Double-clicking a group expands its internals; select the outer group for its published controls. Older groups saved in existing projects do not automatically update when the macro file changes. Do not reuse an old Render/Apply group: make a backed-up fresh setup instead.

Automatic setup initially requires one composition and a direct source→MediaOut1 connection. It refuses an existing CorridorKey group, ambiguous source identity or complex routing rather than guessing. Original composition exports are retained under `~/Movies/CorridorKey/setup-backups/setup-*`. Rollback is covered by stateful mock tests, not an intentionally failed live Resolve import: it attempts restoration and verifies composition names/count and exported content; if restoration cannot be verified, the error names the backup. Source media is never edited. Setup does not save the user's project automatically.

## Colour and source resolution

Apple Silicon macOS / Resolve Studio; float32 RGBA CPU, opaque input, square pixels, full frame, no tiles. Independent mode accepts up to **8192 per side / 40 million pixels**. Temporal mode is capped at **4096 per side / 4096×2160 pixels**; larger stills must explicitly use Independent mode.

Fit source preserves aspect ratio on a 1280×720 reflected-border canvas, runs the padded 768×1280 model, crops the fit padding and restores source dimensions. It does **not** reconstruct native-4K hair detail. Require 1280×720 is the strict alternative. Isotropic reduced previews are accepted; grow/shrink and softness scale with preview scale.

The wrapper converts a separate inference branch to display sRGB, while preserving original RGB in linear Rec.709 for applying the matte. Output conversion uses explicit alpha divide/transform/multiply. Original-colour cutout, model cutout, matte, raw foreground, despilled foreground and checkerboard are selectable. By source wiring, model despill affects model foreground, **not** the preserved original-colour branch; that separation has not been independently varied in the live temporal acceptance test.

Raw OFX accepts explicit display sRGB, linear sRGB or Gamma 2.4 / Rec.709 primaries and requires finite [0,1] input. It does not guess camera encoding, decode RAW, or accept direct HDR/log. A tested MP4 decoded to -0.152..1.131 and correctly failed the raw native contract. Resolve develops camera media; where CR3/RAF import is unsupported, use a developed image with an explicit colour space. Apple Log/Canon Log 3/F-Log camera accuracy and representative edge quality remain unqualified. Resolve colour-transform roundtrips on synthetic data establish self-consistency, not camera accuracy.

## Editable temporal processing — experimental

Four-frame context uses pinned t4 stage1 plus per-frame foundations/RVM/stage2. Lookahead `a` selects times `t-(3-a)` through `t+a`; source boundaries hold the first/last frame. RVM resets at each context start so random-access/out-of-order requests reproduce the same pixels. The host must advertise temporal clip access; otherwise temporal mode fails clearly, without silent single-frame substitution.

This is **not the upstream whole-clip renderer** with persistent recurrence and overlapping-window blending. Against a seven-frame synthetic whole-clip reference, bounded context differed by up to **0.3233 alpha** at an edge. Do not infer less flicker, superior quality or visual equivalence. Independent remains the safe default; inspect temporal results on representative motion before use.

A native context worker peaked at **2,516,893,696 bytes RSS** in the four-frame reference check; earlier 4K scratch testing measured 937,230,336 bytes. Different paths/measurement scopes, not a general bound, and neither includes Resolve/GPU memory. Avoid multiple concurrent instances on an 18 GB Mac. One cutout test timed out across a recorded system-sleep interval; a command-scoped awake rerun passed. This is correlation, not a proven sole timeout cause. Failed workers can restart on a subsequent render. Do not disable validation or silently reuse stale pixels.

## Evidence and limits

- Real worker: single-window premultiplied RGBA matches independently generated unmodified upstream window=4 references exactly; target requests repeated out of order are identical.
- Mock OFX host: required neighbour ranges, chronological fetch order, held boundaries, capability refusal, handle releases and model-reference comparisons pass. Independent 960×540, 720p, 1080p, 4K and portrait tests pass with both strides.
- Resolve Studio 21.1.1: synthetic project `CorridorKey-Editable-96e523c5` rendered Independent, lookahead 0/3, changed matte black, first/last frames and repeated settings. Temporal matte equals single-window upstream alpha; native Cutout equals premultiplied RGBA reference (max/mean error 0, tolerance 1e-4). Independent OFX equals the direct native worker, not independently asserted whole-clip upstream equivalence. Vertically flipped reference fails, confirming orientation.
- **In-place edits without composition import**: lookahead 0→3→0 changes then exactly restores the matte; composition count stays one. This proves parameter reevaluation, not disk-cache reuse.
- Automatic wrapper: `CorridorKey-EditableGroup-26acb522` created one group/one composition, with no bake controls. Lookahead and black-level edits match references exactly (max/mean 0); restoring settings reproduces output. No representative-camera or real-time claim.

Tests render disposable fixture outputs solely for numerical verification; routine editing does not require exporting files. Prior project-switching bake tests crashed and are not shipped here. Their files/projects are retained as evidence; no automatic deletion or restart occurs.

## Deployment and protocol

Nix module `nix/darwin/davinci-resolve.nix` owns the OFX package, macro, setup command/modules and pinned model manifest. The native installer targets `/Library/OFX/Plugins/CorridorKey2.ofx.bundle`, requires Resolve closed, verifies identifier/signature, refuses unmanaged collisions and retains `.corridorkey2-backup.*`. Ad-hoc signing only, not Developer-ID/notarized. Source, publication, live symlinks and Nix activation are separate states.

Runtime: `~/Library/Application Support/CorridorKey-Resolve`, licensed `ready.json`, pinned Python and models. `scripts/setup-corridorkey-resolve --accept-model-license` validates/downloads pins; activation never accepts a licence or downloads weights automatically. Added t4 stage1 graph/weights are pinned to the same repository revision as t1. No weights are bundled.

Independent private pipe: **CK2OFX02**, 52-byte `<8sIIIIfIIffff>` header: magic,width,height,screen,output,despill,encoding,policy,black,white,grow,softness; source-sized top-down float32 RGBA. One-entry cache keys complete header+pixels. Temporal: **CK2OFX03**, 56-byte `<8sIIIIfIIffffI>`, appended target index, four streamed source-sized frames, no hidden cross-context recurrence. Reply: uint32 status/length then premultiplied RGBA or <=4096 UTF-8 error bytes. No sockets, no shell transport. Stdout is binary-only; diagnostics go to `ofx-worker.log`. Timeout/error/cancel terminates the owned worker; next render can restart it.

## Checks

Runtime venv required for numerical/model tests:
- `tests/corridorkey-ofx-worker.py`, `-resize.py`, `-stdout-cache.py`, `-kill.py`, `-inference.py --fixture-root PATH`.
- `tests/corridorkey-ofx-resolutions.py --fixture PNG --host HOST --binary OFX` and `-memory.py --fixture PNG`.
- `tests/corridorkey-temporal.py`, `tests/corridorkey-temporal-inference.py --models ROOT --frames FOUR_PNG_DIR --reference UPSTREAM_CUTOUT_DIR`.
- C++ transport/failures/SIGPIPE tests; temporal transport; temporal host with real frame/reference directories. Synthetic host echo mode needs an isolated echo-worker bundle, not the real model bundle.
- `python3 tests/corridorkey-single-setup.py`, `tests/corridorkey-matte-menu.py`, installer and activation tests.

Lucas confirmed the actual outer-group Temporal mode/lookahead controls are editable and the viewer updates. This does not establish representative-camera quality, improved flicker or host disk-cache reuse. See the editable-temporal spec for scope and remaining gates.
