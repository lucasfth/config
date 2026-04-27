/**
 * Agent Spec Enforcer Extension
 *
 * Ensures agents follow their specification (allowed tools, forbidden tools, max commands, etc.)
 * Integrates with pi-cmux for notifications on spec violations.
 */

import type { ExtensionAPI, SessionMessageEntry } from "@mariozechner/pi-coding-agent";

interface AgentSpec {
  name: string;
  allowedTools?: string[];
  forbiddenTools?: string[];
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  maxBashCommands?: number;
  systemPromptMode?: "replace" | "append" | "prepend";
  source: "user" | "project";
}

const NOTIFY_TIMEOUT_MS = 5000;

export default function (pi: ExtensionAPI) {
  const agentSpecs = new Map<string, AgentSpec>();
  const currentSessionStats = {
    bashCommandCount: 0,
    usedTools: new Set<string>(),
    accessedPaths: new Set<string>(),
    specViolations: [] as string[],
  };

  // Load all agent specs on startup
  pi.on("session_start", async (_event, ctx) => {
    await loadAgentSpecs(ctx);
    resetSessionStats();
  });

  // Track tool usage
  pi.on("tool_call", async (event, ctx) => {
    const currentAgentName = getCurrentAgentName(ctx);
    if (!currentAgentName) return;

    const spec = agentSpecs.get(currentAgentName);
    if (!spec) return;

    // Track tool usage
    currentSessionStats.usedTools.add(event.toolName);

    // Check forbidden tools
    if (spec.forbiddenTools && spec.forbiddenTools.includes(event.toolName)) {
      const violation = `Used forbidden tool: ${event.toolName}`;
      currentSessionStats.specViolations.push(violation);
      await sendCmuxNotification("⚠️ Spec Violation", violation, ctx);
      ctx.ui.notify(violation, "warning");
    }

    // Check bash command limit
    if (event.toolName === "bash" && spec.maxBashCommands) {
      currentSessionStats.bashCommandCount++;
      if (currentSessionStats.bashCommandCount > spec.maxBashCommands) {
        const violation = `Exceeded max bash commands: ${currentSessionStats.bashCommandCount}/${spec.maxBashCommands}`;
        currentSessionStats.specViolations.push(violation);
        await sendCmuxNotification("⚠️ Spec Violation", violation, ctx);
        ctx.ui.notify(violation, "warning");
      }
    }

    // Track path access for read/write/edit
    const path = (event.input as any).path;
    if (path && (event.toolName === "read" || event.toolName === "write" || event.toolName === "edit")) {
      currentSessionStats.accessedPaths.add(path);

      // Check forbidden paths
      if (spec.forbiddenPaths) {
        for (const pattern of spec.forbiddenPaths) {
          if (pathMatchesPattern(path, pattern)) {
            const violation = `Accessed forbidden path: ${path} (pattern: ${pattern})`;
            currentSessionStats.specViolations.push(violation);
            await sendCmuxNotification("⚠️ Spec Violation", violation, ctx);
            ctx.ui.notify(violation, "warning");
            break;
          }
        }
      }

      // Check allowed paths
      if (spec.allowedPaths && spec.allowedPaths.length > 0) {
        const isAllowed = spec.allowedPaths.some((pattern) =>
          pathMatchesPattern(path, pattern)
        );
        if (!isAllowed) {
          const violation = `Accessed path outside allowed list: ${path}`;
          currentSessionStats.specViolations.push(violation);
          await sendCmuxNotification("⚠️ Spec Violation", violation, ctx);
          ctx.ui.notify(violation, "warning");
        }
      }
    }

    return undefined;
  });

  // Register validation tool
  pi.registerTool({
    name: "validate_agent_spec",
    label: "Validate Agent Spec",
    description:
      "Validate that the current agent is following its specification. Returns a report of any violations.",
    parameters: {
      type: "object",
      properties: {
        agentName: {
          type: "string",
          description: "Agent name to validate (uses current agent if not specified)",
        },
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const agentName = (params.agentName as string) || getCurrentAgentName(ctx);

      if (!agentName) {
        return {
          content: [
            {
              type: "text",
              text: "No agent name specified and cannot determine current agent.",
            },
          ],
          details: {},
        };
      }

      const spec = agentSpecs.get(agentName);

      if (!spec) {
        return {
          content: [{ type: "text", text: `No spec found for agent: ${agentName}` }],
          details: {},
        };
      }

      // Validate against current session stats
      const violations: string[] = [];

      // Check tool usage
      if (spec.allowedTools || spec.forbiddenTools) {
        const usedTools = Array.from(currentSessionStats.usedTools);

        if (spec.forbiddenTools) {
          for (const forbidden of spec.forbiddenTools) {
            if (usedTools.includes(forbidden)) {
              violations.push(`❌ Used forbidden tool: ${forbidden}`);
            }
          }
        }

        if (spec.allowedTools) {
          for (const tool of usedTools) {
            if (!spec.allowedTools.includes(tool)) {
              violations.push(`❌ Used tool not in allowlist: ${tool}`);
            }
          }
        }
      }

      // Check bash command limit
      if (spec.maxBashCommands) {
        const count = currentSessionStats.bashCommandCount;
        if (count > spec.maxBashCommands) {
          violations.push(
            `❌ Exceeded max bash commands: ${count}/${spec.maxBashCommands}`
          );
        } else {
          violations.push(
            `✅ Bash commands within limit: ${count}/${spec.maxBashCommands}`
          );
        }
      }

      // Check path access
      if (spec.forbiddenPaths || spec.allowedPaths) {
        const accessedPaths = Array.from(currentSessionStats.accessedPaths);

        if (spec.forbiddenPaths) {
          for (const path of accessedPaths) {
            for (const pattern of spec.forbiddenPaths) {
              if (pathMatchesPattern(path, pattern)) {
                violations.push(`❌ Accessed forbidden path: ${path}`);
                break;
              }
            }
          }
        }

        if (spec.allowedPaths && spec.allowedPaths.length > 0) {
          for (const path of accessedPaths) {
            const isAllowed = spec.allowedPaths.some((pattern) =>
              pathMatchesPattern(path, pattern)
            );
            if (!isAllowed) {
              violations.push(`❌ Accessed path outside allowed list: ${path}`);
            }
          }
        }
      }

      // Build report
      let report = `# Agent Spec Validation Report\n\n`;
      report += `**Agent:** ${spec.name} (${spec.source})\n\n`;

      if (spec.allowedTools) {
        report += `**Allowed tools:** ${spec.allowedTools.join(", ")}\n\n`;
      }
      if (spec.forbiddenTools) {
        report += `**Forbidden tools:** ${spec.forbiddenTools.join(", ")}\n\n`;
      }
      if (spec.maxBashCommands) {
        report += `**Max bash commands:** ${spec.maxBashCommands}\n\n`;
      }
      if (spec.allowedPaths) {
        report += `**Allowed paths:** ${spec.allowedPaths.join(", ")}\n\n`;
      }
      if (spec.forbiddenPaths) {
        report += `**Forbidden paths:** ${spec.forbiddenPaths.join(", ")}\n\n`;
      }

      report += `## Violations\n\n`;

      if (violations.length === 0) {
        report += `✅ No violations detected. Agent is following its specification.\n\n`;
      } else {
        for (const violation of violations) {
          report += `${violation}\n\n`;
        }
      }

      report += `## Session Stats\n\n`;
      report += `- Tools used: ${Array.from(currentSessionStats.usedTools).join(", ")}\n`;
      report += `- Bash commands: ${currentSessionStats.bashCommandCount}\n`;
      report += `- Paths accessed: ${currentSessionStats.accessedPaths.size}\n`;

      return {
        content: [{ type: "text", text: report }],
        details: { violations, stats: currentSessionStats },
      };
    },
  });

  // Register command to list agent specs
  pi.registerCommand("agent-specs", {
    description: "List and manage agent specifications",
    handler: async (_args, ctx) => {
      if (agentSpecs.size === 0) {
        ctx.ui.notify("No agent specs loaded", "info");
        return;
      }

      let output = "Agent Specifications:\n\n";
      for (const [name, spec] of agentSpecs) {
        output += `**${name}** (${spec.source}):\n`;
        if (spec.allowedTools) output += `  allowedTools: ${spec.allowedTools.join(", ")}\n`;
        if (spec.forbiddenTools) output += `  forbiddenTools: ${spec.forbiddenTools.join(", ")}\n`;
        if (spec.maxBashCommands) output += `  maxBashCommands: ${spec.maxBashCommands}\n`;
        if (spec.allowedPaths) output += `  allowedPaths: ${spec.allowedPaths.join(", ")}\n`;
        if (spec.forbiddenPaths) output += `  forbiddenPaths: ${spec.forbiddenPaths.join(", ")}\n`;
        output += "\n";
      }

      ctx.ui.notify(output, "info");
    },
  });

  // Register command to view current session stats
  pi.registerCommand("agent-stats", {
    description: "View current session stats for agent compliance",
    handler: async (_args, ctx) => {
      let output = "Current Session Stats:\n\n";
      output += `Tools used: ${Array.from(currentSessionStats.usedTools).join(", ") || "none"}\n`;
      output += `Bash commands: ${currentSessionStats.bashCommandCount}\n`;
      output += `Paths accessed: ${currentSessionStats.accessedPaths.size}\n`;
      output += `Violations: ${currentSessionStats.specViolations.length}\n`;

      if (currentSessionStats.specViolations.length > 0) {
        output += "\nViolations:\n";
        for (const violation of currentSessionStats.specViolations) {
          output += `  - ${violation}\n`;
        }
      }

      ctx.ui.notify(output, currentSessionStats.specViolations.length > 0 ? "warning" : "info");
    },
  });

  // Reset stats on agent start
  pi.on("agent_start", () => {
    resetSessionStats();
  });

  function resetSessionStats() {
    currentSessionStats.bashCommandCount = 0;
    currentSessionStats.usedTools.clear();
    currentSessionStats.accessedPaths.clear();
    currentSessionStats.specViolations = [];
  }

  function getCurrentAgentName(ctx: ExtensionAPI): string | null {
    // Try to get agent name from session context or environment
    // This is a simplified approach - in practice you might need to track this differently
    const entries = ctx.sessionManager.getEntries();

    // Look for subagent tool calls to determine current agent
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "custom" && entry.customType === "tool_call") {
        const data = entry.data as any;
        if (data.toolName === "subagent" && data.input?.agent) {
          return data.input.agent as string;
        }
      }
    }

    // Check if we're in a subagent by looking at environment or session metadata
    // For now, return null - the spec validation will need agent name explicitly
    return null;
  }

  async function loadAgentSpecs(ctx: ExtensionAPI) {
    const fs = await import("node:fs");
    const pathMod = await import("node:path");
    const os = await import("node:os");

    agentSpecs.clear();

    const agentDirs = [
      { path: pathMod.join(ctx.cwd, ".pi/agents"), source: "project" as const },
      { path: pathMod.join(os.homedir(), ".pi/agent/agents"), source: "user" as const },
    ];

    for (const { path: dir, source } of agentDirs) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".md"));

      for (const file of files) {
        const content = fs.readFileSync(pathMod.join(dir, file), "utf-8");
        const match = content.match(/^---\n([\s\S]*?)\n---/);

        if (match) {
          const frontmatter = match[1];
          const spec: AgentSpec = {
            name: "",
            source,
          };

          // Parse name
          const nameMatch = frontmatter.match(/name:\s*(\S+)/i);
          spec.name = nameMatch ? nameMatch[1] : file.replace(".md", "");

          // Parse tools
          const toolsMatch = frontmatter.match(/tools:\s*(.+)/i);
          if (toolsMatch) {
            const tools = toolsMatch[1].trim();
            if (tools.startsWith("!")) {
              spec.forbiddenTools = tools
                .slice(1)
                .split(",")
                .map((t) => t.trim());
            } else {
              spec.allowedTools = tools.split(",").map((t) => t.trim());
            }
          }

          // Parse maxBashCommands
          const bashMatch = frontmatter.match(/maxBashCommands:\s*(\d+)/i);
          if (bashMatch) {
            spec.maxBashCommands = parseInt(bashMatch[1], 10);
          }

          // Parse allowedPaths
          const allowedPathsMatch = frontmatter.match(/allowedPaths:\s*\[(.*?)\]/is);
          if (allowedPathsMatch) {
            spec.allowedPaths = allowedPathsMatch[1]
              .split(",")
              .map((p) => p.trim().replace(/^["']|["']$/g, ""));
          }

          // Parse forbiddenPaths
          const forbiddenPathsMatch = frontmatter.match(/forbiddenPaths:\s*\[(.*?)\]/is);
          if (forbiddenPathsMatch) {
            spec.forbiddenPaths = forbiddenPathsMatch[1]
              .split(",")
              .map((p) => p.trim().replace(/^["']|["']$/g, ""));
          }

          // Parse systemPromptMode
          const promptModeMatch = frontmatter.match(/systemPromptMode:\s*(\S+)/i);
          if (promptModeMatch) {
            spec.systemPromptMode = promptModeMatch[1] as "replace" | "append" | "prepend";
          }

          agentSpecs.set(spec.name, spec);
        }
      }
    }
  }

  function pathMatchesPattern(filePath: string, pattern: string): boolean {
    // Handle glob patterns
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\./g, "\\.").replace(/\?/g, ".")
    );
    return regex.test(filePath) || filePath.includes(pattern.replace(/\*$/, ""));
  }

  async function sendCmuxNotification(
    title: string,
    body: string,
    ctx: ExtensionAPI
  ): Promise<void> {
    try {
      const result = await pi.exec(
        "cmux",
        ["notify", "--title", title, "--subtitle", "Spec Violation", "--body", body],
        { timeout: NOTIFY_TIMEOUT_MS }
      );

      if (result.code !== 0 && !result.killed) {
        console.debug(`cmux notify failed: ${result.stderr || result.stdout}`);
      }
    } catch (e) {
      console.debug(`cmux notify error: ${(e as Error).message}`);
    }
  }
}
