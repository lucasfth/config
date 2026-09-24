---
name: operating-loki
description: Use when Lucas refers to Loki, the Android Termux Hermes gateway, or when its Telegram and AI-provider responses stop arriving.
---

# Operating Loki

Loki is the Android Termux host running the Hermes gateway. Diagnose the failed boundary before restarting anything.

## Access and boundaries

```bash
ssh loki
```

- Use the configured `loki` SSH alias; keep direct network identifiers out of this skill and its commands.
- Loki is Termux, not a systemd host. Do not use `systemctl`, `journalctl`, or `ss`.
- Gateway state and logs live under `~/.hermes/`.
- For iPad SSH/VNC, lock-state behavior, or post-restart recovery, use **operating-sigyn**. Loki's matching runtime guide is `~/.hermes/skills/productivity/apple-device-automation/SKILL.md`.

## First triage

```bash
ssh loki 'cat ~/.hermes/gateway_state.json; cat ~/.hermes/gateway.pid; tail -n 200 ~/.hermes/logs/errors.log'
```

| Evidence | Meaning | Next action |
| --- | --- | --- |
| Gateway is running; Telegram is `retrying` | Process survived; channel is disconnected | Test public egress |
| Telegram and an AI provider both report connection errors | Not a Telegram-only failure | Inspect Android network and VPN policy |
| Gateway process is absent or exit diagnostics show `SIGABRT` | Separate native crash path | Read `gateway-exit-diag.log` and the Scudo postmortem |

## Public-egress failure

```bash
ssh loki 'curl -4 --connect-timeout 8 --max-time 12 --silent --show-error --output /dev/null --write-out "%{http_code} %{errormsg}\n" https://api.telegram.org/'
```

If the running gateway cannot reach Telegram **and** another unrelated public HTTPS service, do not restart Hermes first. The fault is Android/Termux egress.

On the Zenfone 10, check Android VPN settings for **Block connections without VPN**. That setting can prevent Loki from using public egress even while private-overlay SSH still works. Disable it when no full-tunnel VPN is intended, or configure the selected VPN to carry the required traffic. Repeat the outbound check, then allow the Telegram adapter to reconnect.

Restart Hermes only after egress works and `gateway_state.json` remains disconnected, or when the gateway process is absent.

## Example

**Symptom:** “Loki stopped replying on Telegram, but SSH works.”

1. Inspect gateway state and recent errors.
2. `running` plus `All connection attempts failed` for Telegram and the provider means test public egress.
3. If that test cannot connect, inspect Android network/VPN lockdown. Do not treat it as a Hermes crash.
4. Once egress succeeds, re-read `gateway_state.json`; restart only if the adapter does not recover.

## Common mistakes

- Restarting the gateway because Telegram is disconnected, without testing public egress.
- Treating private-overlay SSH availability as proof that public internet works.
- Running Linux service-manager diagnostics on Termux.
- Publishing or depending on direct network identifiers instead of the `loki` alias.
