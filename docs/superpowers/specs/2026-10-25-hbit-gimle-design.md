# Hbit private bootstrap on Gimle

Approved in conversation: a small SSH welcome TUI inside Apple Container on Gimle,
with one vCPU and a sleeping listener rather than stop/start-on-connection.
The runtime rejected 128 MiB before boot (200 MiB minimum), so use 256 MiB.
One vCPU is a scheduling resource, not a dedicated busy core; guest memory does
not include all macOS virtualization overhead.

## Scope and architecture

- Repository source: `configs/hbit/`; initial runtime staging on Gimle under
  `~/.local/share/hbit/`. This is an explicitly approved bootstrap, not a Nix
  activation or permanent launchd deployment. Nix remains deployment owner.
- A static Go / Charm Wish application offers a welcome menu. No host shell,
  command execution, SFTP, forwarding, agent forwarding or credentials.
- Fixed container name `hbit`, one vCPU, explicit 256 MiB, read-only root filesystem,
  UID/GID 10001, and only the persistent Hbit key volume mounted read-only.
- Host key generated on Gimle, outside the image, with host backup mode 0600.
  A short-lived helper seeds a Linux volume with private key mode 0400 for UID
  10001, then exits. No host directory is mounted in the serving container.
  Never copy private keys into this repository or an image.
- Container SSH listens on 2222 internally; host publication is
  `127.0.0.1:2222:2222`. Only user `hbit` with Lucas’s allowlisted public key
  can authenticate. No anonymous/password login. Remote access requires an
  authenticated management SSH tunnel too. Not approved for public exposure.
- TUI is event-driven. No animation timers, busy loops or background jobs.

## Acceptance

Verify Gimle's host fingerprint against the user-provided trusted fingerprint.
Check the runtime and kernel installation before creating a container. Exercise
an actual SSH PTY connection through a verified tunnel, including menu and quit.
Reject exec, SFTP, local/remote forwarding and unauthenticated management access.
Verify read-only root, non-root process, loopback-only host publication, stable
Hbit fingerprint after container recreation, and explicit CPU/memory settings.
Measure guest memory and idle CPU and macOS VM RSS separately. Report short-sample
measurements as such, not sustained load qualification.

## Non-goals and rollback

No website, public DNS/TCP ingress, wake-on-request proxy, Nix rebuild, autostart,
or existing service restarts. Website support is a later slice. Stop/remove only
`hbit` to roll back; retain its private key for stable identity. Container runtime
initialization downloads its vendor-recommended kernel and creates its own user
services; record provenance and do not disturb unrelated launch daemons.

## Bootstrap helper provenance

The key-volume seed helper was removed with `--rm`, with no published ports
or host mounts. ARM64 image pinned to:
`busybox@sha256:d82c2ab94640ded77cf76514ce6a84870761105058a4a9e51b05a8a79be97a6c`.
It received only key files over stdin, set UID/GID 10001 and private key 0400,
and exited. The serving image contains no key material.

## Subsequent public-access request

Lucas said in this conversation: “update the DNS by just accessing the browser
on gomle” and “you should always be using that browser and not the freer one
anymore”. Interpreted `gomle`/`freer` as Gimle/Freyr from context.
Historical restriction was subsequently migrated: Gimle's dedicated `loki_browser`
now performs the authenticated same-tab Nordicway/cPanel handoff. Operator approved
recommended separate addon domain/zone. cPanel confirmed `/home/lucashan/hbit.sh`
separate from `/public_html`; ns1–ns4 answer authoritatively and public A resolves
to Nordicway 142.132.203.237. No route to Gimle was exposed.

## Security follow-up and actual evidence

Operator requires protection against host/LAN access and reverse shells. Serving
image `hbit:hardened` installs Linux ARM64 seccomp with TSYNC and no-new-privileges
before serving. Denies new connections, datagram sends, exec and several kernel
control interfaces. Startup fails closed if installation fails. Disposable real
guest tests passed; serving SSH PTY/menu/quit and pinned key verified afterward.

Internal network `hbit-private` has no observed internet connection, but an
unfiltered guest can reach host gateway and Gimle LAN port22. It is NOT independent
host isolation. Keep public ingress disabled pending a verified stronger boundary.
A no-network disposable guest has only loopback/no routes, but published Unix
socket tests returned no application bytes even without seccomp. Test containers
were removed; existing hardened private TCP service retained. Do not advertise
a working no-network relay or use it for production yet.

## Requested website design (pending design confirmation)

Lucas requests a minimal, immediately interactive website resembling his Herdr
terminal, behaving like the Hbit SSH TUI. Canonical Herdr uses Catppuccin. Proposed
shared menu model with separate SSH and browser transports, never a shell/PTY
subprocess, guest file access or user-supplied code. Dark terminal frame, compact
workspace sidebar, Projects/About pane, keyboard and pointer controls, responsive
mobile layout. Public website, anonymous visitor policy, TLS and ingress need
their own acceptance; an allowlisted bootstrap is not yet `ssh hbit.sh` for anyone.
