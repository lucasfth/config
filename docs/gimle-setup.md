# Gimle bootstrap and unattended recovery

Gimle is an Apple Silicon Mac mini. Its local account is `gimle`, with home
`/Users/gimle`; do not substitute the MacBook account or home directory.
The profile is `darwinConfigurations.gimle`, built from the shared flake lock.

## Scope

Gimle shares the MacBook's Zsh/Starship, tmux, Vim theme, Git defaults, safe SSH
client defaults, CLI/development packages and Herdr configuration. It does not
inherit private Git signing keys, login credentials, `nix_secrets`, or the
MacBook's generated EcoRay SSH host include.

The headless profile intentionally excludes AeroSpace/borders, MacBook GUI app
packages and Homebrew casks, the readable-vault mount, Volundr delivery,
Tailwind cleanup and desktop-app activation hooks. Only Bun, Container and
Herdr are declared as Homebrew formulae. Vim uses the terminal package instead
of the default GTK-enabled `vim-full`; the locked GUI package fails to compile
with missing `gui.scale` members. The MacBook's Vim selection is unchanged.
Resolve/CorridorKey work in the primary checkout is not part of this profile.

This profile alone does **not** install or start production Loki, migrate its
state, or establish boot-time Tailscale. The shared Tailscale CLI package is not
a configured system daemon.

## Observed bootstrap state — 2026-10-24

Read over verified, key-authenticated SSH:

- macOS 26.6.2, model Mac16,11, 64 GiB memory.
- Account `gimle`; current local hostname is `Lucass-Mac-mini`.
- FileVault reports **Off**; no FileVault change was made by this setup.
- `sleep 0`, `autorestartatconnect 1`, `autorestart 0`.
- GUI Tailscale and its system extension are running; retain them until a
  coordinated daemon handoff is possible.
- No Nix, Homebrew, tmux or Command Line Tools found during bootstrap checks.
- Root installation is blocked on an interactive sudo password. A detached
  built-in `screen` session named `gimle-setup` is available.

These are dated observations, not proof of cold-boot recovery.

## Resume at the physical console

Use Gimle's Terminal. Passwords are typed only into trusted local prompts,
never supplied to an agent, command argument, log or chat.

```sh
screen -x gimle-setup
```

1. Install Command Line Tools and complete Apple's dialog:

   ```sh
   xcode-select --install
   xcode-select -p
   ```

2. Install Determinate Nix using its official installer, entering sudo locally.
   Keep `nix.enable = false`; Determinate owns the Nix installation.
   Obtain and review the current installer from
   <https://install.determinate.systems/nix> before executing it.

3. Install Homebrew using the official instructions at <https://brew.sh>.
   Do not run a root-owned Homebrew installation or copy the MacBook's prefix.

4. Clone the published configuration to `~/config` after Git is available:

   ```sh
   git clone https://github.com/lucasfth/config.git ~/config
   cd ~/config
   git log -1 --oneline
   ```

   If `~/config` already exists, inspect its remote and working-tree status
   before updating with `git pull --ff-only`; never overwrite local changes.
   Initialize required submodules from the published checkout; never transfer
   the MacBook's ignored secret files, node_modules or private keys wholesale.
   The earlier preview under `~/gimle-setup` was removed; it is not an
   installation source.

5. Build, inspect, then activate as distinct steps:

   ```sh
   . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
   cd ~/config
   nix build .#darwinConfigurations.gimle.system
   less result/activate
   ```

   Review the generated Home Manager activation and Brewfile paths referenced
   in `result/activate`, including removal/replacement behaviour on first
   adoption. Obtain activation approval before using `darwin-rebuild switch`.
   Do not activate the MacBook from this setup checkout.

## Tailscale handoff: separate maintenance step

The GUI macOS apps do not run before login. Use a supported open-source
`tailscaled` system-daemon configuration, authenticate it and prove remote
access without a GUI session. Do not run competing Tailscale variants as a
casual test: they can interfere and the daemon may acquire a different node
identity/address. Prepare a tested LAN fallback or physical console first.
Never stop the only working connection while the operator is away.

FileVault preboot unlock prevents macOS daemons from starting after cold boot.
Its Off observation is not permission to change its policy later. No Recovery
mode, SIP reduction, automatic GUI login or unattended sudo grant is required.

## Acceptance before production cutover

- Confirm installed configuration and exact source revision.
- Confirm `tailscaled` is a loaded system daemon and SSH survives logout.
- With someone physically present, restart without logging into the desktop;
  verify Tailscale and SSH from another host.
- Back up state, approve a controlled power-restoration test, and verify
  power-on plus remote access with no keyboard intervention. A normal restart
  does not prove power-loss recovery; also test delayed router availability.
- Check case-sensitive-path requirements before copying Loki's data to APFS.
- Stop phone production polling and scheduled writers first, capture final
  consistent state including history, then enable Gimle production polling.
- Keep the phone intact for rollback. No phone wipe is part of bootstrap.

The canonical migration design remains in Muninn:
`tech/Loki-MacMini-Cutover-Plan-2026-10-22.md`. Bootstrap observations and source
validation do not establish that the migration has happened.
