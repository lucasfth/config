# Loki browser MCP bridge

Canonical source for the Ratatosk HTTP bridge on Gimle, port 8767. This is
separate from Pi's `loki_browser` tool. The bridge attaches only to existing
Chrome on loopback 9444, using its existing logged-in agent profile. It never
starts/restarts Chrome or reads cookies, credentials or profile files.

## Fix

The previous server selected the first Chrome page for every tool call. This
version automatically creates/reuses a bridge-owned tab per website on
`browser_navigate`, and subsequent calls use that workspace. No user-supplied
tab name is needed. Unknown/closed tabs fail; no fallback to unrelated tabs.
Login/challenge and unexpected-origin pages stop interactions.

Example Ratatosk sequence (the assistant handles this, not the user):

1. `browser_navigate({"url":"https://www.dba.dk/"})`
2. `browser_get_text({})`
3. `browser_screenshot({})`

The five tool names are unchanged; `tab` is optional for advanced concurrent
workspaces. With omitted names this is one trusted-client sequential browsing
context, not per-user isolation. Refresh Ratatosk's MCP connection after deployment.
No credentials need to be entered into Ratatosk. Authentication on a new tab
still depends on valid website sessions and site-specific SSO redirects; do not
claim login merely from CDP or MCP health.

## State and limits

- Automatic workspace version **1.2.0 is live**, verified by MCP initialize
  after Lucas restarted only the bridge. All tools accept omitted `tab`.
- Version **1.2.1 is source/staging only**: includes visible text from open shadow
  components and detects visible login inputs inside them. 17 tests passed on
  Gimle with fake DOM/CDP and its real FastAPI dependency closure.
- Live restricted-browser screenshot shows DBA avatar/Min DBA/Beskeder, whereas
  its ordinary text snapshot omits that header. This motivates the component
  fix but is not yet proof that 1.2.1 solves Ratatosk's reported login problem.
- No Chrome restart, tunnel change or login-storage access.
- Endpoint retains loopback binding plus the existing tailnet forward. This is
  a trusted-client bridge, not a public service or per-client security boundary.
  Named tabs are process-owned, not authenticated user-owned. Do not expose it
  beyond approved tailnet clients. Application writes still need task authority.
- The broad credential matcher deliberately remains conservative. This change
  does not fix Pi's separate cPanel typing refusal or enable Hbit DNS edits.
- Tabs are in-memory; restarting forgets ownership without adopting or closing
  existing tabs. A new navigate creates a new owned tab automatically.

## Deployment

Live directory: `/Users/gimle/loki-data/live/hermes/mcp-browser-server/`.
Staging: `/Users/gimle/loki-data/staging/browser-owned-tabs/`.
Back up the live server before copying `server.py` and `tabs.py`; preserve the
private config, which must specify `browser.cdp_local_port: 9444` and loopback
server binding. This is an interim manually approved deployment, not automatic
Nix activation. A browser-bridge-only launchd restart requires operator approval:

```sh
sudo launchctl kickstart -k system/dk.loki.browser
```

Do not restart `dk.loki.gateway`, Chrome or the CDP tunnel. After restart, check
MCP initialize/version 1.2.1 and tool schemas, then verify through Ratatosk with
an owned tab. On failure restore the backup and restart only this bridge.

## Tests

Stdlib tests locally (ASGI dependencies are already available in Gimle's managed
service Python):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tabs_test server_test -v
```

`asgi_test.py` uses FastAPI TestClient with fake Chrome: no HTTP listener and no
browser interactions. Run all `*_test.py` in the existing managed environment.
