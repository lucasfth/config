# Raycast Configuration

This directory holds three kinds of repository-owned Raycast inputs and exported
preference snapshots. Application preferences themselves are configured in
Raycast; they are not declaratively managed by Nix.

- `ai/providers.yaml.template` is the secret-free source for custom AI providers.
  Home Manager generates the local provider file during activation using values
  from `nix_secrets`; do not put credentials in this template.
- `scripts/` contains Raycast Script Commands. Home Manager exposes these under
  `~/.local/share/raycast-scripts/` after activation.
- `shell-discovery/` is the native Raycast extension. For local development,
  run `npm ci` then `npm run dev` in that directory; `npm run build` builds it.
  These commands develop/import locally and do not publish to the Raycast Store.
- `exports/` stores manually exported `.rayconfig` preference snapshots. Create
  an export with `raycast export --output raycast/exports/<name>.rayconfig`.
  Review snapshots for sensitive data before committing; they are exports, not live app settings.

### Existing export audit limit

The two dated `.rayconfig` files in `exports/` are opaque binaries already present in public Git history. Their decoded contents have **not been verified**; printable-string scans and failed generic decompression do not establish that they are free of credentials or personal settings. Do not treat these exports as reviewed templates or add replacements without a format-aware sensitive-data review. If an actual credential is identified, revoke/rotate it and address historical exposure separately; deleting a current file does not remove Git history.

See the [root README](../README.md#shell-discovery-extension) for Shell Discovery
behavior and [COMMANDS.md](../COMMANDS.md#raycast-shell-discovery) for its commands.

## Shell Discovery dependency security

The pinned `@raycast/api@1.104.22` build toolchain uses an explicit esbuild
`0.28.1` override for [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)
(Dependabot #42). The advisory affects development-server file serving on Windows;
the override removes the vulnerable dependency without changing the Raycast API
major version. Revisit the override when upgrading that API dependency.

Verification: `npm audit` reported zero vulnerabilities; `npm run typecheck`,
`npm run lint` and `npm run build` passed. The build compiled all four extension
entry points; Raycast GUI interaction and Windows exploitation were not tested.