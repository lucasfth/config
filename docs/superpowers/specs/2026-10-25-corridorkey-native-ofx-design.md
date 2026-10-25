# CorridorKey 2.0 native OpenFX design

## Approved approach

Lucas approved the recommended native OFX front end with a persistent MLX worker on 2026-10-25, then requested execution without repeated permission prompts. This supersedes the batch-menu interface as the intended consumer path. No claim of completed rendering is implied.

## Scope

Apple Silicon Resolve Studio; a real `CorridorKey 2.0` OFX filter with RGBA input/output, green/blue screen, despill, matte/cutout controls and explicit errors. First version accepts full-frame 1280x720 SDR pixels; the worker pads internally to the existing 768x1280 FP16 profile. Input encoding is an explicit sRGB/linear-sRGB control; other gamuts/log/HDR require upstream conversion. Output uses premultiplied alpha as advertised to the host. Preview scaling, other sizes and tiles fail explicitly rather than silently resize. No temporal state: frames must be deterministic when requested out of order.

## Architecture

A small C++ OFX bundle uses standard OpenFX C headers, without copying third-party CorridorKey OFX code. It owns a persistent Python MLX child per effect instance, started with `posix_spawn` and private pipes, with bounded messages/timeouts, termination on instance destruction, stderr diagnostics and host-visible errors. Host frame pixels cross as float32 RGBA; no shell, network listener or user-supplied paths in the protocol. The worker keeps the pinned existing MLX model loaded, resets recurrent state per frame and uses a bounded content-keyed cache. Render requests are serialized per instance. Unsupported layouts/pixels and malformed worker replies fail closed. No auto-download or licence acceptance inside Resolve.

## Licensing

New wrapper code is original; standard OFX headers retain their upstream BSD licence. Existing community MLX code is Apache-2.0 with notices already retained. Model weights remain under Corridor Key Licence 2.0, including commercial-integration, no-paid-service and revenue/seat restrictions. Lucas previously accepted local model use. No CC BY-NC-SA CorridorKey-Runtime OFX code is copied or vendored, no weights are published, and no claim that the model is FOSS is made. Personal local integration only; distribution/commercial product integration requires separate licence review.

## Packaging and safety

Nix builds the OFX bundle and worker source; existing private runtime/models remain outside the store. Installation changes only this plugin's bundle, retaining rollback. Preserve current plugins, Studio activation, projects and media. Keep unrelated Pi/Muninn edits out of this work. Do not mutate store-backed deployed scripts. Old console fix 96441907 remains published but undeployed; do not deploy it as a side effect of native development.

## Acceptance gates

1. Worker protocol rejects malformed/unsupported frames; deterministic cached output matches the existing fixture and contains nontrivial alpha.
2. Native OFX mock host exercises describe/create/render/destroy, negative row strides, image release, errors and worker lifecycle with real inference as a separate integration run.
3. Bundle discovery and instantiation in actual Resolve, with controls and explicit errors.
4. Disposable project only: preview and documented Deliver render, inspect exported pixels/alpha and logs. Never claim plugin success from registration alone.
5. Nix build and installation test, focused regressions. Publish/activate only the verified scope; document any incomplete consumer evidence.

## Protocol and measured fixture limits

Header is **32 bytes**, little endian `<8sIIIIfI`: magic `CK2OFX01` (8), width/height/screen/output (four uint32, 16), despill (float32, 4), encoding (uint32, 4). Payload is top-down packed float32 RGBA, 1280×720×16 bytes. Reply is uint32 status plus uint32 length, then premultiplied float32 RGBA or a UTF-8 error of at most 4096 bytes. Input must be opaque SDR. No uint16 BGRA crosses the pipe; uint16 BGRA exists only at the upstream renderer boundary.

Measured against the existing four-frame fixture, stateless RGBA mean absolute errors are 0, 0.0001345612, 0.0001492961, 0.0001755243; alpha MAEs are 0, 0.0001527917, 0.0001730818, 0.0002220118. First frame matches exactly. Acceptance threshold for this fixture is RGBA and alpha MAE below 0.001 each, plus finite pixels, nontrivial alpha, deterministic out-of-order output and matte correctness. This is a close approximation on this fixture, not general equivalence to temporal inference or production visual acceptance.

Latest Nix package: `/nix/store/7z6w890ijgvbnfsyxrd9bysplz45cjj0-corridorkey-ofx-0.1.0`; ad-hoc signature verifies (not Developer-ID notarization). SDK archive uses flat SHA-256 `sha256-698xyxi6nz7AgtdNEsa5T29ywFpNTIjil0sTKUpNKnE=`.

Status: worker and dynamically-loaded mock-host adapter are tested outside Resolve; the host test is adapter-to-worker consistency against one batch fixture frame, not Resolve discovery/render proof. Six installer tests and a real-bundle isolated first/repeat install pass. Python/C-stdio stdout-fd isolation and cache inference counts have separate subprocess coverage; C++ closed-reader write passes with default SIGPIPE and per-pipe suppression.

Lucas approved installing only `CorridorKey2.ofx.bundle` under `/Library/OFX/Plugins` and disposable-project testing. He reported saving `hugi`; the log confirms saves. The documented normal Quit request completed, `pgrep` became empty, and the guarded installer is now in an interactive sudo terminal awaiting user authentication/result. No live install success, Resolve discovery or Deliver-render success is claimed yet. `scripts/install-corridorkey-ofx` retains backups and refuses a running Resolve. Native source remains in worktree branch `feat/corridorkey-native-ofx`.