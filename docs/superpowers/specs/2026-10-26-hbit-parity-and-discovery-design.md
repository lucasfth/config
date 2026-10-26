# Hbit: shared workspace, Nocturne guide, and public discovery

## Goal and approved direction

Lucas approved the recommendation to give the browser and SSH menu the same public features, add a Nocturne guide (not an inference client), improve the SSH layout, and make Hbit machine-readable like the portfolio. The website must explain how visitors can access SSH without confusing Lucas's private shortcut with a public service.

Application source is `../hbit`. This document is in the configuration repository's established design directory. Do not modify unrelated staged/unstaged configuration work. No new purchase, credentials, network access inside the SSH guest, or change to personal management SSH is authorized by this design.

## Shared content and feature parity

Extend the existing `shared/menu.json` and Go embedding, rather than introduce separate web and SSH copy. The shared catalog contains Projects, Nocturne, Connect, About, and Help. Stable IDs and explicit numbered shortcuts drive both UIs; do not assume there are exactly three panes.

Each content item has plain paragraphs, labeled HTTPS links, and literal command examples. Web renders external links normally; SSH prints their complete public URLs for terminal selection/copy. Neither executes examples or opens a subprocess. Shared search filters titles and content locally; no arbitrary-URL fetching. Instructions and actions have the same meaning in both transports, while transport lifecycle differs: web quit can reconnect locally and SSH quit closes its channel.

Expose a content revision/hash in generated web assets and the SSH build so deployment skew is visible. Build-time parity tests compare the same catalog's generated HTML, Markdown and SSH output. Publishing only the website does not qualify live SSH parity.

## SSH presentation

Use the existing Go/Charm stack: Wish transport, Bubble Tea input/model, and Lip Gloss layout. Bubble Tea and Lip Gloss are already indirect dependencies. Do not add Gum: it requires subprocess execution and is unnecessary for a long-lived SSH UI.

Match the website's palette and structure: compact branded title, sidebar of panes, main content viewport, command input, footer/status. Use text branding in the terminal rather than invent an ASCII logo. Support arrows and j/k outside the command field, numbered pane shortcuts, Enter, Escape, scroll, help, and quit. Provide a stacked narrow-terminal layout and bounded dimensions on resize. Long documentation and examples must remain scrollable, not truncated.

Maintain a readable non-ANSI/dumb-terminal fallback if compatible with the existing PTY requirement. Continue rejecting non-PTY shells, exec, SFTP, forwarding, and agent requests. No SCP middleware. Bound input size and render control characters safely. A UI framework must not introduce subprocess, environment lookup, terminal-title/clipboard writes, or outbound network calls.

## Nocturne guide

Use `https://github.com/lucasfth/nocturne` as the verifiable project/documentation source. Read and pin the reviewed source revision when writing guide content; do not silently fetch private deployment data at runtime. Hbit owns a short introduction and pointers, not an unmaintained copy of Nocturne's installation manual.

Explain: OpenAI-compatible inference on idle Apple Silicon Macs, variable availability, querying model/status before use, obtaining a key from the operator of a chosen instance, configuring a compatible client, and reviewing any credit/payment terms. Never claim hosted service availability, fixed models/prices/hours, free credit, or a completed payment flow without evidence. The repository README and historical portfolio Nocturne copy disagree on signup/billing; use current source and label instance-specific behavior.

Provide a Python/OpenAI client example with `NOCTURNE_BASE_URL` and `NOCTURNE_API_KEY` environment placeholders. Do not name an unverified live gateway. Explain that Hbit does not collect keys, submit prompts, top up credit, or purchase anything. Link to Nocturne's public README and relevant public guides. Never publish private hostnames, ports, usernames, fingerprints, management paths, or tailnet addresses in the guide.

Live Nocturne status and inference are deferred. Both browser CSP and the SSH guest's no-network boundary remain intact.

## Connect / SSH access copy

Initial visible text, identical in both transports:

> SSH access
>
> The website is available at https://hbit.sh.
>
> Public SSH access is not available yet. There is currently no visitor SSH command to run. The author's private SSH shortcut does not provide public access.
>
> A free, TLS-wrapped public SSH connection is being prepared. It will open this menu only, not a shell. Connection instructions and host-key verification will appear here after that route passes public-access tests.

Make Connect directly discoverable from the initial HTML and interactive navigation. Do not present bare `ssh hbit.sh` as a visitor command, even as the recommended action in a code block.

