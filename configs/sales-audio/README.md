# Shared sales voice transcription

Mini's shared OpenClaw audio configuration uses Freyr's existing WhisperX service.
Lucas approved Freyr as the fallback transcription destination and requested coverage
for all sales agents on 2026-10-21. No public-cloud transcription fallback is configured.

## Failure and repair

The old autodetected OpenAI transcription request targeted Neo's private chat proxy.
The gateway rejected it with `SsrFBlockedError`; a separate authenticated route probe
with no recording returned HTTP 404 for `/v1/audio/transcriptions`. Relaxing the SSRF
policy alone would not supply a working transcription API.

`transcribe.mjs` implements OpenClaw's existing CLI audio contract: it uploads one
local attachment to an operator-configured fixed Tailnet `/transcribe` endpoint and
prints only the transcript. It preserves sandbox network isolation, chat model
routing, Google credentials and general SSRF policy. The helper needs no API key.

Limits: 20 MiB input, 2 MiB JSON response, 90-second total HTTP deadline, redirects
rejected, empty transcript treated as failure. Only configured media roots may be
read by the CLI. Endpoint configuration must be owned by the service UID with mode
0600. No arbitrary URLs, cloud retries or transcript echo messages are supported.
The provider is currently Danish-oriented; English accuracy was not qualified.

## Deployment ownership

Repository source: `configs/sales-audio/transcribe.mjs`. Deployed helper and private
endpoint configuration are under Mini's existing
`~/.local/share/openclaw-sales-stage-v2-20261006/runtime/sales-audio/`.
The endpoint file contains `endpoint` and `mediaRoots`; host addresses are not
committed here. Production roots include the state directory's `media/inbound`.
Synthetic qualification files are kept in the helper's `qualification/` directory.

The existing OpenClaw configuration owns activation:

```json
{
  "tools": {
    "media": {
      "models": [{
        "type": "cli",
        "command": "<existing absolute Node executable>",
        "args": ["<absolute transcribe.mjs>", "<private endpoint.json>", "{{AttachmentPath}}"],
        "capabilities": ["audio"],
        "timeoutSeconds": 100,
        "maxBytes": 20971520
      }],
      "audio": {"enabled": true, "echoTranscript": false}
    }
  }
}
```

Back up and compare the exact live configuration before applying this stanza. Do
not overwrite unrelated concurrent changes. No new service or cron is installed.
The installed OpenClaw 2026.10.4 reload planner classified only `tools.media` as a
hot reload with no gateway/channel/service restart. The live gateway confirmed
`config hot reload applied (tools.media)` at 11:40:22 Copenhagen time; PID 76913
was unchanged. Other versions must re-evaluate their own reload plan.

## Verification

```sh
node --test configs/sales-audio/*.test.mjs
```

Six tests cover request format, endpoint restrictions, input/response limits,
upstream errors and empty transcripts. Live synthetic Danish speech was correctly
transcribed from both AIFF and Telegram-compatible OGG/Opus.

Using the production configuration, `infer audio transcribe --agent <id>` passed
for all 11 enabled Mini sales accounts: Matilde, Freja, Julian, Kristian, Ulla,
Ramses, Vera, Pia, Ole, Luna and Isabella. There were no per-agent media overrides.
Disabled accounts were not enabled. This does not establish coverage on other hosts.

The installed inbound `applyMediaUnderstanding` processor also passed with the
OGG/Opus fixture: audio decision `success`, attachment `completed`, `ctx.Transcript`
populated and transcript included in `ctx.Body`. Its input must use canonical
`ctx.media` facts; obsolete `MediaPath` projections alone result in `no-attachment`.
Initial fixture checks used those obsolete fields and therefore tested no audio;
the canonical-facts run closes that gap. Temporary synthetic files in `media/inbound`
were removed, and the final test ran solely from the qualification directory.

These receipts prove configuration-wide CLI routing and the actual inbound media
processor with synthetic audio. They are not a new Telegram-user recording or a
long-running reliability/accuracy guarantee. No test Telegram message was sent.

## Remaining operational concerns

Freyr's WhisperX listener remains on all interfaces. The later firewall hardening
restricts TCP/9090 to `tailscale0`; see the [Freyr service runbook](../../nix/hosts/freyr/gpu-services.md#network)
for the recorded generation-37 activation and bounded post-switch checks.
Those historical checks are not a fresh live verification by this publication.

Mini's low disk capacity remains separate. The helper does not remove source
recordings or alter queued updates. Existing-session reply/model errors and
Kristian's browser/Klaus instructions need their own checks.

Rollback: restore only the previous `tools.media` value from the private config
backup `openclaw.json.pre-sales-audio-20261021`, preserving later unrelated changes,
then verify hot reload. Do not restore agent databases or rotate unrelated credentials
as part of audio rollback. Source edits do not imply deployment approval.
