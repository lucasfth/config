# Hbit private SSH bootstrap

Source for an event-driven SSH welcome menu on Gimle. **No website or public
SSH ingress yet.** No timer-driven animation, shell, command execution, SFTP,
forwarding, passwords or anonymous login. Only username `hbit` and allowlisted raw
public keys are accepted. Idle connections expire after 15 minutes; all sessions
after one hour. Uses Go 1.27+, Wish 1.4.7 and Wish's pinned Charm SSH dependency.
An explicit session-request filter rejects agent-forwarding requests that the
upstream session layer otherwise acknowledges.

## Current runtime

- Gimle macOS 26.6.2 ARM64; Apple Container 1.6.1.
- Fixed container `hbit`, one vCPU, **256 MiB guest RAM**. The runtime rejects
  128 MiB (minimum 200 MiB). CPU is scheduled when needed, not a reserved core.
- Scratch image; UID/GID `10001:10001`, all capabilities dropped, root read-only.
- Only named volume `hbit-keys` mounted, read-only at `/keys`. No host home mount.
  Private key is mode 0400, directory 0500, owner 10001 inside the volume.
- Host backup: `~/.local/share/hbit/keys/host_ed25519` on Gimle, mode 0600,
  parent 0700. Do not delete it or the volume when replacing a container.
- Only publication: `127.0.0.1:2222:2222` on Gimle. This does **not** create a
  guest-network firewall: the container also has a vmnet address on Gimle.
  Public-key authentication applies on every interface.
- Hardened image `hbit:hardened` on internal network `hbit-private`, with DNS
  disabled and a 256-file descriptor limit. **Internal is not host isolation:**
  an unfiltered disposable guest reached Gimle at both the vmnet gateway and
  its LAN IP on port 22. Internet port 443 was unreachable in that probe.
- Before serving, the Linux/ARM64 application installs a thread-synchronized
  seccomp denylist and no-new-privileges. Startup fails if this fails. IPv4/IPv6
  `connect`, UDP send calls, exec, io_uring setup, ptrace and several privileged
  interfaces are denied. Accepted TCP connections still work. This is tested
  process hardening, not an independent network firewall or an escape guarantee.
  **No public ingress until a separate host/LAN boundary is verified.**
- No autostart configured; approved bootstrap only, no Nix activation. Long-term
  deployment ownership remains with Nix. No Rosetta installed or global runtime
  properties changed. Failed builder is not running.