When ingress is separately activated and externally verified, change a single shared public connection record to include the actual client prerequisites, TLS wrapper, CA verification, pinned public host key, and quit instructions. The operational handoff is not automatically publishable: management identity and private deployment details must be excluded. A necessary public ingress hostname is a deliberate publication decision, not an incidental copy from the runbook.

## Portfolio-style machine-readable surfaces

Generate all public documents from the shared content catalog:

- Meaningful initial HTML with headings, content, links, canonical/description/Open Graph/Twitter metadata, and a no-JavaScript reading path. Preserve the existing workspace design; avoid duplicating the document visibly after hydration.
- Stable public HTML pages and matching `.md` pages, homepage `/index.md`, `llms.txt`, `llms-full.txt`, `robots.txt`, and `sitemap.xml`.
- Structured data describing Hbit and its public software projects, with no invented availability, rating or product-price claims.
- Read-only local search/page discovery exposed to web, SSH and agents.
- `Accept: text/markdown` content negotiation with correct media quality handling, `Vary: Accept`, and real 404s for unknown pages.
- A bounded read-only `/mcp` implementing `initialize`, `ping`, `tools/list`, and `tools/call` for `list_pages`, `read_page`, and shared search. Only allowlisted public catalog pages are readable. No URL fetcher, filesystem reader, execution, messages, payments, credentials, or private data.

The current deployment is entirely static. Genuine negotiation and MCP POST require a small Vercel-only request handler (using checked TypeScript and the generated public manifest). This is a deliberate web architecture extension, not an SSH-network exception. Retain prebuilt static assets; do not introduce a Next.js migration, database, telemetry, general proxy or background worker. Bound request bodies and search/result sizes, validate methods/parameters/Origin/protocol headers, and return accurate HTTP/JSON-RPC errors. Use the portfolio's exercised read-only contract as reference, not an unreviewed file copy.

Keep the current restrictive security headers. Any JSON-LD serialization must be escaped and have an explicit CSP treatment; do not loosen script-src broadly. The public web handler cannot reach or configure the SSH host.

## Public ingress remains a separate operational checkpoint

No purchase. The candidate uses the already-prepared anonymous-menu image/network-none Unix socket and TLS-wrapped Funnel transport. It needs a rebuilt UI image, privilege-gated activation, no shell/forwarding regression tests, saturation/recovery and external-client proof before publication. Never expose management port 22 or MCP services. Never reset shared Funnel settings. Runtime activation and publication remain separate from source/build proof; obtain explicit approval for the concrete activation and any changed shared service.

## Acceptance

1. Same content IDs, command meaning, links, examples, search results and content revision in web and SSH.
2. Web navigation, keyboard, search, long content, quit/reconnect and narrow/mobile layout exercised through the dedicated Gimle browser.
3. Real SSH PTY interactions, resize, scrolling, menu selection/search, quit and dumb-terminal behavior exercised against an isolated candidate.
4. Existing authentication, channel, exec/SFTP/forwarding/agent, connection/session/time limits and native ARM64 sandbox regressions remain passing.
5. Built HTML contains meaningful catalog content before JavaScript. Every public page has equivalent HTML/Markdown representations and metadata; robots/sitemap/llms references resolve.
6. HTTP negotiation, cache Vary, true 404s and the MCP initialization/list/read/search/error paths run through the actual request handler, including oversized/invalid/cross-origin requests and path traversal attempts.
7. Generated public output contains no private infrastructure identifiers or credentials. Literal examples cannot execute through menu commands. Nocturne example API calls are not sent during verification.
8. Run frontend tests/typecheck/build, Go race/vet/module/vulnerability checks, packaging tests, native sandbox and real consumer checks before claiming readiness. Keep the Wish SCP advisory transparent until genuinely resolved; no untested major-version migration as a side effect.
9. README/setup/runbooks explain the web handler, shared generation, local development, private/public SSH status and deployment rollback accurately.

## Non-goals

No Gum subprocesses, arbitrary scraping service, private portfolio reads, live inference, account/signup UI, payment initiation, API-key storage, public management SSH, new paid host, automatic service restart, or unrelated configuration cleanup.

## Delivery and rollback

Implement in the Hbit repository on a scoped feature branch by default. Source edits do not imply another deployment or push-to-main approval. Keep the current working website, private image and server host keys recoverable. Roll back web deployment and SSH image independently; never rewrite content to advertise a route that is not live.

## Self-review

The five-pane model replaces every fixed three-pane assumption in Go and JavaScript. New web request handling is explicit rather than misrepresented as static. Local guide scope preserves both no-network SSH and no-key handling. Public SSH instructions remain truthful until externally qualified. Runtime/publication gates and parallel configuration ownership are preserved. No implementation is claimed by this document.
