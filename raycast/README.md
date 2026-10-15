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

See the [root README](../README.md#shell-discovery-extension) for Shell Discovery
behavior and [COMMANDS.md](../COMMANDS.md#raycast-shell-discovery) for its commands.