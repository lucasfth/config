# Nix Recovery After a macOS Update

The `org.nixos.nix-health` launch agent runs at login and daily. Its health check is embedded in the persisted launchd plist, so it remains executable when `/nix` is gone. `~/config/scripts/nix-health` exposes the same check for manual use.

Run the check manually:

```bash
~/config/scripts/nix-health --check
```

A healthy machine needs all of the following:

- `~/.nix-profile/bin/zsh` is executable.
- `/nix/store` exists.
- `/nix/var/nix/profiles/default/bin/nix` is executable.

## Recovery

1. If the Determinate installer reports a stale encrypted `Nix Store` APFS volume whose keychain password is unavailable, delete that stale volume:

   ```bash
   sudo diskutil apfs deleteVolume "Nix Store"
   ```

2. Reinstall Determinate Nix:

   ```bash
   curl -L https://install.determinate.systems/nix | sh -s -- install --no-confirm
   ```

3. Rebuild this configuration in an interactive terminal:

   ```bash
   cd ~/config
   . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
   sudo nix run nix-darwin -- switch --flake .#lucas-macbook-pro
   ```

4. If AeroSpace or the Tailwind cleanup job did not restart because launchd retained its pre-recovery penalty state, reset both managed jobs:

   ```bash
   launchctl bootout gui/$(id -u)/org.nixos.aerospace
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.nixos.aerospace.plist
   launchctl kickstart gui/$(id -u)/org.nixos.aerospace

   launchctl bootout gui/$(id -u)/org.nixos.tailwind-cleanup
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.nixos.tailwind-cleanup.plist
   launchctl kickstart gui/$(id -u)/org.nixos.tailwind-cleanup
   ```

5. Restart cmux or open new panes. Existing panes retain `/bin/zsh` from before the recovery.

`nix.enable = false` is deliberate: Determinate Nix owns the daemon and garbage collection. Do not re-enable nix-darwin Nix management.
