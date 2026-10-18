---
name: using-freyr-browser
description: Use for browser or UI work, screenshots, localhost checks, authenticated dashboards and login troubleshooting.
---

Use the dedicated freyr_browser tool. It only attaches to the existing loopback CDP tunnel on 127.0.0.1:9333, never discovers or launches a local browser. Open a new named tab for the exact requested app URL, then use snapshot/click/type/screenshot/same-origin navigate/close. Arbitrary JavaScript and credential-surface access are not exposed.

If unavailable, report the failure and ask approval before starting/reconnecting infrastructure with ~/config/scripts/freyr-browser start. Diagnostic status may use the canonical helper. Never substitute Mac Chrome, relay or a headless browser. Never read cookies, storage tokens, profile files, passwords or VNC secrets. Lucas handles login/2FA through Screen Sharing. Stop on unexpected login or verification pages. Close only your named app tab.

The Freyr profile and tunnels are existing infrastructure, not this package's runtime state. Do not change them during ordinary UI verification.
