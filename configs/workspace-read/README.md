# Scoped Drive reads

Read-only Google Drive support for Isabella's existing Mini → Neo Google bridge.
Approved and deployed 2026-10-21. Credentials, principal grants and delegated
subjects remain host-owned and unchanged; only `mini-isabella` gets new operations.

## Source and deployment

- `drive.mjs`: Neo Drive API implementation, 128 KiB metadata/list limit,
  8 MiB file limit, 15-second shared metadata/body deadline, fixed Google URLs,
  redirects denied. Supports PDF, common images, text, CSV, DOCX, XLSX;
  Google Docs/Slides export as PDF and Sheets as XLSX.
- `drive-download.mjs`: Mini adapter validates the file ID, byte count, SHA-256
  and extension, saves a 0600 file in a new 0700 directory inside the configured
  workspace, and returns a workspace-relative path. Transport base64 is stripped
  before the model/tool response. The downloaded document itself remains untrusted.
- `neo-service.patch`: narrow integration into Neo's existing
  `~/.local/openclaw-host/workspace-read-stage/service.mjs`.
- `mini-services.patch`: narrow integration into Mini's existing
  `~/.local/share/openclaw-sales-stage-v2-20261006/library-sales-20261008/mini-services.mjs`.

These are maintenance patches against the captured host sources, not complete
service deployments or Nix activation. Apply with `patch --dry-run` first and
inspect for source drift. `drive.mjs` belongs beside both entry points;
`drive-download.mjs` belongs beside Mini's adapter. Run `node --check` before
activation. A deployment needs explicit approval; it is not implied by editing
these files. No automatic deploy command is provided.

Neo's lifecycle owner is `com.ecoray.workspace-read`; Mini's gateway owner is
`dk.ecoray.sales-gateway-v2`. The gateway caches per-session MCP schemas. A fresh
standalone MCP call does not establish that an existing conversation refreshed.
Do not kill unidentified adapter processes. In the approved deployment a controlled
Mini gateway restart refreshed the cache after confirming no running sessions.

## Tool contract

`mini-services__isabella_google` retains existing Google operations and adds:

- `drive_search`: escaped full-text search, `query`, optional parent `id`.
- `drive_list`: folder listing, optional parent `id`.
- `page_token`: continue either listing, at most 20 entries per response.
- `drive_metadata`: inspect a file `id`.
- `drive_read`: download a file `id`; returns metadata, SHA-256, byte count and
  a private local path such as `.drive-XXXXXX/document.pdf`.

No caller-selected Google identity, arbitrary URL, Google writes, uploads,
sharing, deletion or sending. Google Drive access follows the delegated user's
existing ACLs; a 403/404 must not be bypassed by switching to another principal.
Other agents retain their existing operation schemas. Klaus A2A is unchanged.

Files are retained in the agent workspace; there is no automatic retention job.
Mini's low disk capacity remains an independent operational concern. Oversized
files return `file_too_large` rather than partially downloading into the workspace.
An unsupported file type returns `unsupported_file_type`.

## Verification

```sh
node --test configs/workspace-read/*.test.mjs
```

11 checks cover >128 KiB downloads, declared/actual oversize rejection, native
exports, metadata caps, escaped searches, invalid input, upstream denial,
unsupported types, private permissions and integrity/path validation.

2026-10-21 live acceptance: direct Mini MCP search, metadata and download worked
as `mini-isabella` / Philip's assigned identity. A real 299,593-byte bilag PDF
passed SHA-256 and PDF-header checks. After the approved gateway restart,
Isabella's original main session executed metadata, download and sandbox `exec`
checks successfully (persisted transcript events 427–436, completed at 11:08
Copenhagen time). No customer document body was needed for this qualification.
The CLI timed out, so acceptance relies on persisted tool results, not CLI exit.
Docs/Sheets exports passed fixtures but were not exercised on live documents.

## Rollback

Original host entry points are retained beside each file with suffix
`.pre-drive-20261021`; private controller copies also exist outside Git. Compare
hashes before restoring, preserve subsequent edits, and get restart approval.
Restore Neo's entry point and restart only `com.ecoray.workspace-read`; restore
Mini's adapter and refresh its cached runtime through an approved lifecycle path.
Unused helper modules are harmless after reverting imports. Never roll back
agent databases or credentials to undo this code change.

