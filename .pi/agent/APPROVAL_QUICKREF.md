# Approval System - Quick Reference

## Commands

| Command | Description |
|---------|-------------|
| `/approval-manage` | Interactive menu to manage approval settings |
| `/approval-agent <name>` | Toggle approval requirement for an agent |
| `/agent-specs` | List all agent specifications |
| `/agent-stats` | View current session compliance stats |

## Tool

| Tool | Description |
|------|-------------|
| `validate_agent_spec` | Validate agent follows its spec |

## Default Dangerous Patterns

- `rm -rf`, `rm -r`, `rm --recursive`
- `sudo`
- `chmod 777`, `chown 777`
- `dd`
- `mkfs.*`
- Redirects to `/dev/sd*`, `/dev/nvme*`, `/dev/vd*`
- `git clean -fd`
- `git reset --hard`
- `git branch -D`
- `npm uninstall`, `yarn remove`, `pip uninstall`
- `rm -rf node_modules`
- `rm -rf ../`, `rm -rf ./`

## Default Protected Paths

- `.env`, `.env.*`
- `credentials.*`, `secrets.*`
- `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- `tsconfig.json`, `tsconfig.*.json`
- `.git/`
- `node_modules/`

## Agent Frontmatter Fields

```yaml
---
name: agent-name              # Required
description: What it does    # Required
model: claude-sonnet-4-5      # Required for subagents

# Approval
requiresApproval: true        # Requires approval before launch

# Tools
tools: read,bash,edit         # Allowlist (only these tools)
tools: !bash,write            # Blocklist (not these tools)

# Limits
maxBashCommands: 10           # Max bash commands per session

# Paths
allowedPaths: ["src/", "lib/"]
forbiddenPaths: [".env", "secrets/"]

# System Prompt
systemPromptMode: replace     # replace | append | prepend
---
```

## cmux Notification Types

| Type | Title | When |
|------|-------|------|
| Dangerous Command | ⚠️ Dangerous Command | Bash command matches dangerous pattern |
| Protected Path | 🔒 Protected Path | Write/edit to protected path |
| Subagent Launch | 🤖 Subagent Launch | Agent with `requiresApproval: true` |
| Spec Violation | ⚠️ Spec Violation | Agent breaks its specification |

## Quick Actions

### Add dangerous pattern
```bash
/approval-manage
# → Add dangerous pattern
# → Enter regex: rm\s+-rf\s+\/
```

### Add protected path
```bash
/approval-manage
# → Add protected path
# → Enter path: config/secrets.json
```

### Toggle agent approval
```bash
/approval-agent deploy-agent  # Toggle on/off
```

### Check current session
```bash
/agent-stats
```

### Validate agent compliance
```typescript
validate_agent_spec({ agentName: "deploy-agent" })
```

## Example Agent Files

### Simple Agent with Approval
```yaml
---
name: simple-agent
description: Simple approval demo
model: claude-sonnet-4-5
requiresApproval: true
tools: read, bash
---

You are a simple agent that needs approval.
```

### Full Spec Agent
```yaml
---
name: full-spec-agent
description: Full specification example
model: claude-sonnet-4-5
requiresApproval: true
tools: read, grep, find, ls, bash
maxBashCommands: 20
allowedPaths: ["src/", "lib/", "tests/"]
forbiddenPaths: [".env", "secrets/", "dist/"]
systemPromptMode: replace
---

You are a full-spec agent with constraints.
```

### No Approval, Spec Enforced
```yaml
---
name: safe-agent
description: Safe agent, no approval needed
model: claude-haiku-4-5
requiresApproval: false
tools: read, grep, find, ls
maxBashCommands: 5
---

You are a read-only agent. No approval needed.
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Extensions not loading | Run `/reload` |
| No cmux notifications | Check `cmux` is installed |
| Pattern not matching | Test regex with `node -e` |
| Agent specs not loading | `/approval-manage` → Reload |

## Files

| File | Purpose |
|------|---------|
| `~/.pi/agent/extensions/command-approval.ts` | Main approval extension |
| `~/.pi/agent/extensions/agent-spec-enforcer.ts` | Spec validation extension |
| `~/.pi/agent/approval-config.json` | Configuration |
| `~/.pi/agents/*.md` | Agent definitions |
| `~/.pi/agent/APPROVAL_SYSTEM.md` | Full documentation |
