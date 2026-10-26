# Private Hbit SSH shortcut

`hbit.conf` and `known_hosts.hbit` are consumed by `nix/common/ssh.nix`'s host
config generator, gated to `lucas-macbook-pro`. The generator appends the Hbit
block to the existing generated include and installs the dedicated server-key
pin mode 0600. Do not manually edit the generated SSH config.

```sh
ssh hbit.sh
```

This is a client-only alias, not public DNS routing. The Mac authenticates to
`gimle` using the existing SSH config, then forwards the SSH byte stream to the
Hbit application's `127.0.0.1:2222` listener. Hbit uses a separate pinned host key,
username `hbit`, and the existing allowlisted client identity. No agent forwarding,
new public/tailnet listener, server credential installation, or router change.

Verified 2026-10-25: source generator rendered and syntax checked, staged output
preserved existing host blocks byte-for-byte, then only that generator was run
(no full system activation). Actual `ssh -G hbit.sh`, PTY menu/Help/quit and exec
rejection passed. The existing include backup is under `~/.ssh/config.d/ecoray.pre-hbit.*`.

The source additions must accompany `nix/common/ssh.nix` in any Git publication
or flake build. Changes are not committed/pushed by this operation. Website DNS
is independent and remains an outstanding task.
