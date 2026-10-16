---
name: using-freyr-browser
description: Use when performing any browser or UI work, including localhost checks, screenshots, OAuth, or dashboards.
---

# Using Freyr Browser

All browser work uses the dedicated signed-in Chromium on Freyr through its loopback CDP endpoint. Never use Mac Chrome relay, launch a local browser (including headless), or switch browsers when Freyr is unavailable. This applies to localhost, screenshots, OAuth, and dashboard checks.

## Start and check

From the Mac, run the canonical helper:

```bash
~/config/scripts/freyr-browser start
~/config/scripts/freyr-browser status
```

The helper runs SSH to `freyr` (override with `FREYR_HOST` if its configured host alias differs), starts Xvfb, x11vnc, and Chromium on Freyr, then forwards CDP and VNC to Mac loopback ports `9333` and `5999`. Freyr's dev server port is reverse-forwarded to the Mac's `127.0.0.1` on the same port. The default is `3001`; set `DEV_PORT=PORT` for both helper commands when the app uses another port. Status reports CDP/VNC listener state and the forwarded dev-server HTTP status.

If unavailable, stop browser work and diagnose only through `~/config/scripts/freyr-browser status`, SSH to Freyr, and the helper's Xvfb/Chromium logs. Restore Freyr access/service and retry. Do not use Mac Chrome relay, a local/headless executable, or another browser as fallback. Do not read or print the VNC password, browser profile, cookies, OAuth tokens, or other secrets. The user completes any required login; never enter or request Google credentials.

## Attach with browser tool

Before using browser tools, read `xd://eval/browser`. Attach by CDP and open a dedicated new tab; do not adopt or inspect unrelated existing tabs:

```js
await browser.open({ name: "freyr-check", url: "http://localhost:3001/admin", app: { cdp_url: "http://127.0.0.1:9333" } })
```

Use the requested app URL and name. For a non-default development port, use that port in the URL and set `DEV_PORT` when starting the helper. The CDP endpoint is `http://127.0.0.1:9333`.

Immediately confirm `tab.url()` matches the requested URL. CDP attachment may reuse
an existing page despite a new managed name; never assume two names mean two tabs.
Inspect only the assigned app page and stop on an unexpected login or unrelated
URL. Do not navigate, reload, or interact with a human-verification challenge.

## Source and runtime

Edit this skill only in the canonical config repository at `~/Desktop/code/config/.omp/skills/using-freyr-browser/SKILL.md` (`~/config` is its symlink). Skills are already symlinked; do not write under `~/.omp`. The helper's browser profile and logs are Freyr runtime state, not configuration source.