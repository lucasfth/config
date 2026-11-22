# Implement Herdr Omni compact layout

## Scope and guardrails

Implement the approved compact grouped-browser direction with a ~30% wide preview and rounded preview border, preserving Catppuccin Mocha, search/action semantics, and existing keybindings. Keep source changes reviewable as an in-repository patch against upstream `mmjang/herdr-omni` commit `c22a8aed0755d7d7b4b8d5efc8eee385d98fe4a8`. Do not modify the active binary pin or Nix activation wiring in this slice. No activation, `nrs`, Herdr reload/restart, publication, commit, or push is included.

## Candidate baseline and toolchain

- Clean upstream archive: `/tmp/herdr-omni-upstream-clean` (3,615-line `src/ui.rs`, commit above).
- Candidate working tree: `/tmp/herdr-omni-layout-green-final` (scratch only; not repo source).
- Use the standalone Nix `buildRustPackage` expression pattern in `/tmp/herdr-layout-green-focused.nix`, sourcing the scratch candidate and using the pinned config flake's `aarch64-darwin` nixpkgs plus `libiconv`.
- Bare Cargo is not a valid test route here: the host linker cannot find `-liconv`. Nix integration-test suite `config_search_update` also has shared-state/PoisonError failures in the full suite; qualify individual tests separately and report full-suite failures distinctly.

## Implementation tasks

1. **Wide preview geometry:** add a real `TestBackend` draw test for `App::draw`. At 160×40 the popup body is 156 columns; 30% floors to 46, with the 2-column left inset the preview begins at x=112. Run against clean upstream first (expected red: 65 vs 46), then candidate green.
2. **Rounded border and safe geometry:** render the preview using Ratatui `BorderType::Rounded`, inset preview content once, and clamp each preview render rect to that content. Keep `every_dialog_survives_tiny_terminal_resize` unchanged and require it green. Add/retain a focused top-left corner assertion at the preview origin. Verify no-border variant fails only the corner assertion, then bordered variant passes.
3. **Pane-row clipping:** clip formatted pane-label text to `rect.width - 1` using Unicode grapheme/display widths, not bytes or chars, so it cannot overwrite the rounded right border. Keep the TypeScript parity assertion untouched. Regenerate scratch render frames after clipping and inspect 80/120/150-column compact and expanded cases, especially 120-column status labels.
4. **Parity fixture policy:** preserve `tests/fixtures/ui-preview-frames.json` as the unchanged TypeScript oracle. Rounded borders intentionally change those full-frame strings; keep `preview_ui_frames_match_typescript` comparing against the original until a separate, reviewed rounded-renderer fixture is created. Any `ui-preview-frames-rounded.json` must be derived from actual candidate `TestBackend` frames, inspected at all widths/states, and carry an explicit fixture comment documenting that the rounded border is an intentional visual deviation. Do not use always-passing assertions or debug output in the candidate test.
5. **Validation:** run the width test, tiny-terminal regression, rounded-corner test, Unicode pane clip cases, preview frame parity decision, and full Rust lib tests with Nix. Run the standalone theme alias test separately against clean upstream and candidate to classify the known intermittent integration-suite failures. Use rustfmt from the Nix toolchain and inspect `git diff --check`.
6. **Patch artifact:** only after tests and screenshots/frames are reviewed, create `configs/herdr/omni/patches/0001-compact-layout.patch` from the candidate diff. Confirm it applies with `git apply --check` to a fresh archive, inspect the entire patch, then rebuild the exact patched derivation and isolated popup. No runtime activation.

## Current known evidence and open gates

- Prior scratch runs are exploratory only. The current candidate includes a 30% preview, rounded border/inset, preview-rect clamps, and a Unicode-aware pane-row clip, but none of the final combined candidate checks has been rerun after the latest edits.
- The exact final candidate's tiny-terminal regression, TypeScript parity check, pane-label clipping, focused layout/border tests, and full library suite remain open. Earlier isolated test outcomes do not count for the current candidate.
- Rounded border intentionally differs from the original TypeScript full-frame oracle. Lucas chose to keep rounded corners; a separate rounded-renderer fixture still needs actual final-candidate frame capture and visual review, while the existing TypeScript fixture remains unchanged.
- The earlier 120-column compact tab preview clipped `[blocked]`; source now has a grapheme/display-width clip, but no fresh build or reviewed post-clip frame exists yet.
- No patch is currently present in the repository; no live activation is authorized by this plan.