## Kristian: Klaus tasks and complete report reads

`kristian-services.patch` applies after `mini-services.patch` and changes only
Kristian's Klaus registration/context and his existing scoped Google/document
operation schema. Other agents retain the previous contracts.

- `klaus-task.mjs`: submit once with A2A `returnImmediately`; return an HMAC-bound
  task reference for later `GetTask`. Each HTTP request is bounded to 20 seconds,
  below the 65-second MCP deadline. No automatic submission retries. Task references
  are scoped to agent/context and expire after 24 hours. VPS task state is in memory:
  a VPS restart can invalidate tasks, which must be reported, not silently resubmitted.
- Kristian's dedicated context moved from `mini-kristian-main-v1` to
  `mini-kristian-main-v2` after operator approval. Old transcripts remain intact.
  The old context had a 985-second recursive grep; stopping only that identified
  read-only process allowed progress. Its saved task still reported working after
  replies completed. A clean-context test completed correctly; no shared VPS A2A
  code or database was modified. Root cause of the old task-correlation mismatch
  is not proven; changing context is a scoped recovery, not a shared-code fix.
- `report-read.mjs`: `mini-services__kristian_google` operation `report_read`,
  parameter `id`, fetches only the user-supplied EcoRay snapshot from the fixed
  public HTTPS endpoint. No credentials, redirects, writes, arbitrary URLs or
  report mutations. Maximum response 2 MiB; saves a 0600 JSON file in a new 0700
  `.report-*` workspace directory. Returns path/hash/size, no customer values.
- `kristian-local-host-services.md` captures the deployed guidance: use web_fetch
  for ordinary links; use the scoped file-backed operation for report snapshots;
  retrieve pending Klaus tasks rather than resubmitting; never bypass sandbox
  isolation with shell downloads or use inherited Marie/VPS credentials.

Mini's `tools.web.fetch.maxCharsCap` was separately approved and raised to 60000;
the default remains 20000. The fetch itself then stopped truncating the 48k report,
but the tool-result wrapper still clipped it. The file-backed report operation
addresses that second boundary without raising generic model tool-output limits.

Live Kristian acceptance before the final report-tool refresh: web_fetch returned
HTTP 200 and the EcoRay title; his task-aware tool submitted once, retained the
reference, and retrieved `completed: KLAUS_OK` in isolated session
`agent:kristian:verified-capabilities-v2`. Run receipts are private operational
artifacts. Direct report-tool qualification read the same previously failing
user-supplied snapshot, returned a 353-byte receipt, and verified full JSON/hash.

Final consumer qualification after the coordinated approved Mini restart: run
`8d109d02-dc3f-40ca-a1a0-39e970269e2a` used Kristian's `report_read` operation and
local sandbox Python to verify the complete 24,196-byte source JSON, SHA-256,
and `snapshot`, `payload`, and `calculation` presence. No report edits or customer
messages were requested by the diagnostic. All 11 enabled Telegram accounts
reported running/connected/ready; model runtime was not degraded. Mini PID41948
was ready at 12:40 Copenhagen time. The separate dreaming owner deployed its
qualified scope patch in the same stopped window; its acceptance is tracked by
that session, not inferred from these document tests.

Interactive sandbox-browser control is not repaired or newly qualified here.
The user-visible link/report reading path is restored through web_fetch and
the scoped report tool. PDF generation/edit workflows remain separate.
A group send (Kristian message13433, topic286 at12:20) remains unattributed; do not
claim no outbound sends merely because the diagnostic sessions had no target.
Isabella message680 at12:41 coincided with real main-session activity; no business
content review or send-to-turn attribution was performed.

Rollbacks are per-surface: `mini-services.mjs.pre-kristian-task-20261021`,
`mini-services.mjs.pre-context-v2-20261021`, and
`mini-services.mjs.pre-report-read-20261021`. Preserve newer unrelated changes.
Never restore a full older openclaw.json to undo one operation or limit change.
