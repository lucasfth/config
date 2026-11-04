# Obel Mono rollout

## Goal and boundaries

Use ordinary Obel Mono for developer text while retaining Nerd Font icons, current sizes, colours, accessibility and content. Secret masking remains disabled. Lucas approved local setup followed by successful-check-gated fleet and web rollout on 2026-11-04.

Never include or activate the pre-existing edits to `docs/gimle-setup.md`, `scripts/loki-service-run`, `tests/loki-service-run.py` or the dirty `volundr` submodule. Do not rebuild from the dirty checkout. Preserve all unrelated editor settings. No remote session or service restart is needed for fonts.

## Implementation

1. Download Obel Mono 1.000 from the official HTTPS distribution; verify the SHA-256 published in its installer and inspect OFL licensing. Install only ordinary Roman/Italic variable fonts. Verify names, Danish text, weight/style selection and icon fallback with the installed Ghostty CLI.
2. Update `configs/ghostty/config`, `configs/zed/settings.json`, `configs/syntax-highlight/settings.json` and the existing preview helper's status message. Add a pinned cross-platform Nix font package/module and a bounded install helper for non-Nix machines. Merge only font keys into this Mac's VS Code user settings; keep a backup outside Git.
3. Check Ghostty parsing and actual face selection for plain text, raven U+EDEA, hardware icons, Powerline, box drawing, blocks and braille. Validate editor settings and preview preferences. Inspect a rendered terminal sample before accepting the local rollout. Build/evaluate from an isolated HEAD snapshot plus only this task's changes. Inspect the activation scope before any switch; do not activate unrelated changes to gain a font setting.
4. Discover the configured SSH fleet through canonical configuration. Inventory OS, ownership, terminal/editor consumers and current managed paths. Install/configure desktop consumers only after local checks pass; SSH-only hosts inherit the client font and need no font or shell rewrite. Preserve dirty remote checkouts and existing sessions. Record per-host applied/verified/blocked status.
5. Inspect the three named public targets read-only, then change one site at a time, with one font-only commit per public site. Use self-hosted unmasked WOFF2 with OFL/authorship files, preserve existing font roles and icon fonts, and verify builds plus responsive browser rendering before publication. Follow each repository's publication policy (PR-first unless expressly authorized otherwise). Enumerate additional hosts and proposed changes before touching them.

## Named public targets and intended changes

- `lucashanson.dk`: replace its existing developer/monospace typography with self-hosted Obel Mono; preserve content, layout, icon fonts, effects and existing non-monospace font roles.
- `hbit.sh`: replace its existing developer/monospace typography with self-hosted Obel Mono; preserve content, layout and icon fonts.
- `links.lucashanson.dk`: replace its text font with self-hosted Obel Mono while preserving link destinations, button styles and icon fonts.
- No other public host is approved for mutation by this plan; inventory and name any additional candidate first.

## Rollback and evidence

Keep prior local font settings and external preferences backups. Nix-managed settings roll back through their existing generation mechanism; do not edit store files. Each website gets an independent revertable font-only change. Source edits, installed fonts, loaded app settings, visual proof, publication and remote adoption are separate evidence gates. Missing access or browser infrastructure is a blocker, not proof of success.
