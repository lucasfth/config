# CorridorKey 2.0 inside Resolve — approved custom batch bridge

## Goal and current state

Lucas wants CorridorKey inside DaVinci Resolve Studio on his Apple Silicon Mac.
Gyroflow OFX is installed and registered in Studio. Lucas installed Studio
21.1.1 and supplied its installer; Nix pin/menu source is now prepared. The
batch worker and real Media Pool import passed; final menu/render acceptance
is pending. This proposal does not authorize a purchase.

## Recommended: official Mac OpenFX plugin

The official https://corridorkey.com page, checked 2026-10-24, explicitly lists
Mac OpenFX, M-series Macs and macOS 14+. It offers a paid one-time personal
licence with 2.x updates. Verify the current price and release at purchase;
marketing availability is not a receipt of successful operation on this Mac.

This is the shortest path to the actual requested consumer: a keying effect in
Resolve. Lucas purchases/downloads the Mac installer himself if he chooses it.
Then inspect the supplied release, signature, licence and installer layout;
add a version/hash pin with Nix-managed installation, preserving unrelated OFX
plugins. Do not put credentials, activation keys or sessions in Nix.

Acceptance: signature verification, Resolve lists the plugin, and a disposable
fixture clip renders with a plausible alpha channel. Download or installation
alone is not acceptance. Preserve previous plugin versions before upgrades.

## Alternative: custom community MLX batch bridge

This is a Workspace > Scripts utility, NOT a live OpenFX effect. First version:
process one source clip, using a private output directory, then import only the
straight-alpha cutout into the project's Media Pool. The matte stays on disk. Do not overwrite the
source clip, alter existing timeline items, or process a whole project. Persist
logs and show failures instead of importing partial outputs.

Frozen input contract: exactly one selected Media Pool source clip, or an
explicit local video path for CLI testing. Only 1280x720, constant-frame-rate
display-referred sRGB SDR video is accepted; reject HDR/unknown transfer metadata,
other sizes, image-sequence inputs, missing profiles and nested input/output paths.
Never infer a timeline trim or process a different selection.

Output: a new mode-0700 job folder containing numbered 16-bit alpha/cutout PNGs
and a manifest recording rational source frame rate and frame count. Validate
all output dimensions/counts before success. Import only cutout via MediaPool.ImportMedia
with explicit PNG sequence pattern/start/end indexes as a new item; set and read
back sequence frame rate and straight alpha. No timeline edits. Failed inference
must never import. Failed import preserves output and reports the job path.

Keep the pinned Python 3.12 environment and model weights outside /tmp, with
reproducible dependencies and recorded model checksums. The menu launcher and
configuration belong in configs/davinci-resolve and are deployed by Nix/Home
Manager. Resolve's bundled Python cannot import this Python 3.12/MLX environment;
invoke inference in a separate process rather than loading those libraries in
Resolve. Large or unsupported inputs must fail clearly, never silently resize
production footage or change colour interpretation.

Known tested scope: FP16 768x1280-t1 profile, 1280x720 synthetic input, PNG alpha
and foreground output. HDR/EXR, audio passthrough, live processing, native 4K and
temporal blending are NOT established. Test fixture output dimensions, frame
counts, alpha, frame rate and actual Media Pool import before calling it done.

## Licensing boundary

The community MLX code is Apache-2.0. The weights are not unrestricted FOSS:
Corridor Key Licence 2.0 supplements CC BY-NC-SA 4.0, including no paid inference
service, derivative attribution/free-access/share-alike conditions, and a plugin
seat requirement for organisations above US $20 million gross revenue. Commercial
software/service integration can require separate permission. Foundation-model
licences apply separately. Review the actual supplied terms before implementation
or distribution; an internal script is not assumed to waive these conditions.

## Decision and remaining prerequisites

Lucas explicitly chose the custom local batch bridge and accepted its limitations
and model licence through ask_user on 2026-10-24. No purchase is approved.

Implementation order:
1. Add tests for size/colour/profile/path rejection and failed inference/import.
2. Implement the standalone worker and run real four-frame fixture inference.
3. Pin dependencies/source/model checksums; prepare a durable local runtime.
4. Verify import/selection APIs against the installed Resolve build. Lucas later
   explicitly permitted testing in `hugi`; a separate fixture bin was added,
   with existing clips/timelines untouched. No further project switching while
   save-state verification is unavailable.
5. Add the Nix/Home Manager menu deployment, build, activate and verify.

Lucas requested completing the remaining configuration and publishing the scoped
changes to main. No native computer-use capability is available in this session;
UI acceptance cannot be claimed from CLI/tests alone. Final render checks are
pending manual save of `hugi` and a fresh disposable-project scripting session.
Do not claim the full setup complete before menu/render acceptance.
