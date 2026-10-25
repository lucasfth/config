# Hbit private bootstrap implementation

Goal: exercise a private, low-idle-cost SSH TUI on Gimle in Apple Container.
Design: `docs/superpowers/specs/2026-10-25-hbit-gimle-design.md`.
Approval: the operator approved the recommended bootstrap and supplied Gimle's
trusted ED25519 fingerprint. No commit, push, Nix activation or public exposure.

1. **Verify host and runtime.** Match the trusted fingerprint, save only the
   matching host key, connect as `gimle`, inspect runtime version/status, remote
   repository status, and launch daemons. Initialize Apple Container if needed.
   Confirm its recommended kernel source/digest and completed installation before
   starting containers. Record failures rather than substituting unverified keys.
2. **Build a tested application.** Create `configs/hbit/go.mod`, `go.sum`,
   `main.go`, and `main_test.go`. Pin Charm Wish. Begin with an SSH integration
   test that expects a welcome/menu session and rejects exec/forwarding/SFTP;
   prove red then implement. Run `go test -race ./...`, `go vet ./...` and
   cross-compile with `CGO_ENABLED=0 GOOS=linux GOARCH=arm64`.
3. **Package and stage.** Add `configs/hbit/Dockerfile`, `build-image.py`, its
   OCI tests and `README.md`. Use a scratch image containing the static binary.
   Package locally without a builder (Gimle’s builder requires absent Rosetta).
   Stage under `~/.local/share/hbit/`, not by overwriting Gimle’s repository.
   Generate a persistent host key with restrictive permissions; seed named volume
   `hbit-keys` via a digest-pinned, short-lived helper reading tar from stdin.
4. **Run and verify.** The runtime rejected 128 MiB before boot (minimum 200 MiB).
   Use fixed name `hbit`, `-c 1 -m 256M --user 10001:10001`, all capabilities
   dropped, read-only root and read-only named key volume, with only
   `-p 127.0.0.1:2222:2222`. Verify actual OpenSSH TTY via a management tunnel,
   strict verification of both host keys, menu and quit, command rejection,
   fingerprint persistence on recreation, and guest/host resource samples.
   Local tests cover subsystem/forwarding/auth rejection. Record remote git
   state and daemon filenames; do not claim byte-for-byte equality without hashes.
5. **Handoff.** Document tunnel/connect, stop/start, rebuild, measurements, and
   limits in `configs/hbit/README.md`. Leave private runtime running only if
   acceptance passes. No automatic startup or public website claim. Rollback is
   `container stop hbit` followed optionally by `container delete hbit`; preserve
   host key. If bootstrap is blocked, report exact blocker and runtime state.

## Executed evidence (2026-10-25)

- [x] Management ED25519 key matched Lucas’s trusted output:
  `SHA256:SnveTd18GOCF49AuMpCsMk3HCHJ7tfWJRJ5iKL1ggKU`.
  Connected with strict host-key checking as `gimle`.
- [x] Runtime healthy and kernel install process exited before container creation.
- [x] 128 MiB attempt rejected before boot: minimum 200 MiB. Do not retry 128M.
  Current inspected resources: 1 CPU, 268435456 memory bytes, UID 10001:10001.
- [x] Local `go mod verify`, uncached race tests, vet and Python OCI tests passed.
- [x] Actual OpenSSH PTY over a strictly verified tunnel displayed `hbit.sh`,
  Projects placeholder, About and Goodbye after input `1`, `2`, `q`.
- [x] Actual `ssh ... id` returned `exec request failed on channel 0`.
- [x] `container inspect` reports hostAddress 127.0.0.1, host/container port 2222;
  remote `lsof` reports only TCP 127.0.0.1:2222 LISTEN for that host port.
- [x] After stop/delete/recreate, logs retained application fingerprint
  `SHA256:PGLFQLOzHPYZlP+aHYZROym3jUb5nUhWUZ99U7P0s+0`.
- [x] Latest short sample: guest memory 7172096 bytes, VM host RSS 370704 KiB,
  runtime host RSS 40688 KiB; ps reports 0.0% CPU at that instant.
- [x] Key seed helper removed; builder not running; only `hbit` listed.
- [x] Handoff in `configs/hbit/README.md`. No commits, Nix activation, public DNS,
  HTTP server or autostart configured. Public website request remains blocked
  on approved Gimle browser tooling, authoritative zone repair and public ingress.
- [ ] Live SFTP, local/remote forwarding and agent-forwarding negative probes
  were not run against the deployed container. These passed only against the
  locally instantiated server in the Go integration tests. Live acceptance is
  therefore limited to PTY/menu, exec rejection, inspected isolation/limits,
  and fingerprint persistence; not complete public-service qualification.
