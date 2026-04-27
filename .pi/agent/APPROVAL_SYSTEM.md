# Pi Approval System

A comprehensive approval and spec enforcement system for pi-coding-agent with cmux notification integration.

## Features

- **Dangerous Command Approval**: Prompts for confirmation before running risky bash commands
- **Protected Path Protection**: Requires approval before modifying sensitive files
- **Agent-Level Approval**: Per-agent approval requirements for subagents
- **Spec Enforcement**: Validates agents follow their defined constraints
- **cmux Integration**: Native cmux notifications for all approval requests
- **Configurable Rules**: Easy-to-configure dangerous patterns and protected paths

## Installation

The system is automatically installed. Extensions are in:
- `~/.pi/agent/extensions/command-approval.ts`
- `~/.pi/agent/extensions/agent-spec-enforcer.ts`

Configuration is in:
- `~/.pi/agent/approval-config.json`

Example agents are in:
- `~/.pi/agent/agents/deploy-agent.md`
- `~/.pi/agent/agents/db-migration-agent.md`

## Usage

### Dangerous Commands

When you or an agent tries to run a dangerous bash command, you'll see:

1. **cmux notification** with the command that needs approval
2. **Interactive prompt** with options:
   - "Yes, execute" - Run the command
   - "No, block" - Cancel the operation
   - "Edit command" - Modify the command before running

Example dangerous commands that trigger approval:
```bash
rm -rf node_modules/
sudo npm install
chmod 777 file.sh
dd if=/dev/zero of=test.img
git clean -fd
```

### Protected Paths

Writing to protected paths triggers approval:

Protected paths (configurable):
- `.env`, `.env.*` - Environment files
- `credentials.*`, `secrets.*` - Secret files
- `package.json`, `yarn.lock` - Dependency files
- `tsconfig.json` - TypeScript config
- `.git/` - Git directory
- `node_modules/` - Dependencies

### Agent Approval

Agents with `requiresApproval: true` in their frontmatter need approval before launching.

Example agent frontmatter:
```yaml
---
name: deploy-agent
description: Handles deployment operations
model: claude-sonnet-4-5
requiresApproval: true
tools: read, grep, find, ls, bash
maxBashCommands: 10
---
```

## Commands

### `/approval-manage`

Manage the approval configuration interactively.

Options:
- View dangerous patterns
- Add dangerous pattern
- Remove dangerous pattern
- View protected paths
- Add protected path
- Remove protected path
- View agents requiring approval
- Reload agent approvals

### `/approval-agent <agent-name>`

Toggle approval requirement for a specific agent.

```bash
/approval-agent deploy-agent      # Add approval requirement
/approval-agent deploy-agent      # Remove approval requirement
```

### `/agent-specs`

List all loaded agent specifications with their constraints.

### `/agent-stats`

View current session statistics for agent compliance:
- Tools used
- Bash commands executed
- Paths accessed
- Violations detected

## Agent Spec Enforcement

Agents can define specifications that are enforced:

### Frontmatter Options

```yaml
---
name: my-agent
model: claude-sonnet-4-5

# Approval
requiresApproval: true

# Tools
tools: read,bash,edit        # Allowlisted tools
tools: !bash,write           # Blocklisted tools (with !)

# Limits
maxBashCommands: 10

# Paths
allowedPaths: ["src/", "lib/"]
forbiddenPaths: [".env", "secrets/"]

# System prompt
systemPromptMode: replace    # replace | append | prepend
---
```

### Validation Tool

Use the `validate_agent_spec` tool to check compliance:

```typescript
validate_agent_spec({
  agentName: "deploy-agent"  // Optional, uses current if not specified
})
```

Returns a detailed report with violations and session stats.

## cmux Notifications

All approval requests trigger cmux notifications with:
- **Title**: "⚠️ Dangerous Command", "🔒 Protected Path", or "🤖 Subagent Launch"
- **Subtitle**: "Approval Required"
- **Body**: Details of what needs approval

