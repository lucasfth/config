---
name: slack-gateway-troubleshooting
description: Debug Slack gateway startup, target discovery, and "no Slack access" reports in Hermes.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [slack, gateway, troubleshooting, messaging, channel-directory]
---

# Slack Gateway Troubleshooting

Use this when Slack looks configured but the session only shows Telegram or says it has no Slack access.

## Typical symptoms

- `hermes gateway status` says the gateway is not running even though a process exists
- Slack adapter logs show `slack-bolt not installed`
- Slack is connected in runtime state, but `send_message(action="list")` shows no Slack targets
- Telegram session says it can only reach Telegram
- `~/.hermes/channel_directory.json` has `"slack": []`

## Root causes seen in practice

1. Slack Python deps missing in the active venv
   - `slack_bolt` and `slack_sdk` are not installed
2. Gateway restart conflict
   - a new `hermes gateway run` exits because another gateway process is already running
3. Slack target discovery is empty
   - the channel directory builder falls back to session history and never enumerates live Slack channels
4. Slack bot lacks channel read scopes
   - private/public channels won’t appear without the right Slack scopes and membership
5. Capability mismatch: model can list/send but cannot read history
   - `send_message` tool previously supported only `action=list|send`, so agents reported “I can’t summarize without pasted messages” even when Slack was connected
   - fix by adding `action='read'` for Slack and wiring it to `conversations_history`
6. Prompt-level platform notes can mislead troubleshooting
   - gateway session notes saying “no Slack-specific APIs” may still appear while backend capabilities evolve; verify tool schema/runtime instead of trusting prompt text alone

## Fast debug flow

1. Check live process state
   - `ps -ef | grep 'hermes gateway run' | grep -v grep`
   - inspect `~/.hermes/gateway_state.json`
2. Check Slack deps in the active venv
   - `source venv/bin/activate && python - <<'PY'`
   - `import importlib.util; print(importlib.util.find_spec('slack_bolt')); print(importlib.util.find_spec('slack_sdk'))`
3. If missing, install them in the project venv
   - `python -m pip install slack-bolt slack-sdk`
4. Restart the gateway with replace semantics if another instance is alive
   - `hermes gateway run --replace`
5. Inspect channel discovery
   - `cat ~/.hermes/channel_directory.json`
   - Slack should not be empty if discovery works
6. Re-run a smoke test for Slack enumeration
   - call the channel directory builder with a fake Slack client or verify the live directory contains Slack entries

## Implementation pattern

If Slack targets are missing but the adapter is connected, fix `gateway/channel_directory.py` so Slack uses live API enumeration first:

- prefer `app.client.conversations_list(...)`
- include public channels, private channels, DMs, and MPIMs
- dedupe by channel ID
- merge session-based fallbacks afterward
- keep fallback to session history if live enumeration fails

This is better than only relying on old sessions, because new channels become available immediately after startup.

If users ask to summarize a Slack channel and tooling only lists/sends:

- extend `tools/send_message_tool.py` schema `action` enum to include `read`
- route `action='read'` to a new `_handle_read(args)`
- resolve human channel names via `resolve_channel_name("slack", name)`
- read with `slack_sdk.web.client.WebClient(...).conversations_history(channel=..., limit=...)`
- return normalized messages (`ts`, `user`, `text`) as JSON
- keep scope explicit: Slack-only for now; fail clearly on other platforms

This closes the “Slack connected but cannot summarize” gap without requiring users to paste exports.

## Verification

Use both a code-level and runtime check:

- `python -m py_compile gateway/channel_directory.py tests/gateway/test_channel_directory.py`
- a direct smoke test against a fake Slack client or live adapter object
- verify `channel_directory.json` contains Slack channels
- verify `send_message(action="list")` shows Slack targets
- verify `send_message(action="read", target="slack:dev-team")` returns messages

If `pytest` is unavailable in venv, `py_compile` + direct API smoke checks are acceptable interim validation.

## Pitfalls

- `hermes gateway status` may lie if there is an active gateway process but stale PID state
- `pytest` may not be installed in the venv; use `python -m py_compile` and a direct Python smoke test if needed
- Slack bot must actually have permission to see the target channel; connected does not always mean channel listing will work
- If the bot is only in Telegram, the Slack session will still truthfully say only Telegram is available

## Good escalation path

If Slack is connected but targets are still missing:
1. verify Slack app scopes and bot membership
2. verify `conversations.list` returns channels from the active token
3. verify `channel_directory.json` is rebuilt after gateway restart
4. inspect `tools/send_message_tool.py` and `gateway/channel_directory.py` together