Hbit host fingerprint (not Gimle's management host key):

```text
SHA256:PGLFQLOzHPYZlP+aHYZROym3jUb5nUhWUZ99U7P0s+0
```

## Connect from your Mac

First terminal (keep open):

```sh
ssh -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -N \
  -L 127.0.0.1:12222:127.0.0.1:2222 gimle
```

Second terminal:

```sh
ssh -tt -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 -p 12222 hbit@127.0.0.1
```

Compare the initial fingerprint with the Hbit fingerprint above **before**
accepting it. Choices `1`, `2`, `q` followed by Enter. This is a placeholder menu,
not a finished project portfolio. OpenSSH currently warns that this pinned SSH
stack does not negotiate a post-quantum key exchange; do not treat this bootstrap
as production cryptographic qualification.

## Build and test (local source)

```sh
cd configs/hbit
go mod verify
go test -race -timeout 30s ./...
go vet ./...
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -p '*_test.py' -v
out=$(mktemp -d)
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags='-s -w' -o "$out/hbit" .
python3 build-image.py "$out/hbit" "$out/hbit.tar"
```

The OCI packager avoids Apple Container's Rosetta-enabled image builder. Its
Dockerfile equivalent is included. Private keys and allowlists never enter an
image. Transfer only the generated tar to Gimle's
`~/.local/share/hbit/build/hbit.tar`, then:

```sh
export PATH=/opt/homebrew/bin:$PATH
container image load -i ~/.local/share/hbit/build/hbit.tar
container image inspect hbit:bootstrap # verify User 10001:10001
```

For initial volume seeding only, the bootstrap used an ARM64 BusyBox helper pinned
by manifest digest:

```text
busybox@sha256:d82c2ab94640ded77cf76514ce6a84870761105058a4a9e51b05a8a79be97a6c
```

It ran with `--rm --name hbit-key-init -i -c 1 -m 256M --user 0:0 --read-only`,
no published ports or host mounts, and writable named volume `hbit-keys`. A tar
stream over stdin copied only the host key, public key and allowlist from Gimle.
It changed their owner to 10001 and modes to 0400 (directory 0500) and exited.
No private key was placed in argv, logs, source, or an image. Do not re-seed a live
volume or print its contents. The serving container cannot change permissions
because the volume itself is mounted read-only.

## Start, stop and replace (on Gimle)

```sh
export PATH=/opt/homebrew/bin:$PATH
container system status
container run --name hbit -d -c 1 -m 256M --user 10001:10001 \
  --cap-drop ALL --read-only --no-dns --network hbit-private \
  --ulimit nofile=256:256 \
  --mount type=volume,source=hbit-keys,target=/keys,readonly \
  -p 127.0.0.1:2222:2222 hbit:hardened
container logs hbit
container stats --no-stream hbit
```

Do not `run` a second instance over an existing name. To replace it, stop then
`container delete hbit` first; the named volume persists. To stop/start without
replacement: `container stop hbit` / `container start hbit`. Removing the serving
container is rollback; **preserve `hbit-keys` and the host key backup**.
Do not stop the entire runtime if other workloads have subsequently been added.

## Verification, 2026-10-25

- `go mod verify`, Go race tests, vet, and OCI image tests pass locally.
- Tests verify allowlisted PTY menu, no-auth/password/unknown-key rejection,
  exec (including empty exec) and no-PTY rejection, SFTP, local/remote forwarding,
  and agent-forwarding rejection.
- Actual OpenSSH PTY over a strictly verified management tunnel exercised
  Projects, About and Quit. An actual `ssh ... id` request was rejected.
- Container removal/recreation retained the same Hbit fingerprint.
- Inspection confirms CPU/memory, UID, capability drop, read-only root/volume,
  no Rosetta or SSH-agent socket, and loopback publication. `lsof` confirms the
  host listener is `127.0.0.1:2222`.
- Initial short samples: ~6.6–6.8 MiB reported container memory and ~0.00–0.01%
  reported idle CPU. **Host VM RSS ~360 MiB plus ~40 MiB runtime process**;
  guest limit is not total host footprint. Not sustained/load qualification.
- Remote `~/config` still reports only its pre-existing `?? result-tailscale`.
  System launch-daemon filenames unchanged; existing file contents were not
  baseline-hashed, so no byte-for-byte claim. No management SSH changes.
- Runtime initialized its own user services and downloaded recommended Kata
  kernel `vmlinux-6.18.35-197-debug` from
  `https://github.com/kata-containers/kata-containers/releases/download/3.32.0/kata-static-3.32.0-arm64.tar.zst`;
  configured archive digest
  `sha256:8736c054d9223974735394f822000823baef509e1c33405ec798240fa9b6e4b5`.
  Installed under `~/Library/Application Support/com.apple.container/kernels/`.
  The digest is runtime vendor metadata, not an independent local archive hash.

## Public website / DNS follow-up

The operator approved a separate hosting-provider addon domain/zone, with its
own document root rather than the primary site. Authoritative DNS and public
resolution were verified against the hosting provider, not Gimle. No manual
nameserver change or public Mac route was added. Gimle’s dedicated browser
and its same-tab authenticated control-panel handoff were exercised successfully.
Account-specific addresses, endpoints and paths belong in private operational notes.

Hbit still has no HTTP handler, public SSH endpoint or automatic startup.
The requested website should resemble Herdr's Catppuccin terminal and use
the same menu as SSH, never a host shell. Public ingress/TLS remains gated on
network hardening and an explicit ingress choice; do not publish a private IP.

## Hardening verification

On Gimle, a disposable Linux ARM64 test image verified seccomp/no-new-privileges,
IPv4/IPv6 TCP connect EPERM, UDP sendto EPERM, execution/control syscall denial,
and listening allowed. The ordinary SSH boundary suite also passed in that VM
(before filtering in the test runner). After deploying the filtered binary, an
actual OpenSSH PTY over a verified temporary loopback tunnel exercised Projects,
About and Quit; exec `id` was refused and the pinned host key matched. The
temporary test containers and verification tunnel were removed. Latest short
sample: 7.11 MiB reported guest use, 0.00% reported idle CPU. No load claim.

An unfiltered disposable guest on `hbit-private` reached the host through both
the VM gateway and LAN interface; router HTTPS and public internet HTTPS were
unreachable in that probe. This is why internal vmnet alone is not a safe
public host-isolation claim. No host-wide PF edits were performed.