Notification types:
- Command approval: Shows the command being executed
- Path protection: Shows the file being modified
- Agent approval: Shows agent name and task
- Spec violations: Shows what rule was broken

## Configuration

Edit `~/.pi/agent/approval-config.json` to customize:

```json
{
  "dangerousCommands": [
    "rm\\s+(-rf?|--recursive|-r)",
    "sudo",
    "(chmod|chown).*777"
  ],
  "watchedTools": ["bash", "write", "edit", "subagent"],
  "protectedPaths": [
    ".env",
    "package.json",
    ".git/"
  ],
  "requireApprovalAgents": []
}
```

### Regex Patterns

Dangerous commands use regex patterns:
- `rm\\s+(-rf?|--recursive|-r)` - Matches `rm -rf`, `rm -r`, `rm --recursive`
- `sudo` - Matches any command with sudo
- `(chmod|chown).*777` - Matches chmod/chown with 777

### Glob Patterns

Protected paths use simple glob patterns:
- `.env` - Exact match
- `.env.*` - Matches .env.local, .env.production, etc.
- `node_modules/` - Matches node_modules directory

## Example Workflow

### Deploying with Approval

1. User asks to deploy:
   ```
   Deploy the application to staging
   ```

2. Agent tries to run deployment command, sees `deploy-agent` requires approval

3. cmux notification appears:
   ```
   🤖 Subagent Launch
   Approval Required
   Agent: deploy-agent
   Task: Deploy the application to staging
   ```

4. User approves in the terminal

5. `deploy-agent` runs and respects its constraints:
   - Max 10 bash commands
   - No access to .env files
   - Must ask before final deployment

### Creating a New Agent with Approval

1. Create `~/.pi/agent/agents/my-agent.md`:

```yaml
---
name: my-agent
description: My custom agent with approval
model: claude-sonnet-4-5
requiresApproval: true
tools: read, grep, find, ls, bash
maxBashCommands: 20
forbiddenPaths: [".env", "secrets"]
---

You are my custom agent. Follow these rules:
1. Always ask before destructive operations
2. Max 20 bash commands
3. Never access secrets
```

2. The agent is automatically loaded and requires approval

3. Toggle approval if needed:
   ```bash
   /approval-agent my-agent
   ```

## Troubleshooting

### Extensions not loading

Run `/reload` to reload extensions, skills, and prompts.

### No cmux notifications

Make sure `cmux` is installed and running:
```bash
cmux --version
```

Check the notification is not filtered by cmux settings.

### Agent specs not loading

Run `/approval-manage` → "Reload agent approvals" to refresh.

### Pattern not matching

Test your regex pattern:
```bash
node -e "console.log(/your-pattern/.test('your-command'))"
```

## Security Notes

- Extensions run with full system permissions - review code before use
- Approval system is a safety net, not a replacement for careful review
- Always review agent code and specifications before using
- Keep secrets in secure locations, never in agent files
- Use environment variables, not hardcoded secrets

## Advanced Usage

### Custom Notification Integration

The approval system uses `pi.exec("cmux", ["notify", ...])` internally. You can extend this to use other notification systems by modifying the `sendCmuxNotification` function in the extensions.

### Programmatic Approval

For automation, you can bypass approval by:
1. Setting `PI_APPROVAL_BYPASS=true` environment variable (not recommended)
2. Removing the approval requirement from agent frontmatter
3. Using `/approval-agent <name>` to toggle off temporarily

### Session-Level Tracking

The spec enforcer tracks per-session:
- Bash command count
- Tools used
- Paths accessed
- Violations detected

Reset happens automatically on each new agent turn.

## Contributing

To add new dangerous patterns:
1. Test the regex pattern
2. Add to `approval-config.json`
3. Run `/reload`
4. Test with a sample command

To add new protected paths:
1. Determine the glob pattern
2. Add to `approval-config.json`
3. Run `/reload`
4. Test with a write operation

## License

Part of pi-coding-agent extension system.
