# Gimle development parity — 2026-10-27 re-audit

Status: **usable in part, not complete parity**. This is a fresh audit; earlier
“matched” checkpoint claims are not a substitute for the state below. No
production activation, deployment, service restart, or credential migration was
performed. After separate explicit approval, only the private Muninn endpoint
source under `/Users/gimle/config/nix_secrets` was changed and managed Pi MCP
configuration regenerated. The protected checkout still has22 status entries;
no tracked source, rebuild, activation, or unrelated configuration was changed.

## Completed and checked

- GitHub CLI already authenticated as `lucasfth`; authenticated Git HTTPS reads
  succeeded. No new GitHub login or token copy. No push was used to test access.
- Clean EcoRay web `dev` checkout fast-forwarded from `72231c91` to the MacBook's
  `17626cf225443c856f9d45d981022ac7a312bf50`.
- Clean web `.worktree/3001` switched from `main` to `fix/v5` at MacBook commit
  `f91e184007e1e91115ebd76b28ddaf92facef48b`. It has no configured upstream;
  choose the intended remote branch before pushing.
- Web `.worktree/3002` already matches
  `37135cfe7` on `louise/v3-sizing-regression-20261026`.
- Report checkout matches `3a4382094` on
  `fix/chronological-storage-reader`; its 10 pre-existing dirty entries remain.
- Commits were transferred with a bounded incremental bundle. Local/remote
  SHA-256 matched; remote `git bundle verify` passed before fetching into
  `refs/remotes/macbook/*`. An interrupted large bundle was removed, not fetched.
- Seven development checkouts passed `bun install --frozen-lockfile
  --ignore-scripts`, with manifests and tracked status unchanged by installation.
  This is not blanket permission to run dependency lifecycle scripts.
- The four web checkouts' pinned `node_modules/bun` executable was broken because
  its installation step had not run. Ran that package's `node install.js` only;
  all four `node_modules/.bin/bun --version` probes now return `1.4.2`.
- Installed host tools: Bun `1.4.4`, Nix Node `22.23.3`, Firebase CLI `15.34.1`,
  Gum `2.0.2`, Herdr `0.9.5`. Node22 satisfies the projects' engine constraints;
  do not reproduce the MacBook non-interactive Node26 PATH accidentally.
- Created ignored **synthetic-only** `.env` files, mode0600, in the report and
  `report-gimle-demo-fix` checkouts. Generated from each `.env.example`, using
  `demo-ecoray-report`, loopback emulators and a local Turnstile stub. No MacBook
  production credential values were copied; provider credentials remain blank.
- Fresh report demo qualification: outbound denied by sandbox, loopback allowed,
  emulator startup, synthetic seeding, Nuxt loopback readiness, 120-second stable
  run, owned-process cleanup, no remaining demo listeners. This is **not** proof
  of completing submission, email, financing, hosted auth, or production flows.
- `muninn-viewer`: matching `48067e045`, build/typecheck exit0 and111 tests pass.
  Missing MacBook-only extraneous `esbuild` is not a required package in this
  lockfile. Report does not declare Playwright either; avoid treating extraneous
  MacBook `.bin` entries as requirements. Web's declared Playwright runs
  `--version`; browser installation/workflows were not qualified.
- Added unmanaged, mode0700 launchers, without touching generated shell files:
  - `~/.local/bin/gimle-dev COMMAND ...`: explicit development PATH, **not** a
    private-environment loader. Tested Bun/Node/Firebase/Gum/Herdr invocation.
  - `~/.local/bin/hugi`: shortcut to Gimle's existing managed Pi through its
    interactive shell/private environment, not a separate agent implementation.
    `command -v hugi` and version1.4.0 passed. Existing pinned Pi dependencies are
    present; no global Pi replacement or production-config install occurred.

For non-interactive SSH, use explicit paths:

```sh
ssh -nT gimle '~/.local/bin/gimle-dev bun --version'
ssh -nT gimle '~/.local/bin/hugi --version'
```

Use `-nT` for bounded Pi requests so an open SSH stdin is not mistaken for a
provider timeout. Interactive terminal sessions have Homebrew PATH already;
ordinary non-interactive/login shells still do not automatically get it.

## Remaining gaps / decisions

### Muninn MCP endpoint — repaired with explicit approval

