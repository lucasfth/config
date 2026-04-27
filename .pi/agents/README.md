# Subagent Orchestration Setup

This directory contains custom orchestration agents copied from your opencode configuration. These agents are now available for use with the pi-subagents system.

## Available Agents

### Ecoray Workflow (Project-focused)
- **ecoray-orchestrator**: Main coordinator for ecoray projects using `xai/grok-4.20-reasoning`
- **ecoray-builder**: Implementation agent using `xai/grok-code-fast-1`
- **ecoray-explorer**: Read-only discovery agent using `xai/grok-4-1-fast`
- **ecoray-solution-planner**: Clarification and planning agent using `xai/grok-4-1-fast`

### Personal Workflow (Personal projects)
- **personal-orchestrator**: Main coordinator for personal projects using `opencode/big-pickle`
- **personal-builder**: Implementation agent using `opencode/big-pickle`
- **personal-explorer**: Read-only discovery agent using `opencode/big-pickle`
- **personal-solution-planner**: Clarification and planning agent using `opencode/big-pickle`

## How to Use

### Starting with an Orchestrator

The orchestrator agents are designed to coordinate full workflows:

```typescript
// For Ecoray projects
subagent({
  agent: "ecoray-orchestrator",
  task: "Implement a new authentication feature"
})

// For Personal projects
subagent({
  agent: "personal-orchestrator",
  task: "Add user profile management"
})
```

### Direct Agent Usage

You can also use individual agents directly:

```typescript
// For exploration
subagent({
  agent: "ecoray-explorer",
  task: "Find all files related to user authentication"
})

// For building
subagent({
  agent: "ecoray-builder",
  task: "Implement the login endpoint in auth.ts"
})

// For planning
subagent({
  agent: "ecoray-solution-planner",
  task: "Clarify requirements for the new feature"
})
```

### Chain Workflow

Create a chain of agents for complex tasks:

```typescript
subagent({
  chain: [
    { agent: "ecoray-explorer", task: "Explore the current auth implementation" },
    { agent: "ecoray-solution-planner", task: "Plan the improvements based on {previous}" },
    { agent: "ecoray-builder", task: "Implement the planned changes from {previous}" }
  ]
})
```

## Orchestrator Workflow

When you use an orchestrator agent, it follows this pattern:

1. **Worktree Setup**: Creates isolated git worktree for the feature
2. **Scope Assessment**: Determines task complexity
3. **Agent Dispatch**: Delegates to appropriate sub-agents:
   - **Explorer**: For discovery and context gathering
   - **Solution Planner**: For clarification of unclear requirements
   - **Builder**: For implementation work
4. **Verification**: Ensures agents follow instructions exactly
5. **Delivery**: Reports results from the worktree

## Key Features

- **Worktree Isolation**: All work happens in isolated git worktrees
- **Agent Accountability**: Orchestrator verifies agents follow exact instructions
- **Read-First Policy**: Builders must read files before editing them
- **Conventional Commits**: Standardized commit message format
- **Superpowers Integration**: Can use specialized skills for complex tasks

## Model Configuration

Each agent uses specific models:
- **Ecoray workflow**: Uses xai/grok models with varying capabilities
- **Personal workflow**: Uses opencode/big-pickle model consistently

You can override these models in `.pi/agent/settings.json` if needed.

## Agent Precedence

The agents follow pi-subagents precedence rules:
1. Project agents (`.pi/agents/*.md`) - highest priority
2. User agents (`~/.pi/agent/agents/*.md`)
3. Builtin agents - lowest priority

Your custom agents will override builtin agents with the same name.

## Additional Resources

- Pi subagents documentation: `/opt/homebrew/lib/node_modules/pi-subagents/skills/pi-subagents/SKILL.md`
- Original opencode configurations: `../opencode/agent/`
- Pi main documentation: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/README.md`