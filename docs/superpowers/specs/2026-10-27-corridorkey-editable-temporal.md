# Editable native temporal node

Lucas rejected the export/import bake workflow and approved an editable in-timeline node using host-managed cache. Work is isolated from the unfinished bake branch at /private/tmp/corridorkey-editable-temporal, based on published ff6f4eb7. Do not resurrect the Render/Apply button or switch projects as part of processing.

## Contract

One colour-managed Fusion wrapper around native CorridorKey. Independent mode remains the default. Experimental four-frame context exposes Lookahead 0..3 (lookbehind = 3-lookahead), source bounds held at either edge. All matte, colour and output controls remain live; host receives FrameVarying output and explicit temporal dependencies, so parameter changes invalidate computation/caching normally. No custom persistent baked matte, project clone, export or filesystem sequence is required. Resolve render cache is an optional host feature, not a claim of real-time inference.

The bounded t4 calculation resets recurrent state at the context start; it is NOT the upstream whole-clip overlapping/continuous-RVM pipeline. Prior single-window reference comparison matched exactly, but seven-frame whole-clip alpha differed by up to 0.3233. Preserve this caveat and require actual motion/edge visual acceptance before recommending temporal mode for production. Do not label the bounded result whole-clip equivalent. Whole-clip recurrence would require separate deterministic range/cache architecture and is outside this first editable implementation.

Temporal cap: <=4096 per side and <=4096x2160 pixels, reject before fetching/allocating contexts. Independent mode keeps <=8192 per side / 40MP. Stream four frames sequentially, release each host handle promptly. Rendering order must not change pixels. Missing temporal host capability fails clearly; never silently substitute single frame. Still/log/raw workflow retains explicit inference conversion; no camera-space guesses.

## Plan and acceptance

1. Recover archived temporal tests only; demonstrate missing-control/transport failure against published native build. Recover source into isolated branch, inspect protocol and OFX temporal capability/ranges. Do not install recovered binaries.
2. Run independent and temporal unit/transport tests, then real model comparisons to separate unmodified upstream single-window references. Test source request intervals/order, both strides, boundary frames, parameter changes and recovery. Test current package has no bake callback or script installation. Build from these sources and verify hashes/signature.
3. Qualify real Resolve temporal support in a backed-up synthetic project only after explicit install/reopen approval. Native lookahead readback, multiple frames out of order, parameter edits and repeated render output against independent references. Stop on crash. Actual host cache reuse/invalidation remains separate from deterministic render proof.
4. Single-wrapper installation command: import current macro as one node with automatic wiring for simple MediaIn->MediaOut; preserve original comp backup and refuse ambiguous routing. No bake button. Confirm one group and one composition, persistent after reload. Test UI insertion, Inspector editing and render.
5. Publish/activate only qualified slices, preserving other WIP. No root install until package tests and private authentication. Report installed vs published vs actual UI proof separately; unsupported camera quality or real-time performance remains unclaimed.

## 2026-10-27 acceptance receipts

- Red reproduced: temporal host against the installed independent binary failed “Temporal Inspector controls missing”; compiling the temporal transport test against the ff6f4eb7-based source failed “no member named renderTemporal”. Recovered source ported to isolated branch; no bake UI source carried over.
- Green: scheduler/header/bounds tests, v2/v3 transport, host-capability refusal (mock-verified; Resolve property value was not logged), real-model host neighbour timing/order/boundaries and reference pixels pass. Independent host checks cover five physical resolutions and both strides.
- Installed candidate authenticated privately with retained backup `.corridorkey2-backup.60p3xf9e`; binary/worker/temporal hashes match candidate, codesign verifies.
- Actual Resolve native matte and Cutout runs: single-window reference max/mean error 0 (tolerance 1e-4); independent result is OFX-to-worker consistency. Reversed-row reference fails. In-place lookahead 0→3→0 changed and exactly restored output without composition import.
- Automatic group creation: fresh synthetic EditableGroup project, one composition/group, temporal/matte controls propagated, decoded output matches corresponding references exactly. Original source comp backup retained.
- Lucas confirmed: “Yes—mode/lookahead are editable and the viewer updates.” This confirms the control/viewer path, not representative camera quality or disk cache reuse.
- One cutout run crossed system sleep and timed out; bounded awake rerun passed. No claim of sole crash/timeout causality. Previous export/bake workflow is retired, preserved only in separate unfinished worktree/evidence.
- Publication, exact-commit build and main-checkout update are separate final steps. Full Nix activation is not implied by scoped live links.