Gimle's private Muninn URL still designated its offline former Tailscale peer.
With Lucas's explicit approval, changed only `MUNINN_MCP_URL` in the private
environment to the verified current peer and regenerated the Muninn entry
through managed Pi's `prepareRuntime`; other MCP entries were checked unchanged.
Exact private endpoint metadata stays in the private host receipt, not Git.
No service restart or infrastructure reconnection was performed.

`hugi mcp list --json` now exits0: Vercel, Supabase, company-library and Muninn
all connect. Authenticated `vault_read` calls for the two canonical vault-rule
notes passed. A real bounded Pi project read returned `GIMLE_DEV_PARITY_READ_OK`.
The initial full private-environment backup was removed; only the endpoint line
is retained for rollback, mode0600. Do not copy the private receipt into Git.

### EcoRay web environments — synthetic setup, limited smoke proof

With Lucas's explicit emulator-only approval, created ignored0600 `.env` files
in web root/3001/3002. They use `demo-roof-drawing`, which the loopback client
actually selects, Auth9099 and Firestore8187. No MacBook production credentials
or admin login password were copied. The newly created ignored3003 `.env` was
removed; its staged working state remains untouched.

Sandbox smoke passed: external networking denied, Auth/Firestore/Storage
emulators started, Nuxt served3109 and remained alive20seconds; owned processes
cleaned up. Existing unrelated report emulator processes on9150 were identified
and left alone; this smoke's Firestore websocket used9151.

This proves startup only, **not** Admin SDK operations, authenticated UI, data
flows or Storage. The client does not call `connectStorageEmulator`, so Storage
flows remain unqualified. Startup logs warn about missing email/SMS/CRM/Resurs
credentials and Firebase Admin credentials; no production keys were added to
silence them. Emulator-aware Admin code exists, but its actual request path was
not exercised. Firebase CLI has zero logged-in accounts; cloud work still needs
Lucas's interactive login. GitHub/Vercel/Supabase did not need reauthentication.

Private runtime config: `~/.local/share/gimle-dev/web-demo/firebase.demo.json`.
Bounded repeatable qualifications are saved under
`~/gimle-setup/dev-parity-20261027/qualify-{web,report}-demo.py`; these use an
outbound-denying sandbox, isolated HOME, explicit ports, and owned-only cleanup.

### Worktree and config differences — preserved

- Gimle web3003 is `fix/localhost-staging` at `72231c91f`, not MacBook
  `527959324`. It has a large staged change set, preserved rather than reset,
  carried over, or committed. Status-entry counts may change when shared Git
  refs/worktrees move; no staged file contents were intentionally changed.
- Development config checkout `/Users/gimle/Desktop/code/config` is clean at
  `c0a80c8f`, behind MacBook `7d0d1fbc`. This is separate from protected
  `/Users/gimle/config`. Neither checkout's tracked sources were changed; the
  separately approved private endpoint repair above is the only config mutation.
- The unpublished report/web type-repair worktrees under MacBook `/private/tmp`
  are not copied. Report typecheck/build/Bun pass but baseline Vitest fails;
  web remains typecheck/full-suite failing. Do not imply system setup fixes these
  application gates. Storage PR16 remains draft/unmerged.

### Dependency warning and runtime qualification limits

Both machines have `html2canvas-pro`2.4.5 with byte-identical CJS/ESM files; the
tracked2.4.0 patch does not apply, and its curve/scaled-shadow changes are absent
on both. This is a **shared repository issue**, not a Gimle-only difference.
Regenerate/test/review the patch separately if those fixes are still required;
no manual dependency-source patch was made.

Firebase Java emulators work in the isolated demo. Yaak, Zed and Ghostty app
bundles exist. App-bundle presence does not prove account login, settings parity,
or a complete API/browser workflow. No ordinary browser was opened. Docker,
provider logins, private certificates, signing keys, and external integrations
were not assumed or copied.

## Evidence

Remote receipts: `/Users/gimle/gimle-setup/dev-parity-20261027/` (frozen install
results/logs, viewer build and test logs). Session-local receipts include
`/tmp/gimle-dev-parity-audit.json`, `/tmp/gimle-parity-final-probe.jsonl`,
`/tmp/gimle-dev-parity-demo-current.log`, `/tmp/gimle-web-demo-qualification2.log`,
`/tmp/gimle-hugi-mcp-repaired.json`, and `/tmp/gimle-hugi-dev-parity-read.log`.
Environment audits emitted names and classes, not values. Local type-repair
checkpoint: `/tmp/gimle-type-safety-checkpoint.md`.
