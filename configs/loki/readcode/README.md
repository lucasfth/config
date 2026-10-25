# Muninn isolated-worker overlay

`upstream_worker.py` fixes native `read_code` workers without changing the vault's
interpreter, JavaScript permissions, backend read-only allow-list, authentication,
or Company-library workers. Only `server_transports.MuninnLocal` gets this fixed
private path:

```
~/loki-data/live/hermes/mcp-vault-server/readcode/worker-vendor
```

`server_transports.py` is the unchanged original, retained here as context; it does
not scan or inherit parent `site-packages`. `worker-packages.json` pins the vault
worker import closure (PyYAML, FastAPI and required dependencies), not a whole
Hermes environment. The existing vault `requirements.txt` declares these roots.
No editable import hooks, `.pth` files or package install scripts are copied.

## Prepare, test, deploy

1. Run `scripts/loki-readcode-vendor SOURCE_SITE_PACKAGES SCRATCH/worker-vendor`.
   The tool verifies exact versions and each distribution's RECORD hashes. It
   never imports source packages and refuses to overwrite a destination.
2. Test a scratch copy of the vault sandbox using the normal native Python with
   `-I`, the copied vendor directory, and the existing lockfile-installed QuickJS.
   Exercise broker read/list and denied-write paths; do not loosen Node permissions.
3. Obtain approval for the exact live file/directory install. Preserve the original
   worker and its SHA-256 in private encrypted recovery storage, verify the
   transferred manifests, then atomically replace the worker file. Never replace
   credentials, vault configuration, or `server_transports.py` with a candidate.
4. Fresh upstream processes load the worker file per request. Test through the
   normal MCP client before requesting any service restart; one was not required
   in the 2026-10-25 repair. If a restart becomes necessary, coordinate MCP writes
   and obtain approval independently.
5. Rollback restores the preserved worker and removes the newly provisioned vendor
   directory after checking ownership/hashes; it does not modify the vault or
   restart unrelated services.

Live acceptance on 2026-10-25: normal MCP list/read succeeded, write was denied,
346 copied file hashes matched distribution RECORDs, and the serving vault PID
was unchanged. A deliberately bounded read reported truncation correctly.
This does not establish reboot or backup calendar-trigger acceptance.

## Tests

```sh
python3 tests/loki-readcode-transport.py
python3 tests/loki-readcode-vendor.py
```
