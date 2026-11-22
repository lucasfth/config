# Herdr picker and automatic tab titles

## Approved design and scope

Use Herdr Omni for live workspace/tab/agent/action search, replacing native Go To on Ctrl+B then g (including Ghostty Hyper+A then g), as requested by Lucas: “But if omni is basically a better version of prefix g then it can use that no?” Disable the native `goto` binding for this chord rather than creating competing handlers; preserve previous-tab on prefix+p and agent navigation unchanged. Use herdr-automatic-rename for task/foreground-program tab titles; manual titles win until its reset action. Keep Catppuccin, existing sidebar rows and host metrics. Disable numbering, pane topics, pane-border naming, transcript reads and program arguments. No model-generated titles, Pi history integration or fork changes.

Source changes and disposable-server tests only. No live activation, reload, restart, publication, remote installs or fleet rollout. User approved implementation in this session; no commit is authorized.

## Implementation

1. Add a small configuration contract test in `tests/herdr-customization.py`; demonstrate the absent picker binding fails. Check the prefix collision, title prompt, managed naming policy and idempotent zsh hooks.
2. Update `configs/herdr/config.toml` with the picker command on prefix+g and disable native `goto`; add naming policy and a managed Omni popup manifest beneath `configs/herdr/`. Pin upstream rename source and Omni platform binaries with fixed hashes in `configs/herdr/plugins.nix`, consumed by `nix/common/herdr.nix`; register through the existing Home Manager activation ownership. Keep downloads out of activation.
3. Source the installed rename hook from `nix/common/shell/interactive.zsh`, only inside Herdr. Do not edit generated `.zshrc`, use upstream install.sh, or discover arbitrary plugin checkouts.
4. Build the plugin directories without activating. Use an isolated HOME/config/state/socket and disposable Herdr server to check plugin loading, popup search/navigation, automatic command/task titles, manual-title preservation and explicit reset. No model turn is needed. Record any native-Pi compatibility limitations separately.
5. Document shortcuts, pins, deployment/reload gates and rollback in `configs/herdr/README.md` and the existing shortcut reference. Run focused regression tests and inspect the final diff.

## Acceptance and rollback

- Herdr config check has no conflicting picker binding; prefix+g opens Omni and prefix+p retains previous-tab navigation.
- Omni opens in a popup, finds an isolated workspace/live Pi-labelled agent and selects a result without changing tiled layout.
- Auto titles follow shell/program/task; a manual title survives reconciliation and command changes; reset restores automatic naming.
- Existing sidebar config is unchanged. Hook sourcing is absent outside Herdr and idempotent on reload.
- All plugin paths and binaries are fixed-output builds, not mutable latest downloads.
- Report source/build/isolated-runtime proof separately from live adoption. Revert only this change's source paths to roll back before activation; after a future approved activation, disable the two plugins/revert module and bindings through that same deployment route. Do not remove unrelated plugin state or existing sessions.

## Execution evidence and limitations

- macOS arm64: both final plugin derivations built successfully with fixed hashes; no activation. Config check and focused policy/deployment checks passed.
- Disposable Herdr 0.9.5 + actual offline Pi through the managed launcher: rendered prefix+g popup lists live Pi, filters a query, changes focus from a different workspace to the selected target, closes, and preserves the tiled inventory. Shell/program/task titles, manual preservation through command exit, reset and Pi rename after switching away/back pass.
- The runtime fixture now waits for Zsh hook initialization before sending a foreground command. The earlier version raced startup once; passing checks after that readiness gate are the relevant final evidence.
- Pi title changes alone do not refresh tab names. Supported tab focus events refresh after switching away/back; focusing the already-focused tab does not. An attempted pane.updated hook was rejected as unknown and removed; no such hook remains.
- Omni's Pi result shows unknown activity even when Herdr reports idle; saved Pi-session search/resume remains unsupported.
- No live service/client reload, managed activation, commit, push or remote delivery was performed. Other platform assets are pinned, not runtime-qualified.
