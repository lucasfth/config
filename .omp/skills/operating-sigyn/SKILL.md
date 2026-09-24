---
name: operating-sigyn
description: Use when Lucas refers to Sigyn, asks to control or recover the iPad, or when Sigyn SSH/VNC fails after lock, sleep, restart, battery loss, or Tailscale changes.
---

# Operating Sigyn

Sigyn is Lucas's sixth-generation iPad on iPadOS 17.7.11. It runs rootless palera1n, hardened OpenSSH, and a privately patched TrollVNC build. Use the existing installation; never reinstall, reboot, erase, downgrade, change jailbreaks, expose services, or weaken the passcode without Lucas's explicit approval.

## Access

From the Mac:

```sh
ssh sigyn
sigyn-vnc capture /tmp/sigyn.png
```

From Loki:

```sh
ssh -o BatchMode=yes sigyn id -un
~/.local/bin/sigyn-vnc capture ~/.config/sigyn/screen.png
```

The VNC helper creates a short-lived Unix-socket SSH tunnel. VNC listens only on iPad loopback; never connect to or expose TCP 5901 directly. SSH accepts keys for `mobile`, refuses password authentication and root login, and listens only on Sigyn's assigned Tailscale IPv4.

A fresh screenshot is required before each new UI action. A stale frame is not proof that the display is live or unlocked. `sigyn-vnc home` can wake the display but cannot authenticate. Protected apps require local unlock; no passcode is stored for agents.

## After restart or flat battery

Installed packages and settings persist, but the active palera1n jailbreak does not. Stock boot has no jailbreak SSH/VNC. Recovery requires Lucas, the Mac, and the Lightning cable:

1. Connect Sigyn directly to the Mac and keep it powered.
2. Run `~/.local/bin/palera1n -l` in the current OMP session terminal. Use its PTY when interactivity is required; do not open a separate macOS Terminal window.
3. Press Enter when prompted and follow palera1n's on-screen DFU button instructions. Do not substitute chat countdowns. On Apple Silicon, the official guide says to unplug and replug after `Checkmate!` if required by the run.
4. Wait for iPadOS to boot, then have Lucas unlock locally. Ensure the existing Tailscale app reconnects; do not re-enroll it unless Lucas approves.
5. Verify from the Mac:

   ```sh
   ssh -o BatchMode=yes sigyn 'id -un; test -d /var/jb && echo JAILBREAK_ACTIVE'
   ```

   Expected: `mobile` and `JAILBREAK_ACTIVE`.
6. Verify screen access without changing state:

   ```sh
   sigyn-vnc capture /tmp/sigyn-recovery.png
   ```

   Inspect the image. If it is the lock screen, Lucas unlocks locally.
7. Verify Loki independently:

   ```sh
   ssh loki 'ssh -o BatchMode=yes sigyn id -un'
   ssh loki '~/.local/bin/sigyn-vnc capture ~/.config/sigyn/recovery.png'
   ```

Do not reinstall Sileo, OpenSSH, ElleKit, PreferenceLoader, or TrollVNC merely because the active jailbreak was lost. Their rootless state should return when palera1n boots the jailbreak again.

## Failure boundaries

- `ssh sigyn` times out after successful palera1n: confirm Sigyn is unlocked and Tailscale connected.
- Tailscale re-enrollment may change its IP. The SSH daemon is deliberately bound to the old assigned IPv4, and both aliases use that address. Update the private `SIGYN_IP`, regenerate the Mac SSH config, and update the iPad launchd `ListenAddress` together; preserve a rollback path.
- Unexpected SSH host-key warning: stop. Verify the device/key before changing `known_hosts`; never bypass host checking.
- SSH works but VNC fails: inspect the TrollVNC launchd service and managed preferences. Do not expose 5901 as a workaround.
- Cold restart without Lucas physically present: blocked. Dopamine is only semi-untethered and is not installed; it would still require local on-device activation and signing maintenance.

## Durable sources

- Mac alias: `nix/common/ssh.nix`, private `SIGYN_USER`/`SIGYN_IP`, and bare shell alias in `nix/common/shell/aliases.nix`.
- Client: tracked `scripts/sigyn-vnc`, deployed as `~/.local/bin/sigyn-vnc`.
- Patched package: `~/.local/share/sigyn/trollvnc-3.2-272-3327a3a-rootless.deb`.
- Private credentials: Mac and Loki `~/.config/sigyn/vnc-password`; never print or record their values. Loki uses `~/.ssh/id_ed25519_sigyn`.
- Full runbook: Muninn `tech/Sigyn-Operations-and-Recovery.md`.
- Build/security record: Muninn `tech/ipad-mac-huginn-apple-access-plan-2026-09-23.md`.

For Uber, load Loki's `uber-mcp-rider` skill. A quote is read-only; never progress past it without presenting pickup, destination, date/time, ride type, and current fare, then receiving Lucas's explicit yes for that booking.
