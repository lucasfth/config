/**
 * Command Approval Extension
 *
 * Prompts for confirmation before running potentially dangerous operations.
 * Integrates with pi-cmux for native cmux notifications.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface ApprovalConfig {
  // Commands requiring approval (regex patterns)
  dangerousCommands: RegExp[];
  // Tools to monitor
  watchedTools: string[];
  // Paths requiring approval for write/edit operations
  protectedPaths: string[];
  // Agents requiring approval
  requireApprovalAgents: Set<string>;
}

const NOTIFY_TIMEOUT_MS = 5000;

export default function (pi: ExtensionAPI) {
  const config: ApprovalConfig = {
    dangerousCommands: [
      /\brm\s+(-rf?|--recursive|-r)\b/i,
      /\bsudo\b/i,
      /\b(chmod|chown)\b.*777/i,
      /\bdd\b/i,
      /\bmkfs\.\w+/i,
      />\s*\/dev\/(sd|nvme|vd)/i,
      /: (>\s*)?\//i,  // Redirect overwrite to root
      /\bgit\s+clean\s+-fd/i,
      /\bgit\s+reset\s+--hard/i,
      /\bgit\s+branch\s+-D/i,
      /bun\s+uninstall/i,
      /npm\s+uninstall/i,
      /yarn\s+remove/i,
      /pip\s+uninstall/i,
      /rm\s+-rf\s+node_modules/i,
      /rm\s+-rf\s+\.\.?\//,  // rm -rf .. or ./
    ],
    watchedTools: ["bash", "write", "edit", "subagent"],
    protectedPaths: [
      ".env",
      ".env.*",
      "credentials.*",
      "secrets.*",
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "tsconfig.*.json",
      ".git/",
      "node_modules/",
    ],
    requireApprovalAgents: new Set(),
  };

  // Load agents that require approval on startup
  pi.on("session_start", async (_event, ctx) => {
    await loadAgentsRequiringApproval(ctx);
  });

  pi.on("tool_call", async (event, ctx) => {
    // Skip if not a watched tool
    if (!config.watchedTools.includes(event.toolName)) {
      return undefined;
    }

    // Handle bash commands
    if (event.toolName === "bash") {
      const command = event.input.command as string;
      const isDangerous = config.dangerousCommands.some((pattern) =>
        pattern.test(command)
      );

      if (isDangerous) {
        const result = await handleDangerousCommand(command, ctx);
        if (result) return result;
      }
    }

    // Handle write/edit operations to protected paths
    if (event.toolName === "write" || event.toolName === "edit") {
      const path = event.input.path as string;
      const isProtected = checkProtectedPath(path, config.protectedPaths);

      if (isProtected) {
        const result = await handleProtectedPath(path, event.toolName, ctx);
        if (result) return result;
      }
    }

    // Handle subagent launches with approval
    if (event.toolName === "subagent") {
      const input = event.input as Record<string, unknown>;

      const subagentInfo = parseSubagentInput(input);
      if (subagentInfo && config.requireApprovalAgents.has(subagentInfo.agentName)) {
        const result = await handleSubagentApproval(subagentInfo.agentName, subagentInfo.task, ctx);
        if (result) return result;
      }
    }

    return undefined;
  });

  // Register management command
  pi.registerCommand("approval-manage", {
    description: "Manage approval configuration",
    handler: async (_args, ctx) => {
      const action = await ctx.ui.select(
        "What would you like to do?",
        [
          "View dangerous patterns",
          "Add dangerous pattern",
          "Remove dangerous pattern",
          "View protected paths",
          "Add protected path",
          "Remove protected path",
          "View agents requiring approval",
          "Reload agent approvals",
        ]
      );

      switch (action) {
        case "View dangerous patterns":
          await viewDangerousPatterns(ctx);
          break;

        case "Add dangerous pattern":
          await addDangerousPattern(ctx);
          break;

        case "Remove dangerous pattern":
          await removeDangerousPattern(ctx);
          break;

        case "View protected paths":
          await viewProtectedPaths(ctx);
          break;

        case "Add protected path":
          await addProtectedPath(ctx);
          break;

        case "Remove protected path":
          await removeProtectedPath(ctx);
          break;

        case "View agents requiring approval":
          await viewRequireApprovalAgents(ctx);
          break;

        case "Reload agent approvals":
          await loadAgentsRequiringApproval(ctx);
          ctx.ui.notify("Agent approvals reloaded", "success");
          break;
      }
    },
  });

  // Register command to toggle approval for an agent
  pi.registerCommand("approval-agent", {
    description: "Toggle approval requirement for an agent",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /approval-agent <agent-name>", "info");
        return;
      }

      const agentName = args.trim();
      if (config.requireApprovalAgents.has(agentName)) {
        config.requireApprovalAgents.delete(agentName);
        ctx.ui.notify(`Removed approval requirement for: ${agentName}`, "success");
        await sendCmuxNotification(
          "Approval Updated",
          `${agentName} no longer requires approval`,
          ctx
        );
      } else {
        config.requireApprovalAgents.add(agentName);
        ctx.ui.notify(`Added approval requirement for: ${agentName}`, "success");
        await sendCmuxNotification(
          "Approval Updated",
          `${agentName} now requires approval`,
          ctx
        );
      }
    },
  });

  // Helper functions
  async function handleDangerousCommand(command: string, ctx: ExtensionAPI) {
    // Send cmux notification
    await sendCmuxNotification(
      "⚠️ Dangerous Command",
      `A dangerous command requires approval:\n${command}`,
      ctx
    );

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: "Dangerous command blocked (no UI for confirmation)",
      };
    }

    const choice = await ctx.ui.select(
      `⚠️ Dangerous command detected:\n\n  ${command}\n\nAllow?`,
      ["Yes, execute", "No, block", "Edit command"]
    );

    if (choice === "No, block") {
      await sendCmuxNotification("Command Blocked", `Blocked: ${command}`, ctx);
      return { block: true, reason: "Blocked by user" };
    }

    if (choice === "Edit command") {
      const edited = await ctx.ui.input("Edit command:", {
        defaultValue: command,
      });
      if (edited !== command) {
        event!.input.command = edited; // Modify in place
      }
    }

    await sendCmuxNotification("Command Approved", `Executing: ${command}`, ctx);
    return undefined;
  }

  async function handleProtectedPath(
    path: string,
    toolName: string,
    ctx: ExtensionAPI
  ) {
    // Send cmux notification
    await sendCmuxNotification(
      "🔒 Protected Path",
      `Writing to protected path requires approval:\n${path}`,
      ctx
    );

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Protected path blocked: ${path} (no UI for confirmation)`,
      };
    }

    const confirmed = await ctx.ui.confirm(
      `Write to protected path?`,
      `You're about to modify a protected path:\n\n  ${path}\n\nContinue?`
    );

    if (!confirmed) {
      await sendCmuxNotification("Write Blocked", `Blocked write to: ${path}`, ctx);
      return { block: true, reason: `Blocked write to protected path: ${path}` };
    }

    await sendCmuxNotification("Write Approved", `Approved write to: ${path}`, ctx);
    return undefined;
  }

  async function handleSubagentApproval(
    agentName: string,
    task: string,
    ctx: ExtensionAPI
  ) {
    // Send cmux notification
    await sendCmuxNotification(
      "🤖 Subagent Launch",
      `Agent "${agentName}" requires approval:\n${task}`,
      ctx
    );

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Agent "${agentName}" requires approval (no UI for confirmation)`,
      };
    }

    const confirmed = await ctx.ui.confirm(
      `Launch subagent?`,
      `Agent: ${agentName}\nTask: ${task}\n\nThis agent requires approval. Continue?`
    );

    if (!confirmed) {
      await sendCmuxNotification("Subagent Blocked", `Blocked: ${agentName}`, ctx);
      return { block: true, reason: `Blocked subagent: ${agentName}` };
    }

    await sendCmuxNotification("Subagent Approved", `Launched: ${agentName}`, ctx);
    return undefined;
  }

  async function viewDangerousPatterns(ctx: ExtensionAPI) {
    const patterns = config.dangerousCommands.map((p, i) => ({
      value: i,
      label: p.source,
    }));

    let output = "Dangerous patterns:\n\n";
    for (const pattern of config.dangerousCommands) {
      output += `  ${pattern.source}\n`;
    }
    ctx.ui.notify(output, "info");
  }

  async function addDangerousPattern(ctx: ExtensionAPI) {
    const pattern = await ctx.ui.input("Enter regex pattern:", {});
    try {
      config.dangerousCommands.push(new RegExp(pattern, "i"));
      ctx.ui.notify(`Added pattern: ${pattern}`, "success");
      await sendCmuxNotification("Pattern Added", pattern, ctx);
    } catch (e) {
      ctx.ui.notify(`Invalid regex: ${(e as Error).message}`, "error");
    }
  }

  async function removeDangerousPattern(ctx: ExtensionAPI) {
    const choices = config.dangerousCommands.map((p, i) => ({
      value: i,
      label: p.source,
    }));

    const selected = await ctx.ui.select(
      "Select pattern to remove:",
      choices.map((c) => c.label)
    );

    if (selected !== undefined) {
      const index = choices.findIndex((c) => c.label === selected);
      if (index !== -1) {
        const removed = config.dangerousCommands.splice(index, 1)[0];
        ctx.ui.notify("Pattern removed", "success");
        await sendCmuxNotification("Pattern Removed", removed.source, ctx);
      }
    }
  }

  async function viewProtectedPaths(ctx: ExtensionAPI) {
    let output = "Protected paths:\n\n";
    for (const path of config.protectedPaths) {
      output += `  ${path}\n`;
    }
    ctx.ui.notify(output, "info");
  }

  async function addProtectedPath(ctx: ExtensionAPI) {
    const path = await ctx.ui.input("Enter path pattern (supports glob):", {});
    config.protectedPaths.push(path);
    ctx.ui.notify(`Added path: ${path}`, "success");
    await sendCmuxNotification("Path Added", path, ctx);
  }

  async function removeProtectedPath(ctx: ExtensionAPI) {
    const selected = await ctx.ui.select(
      "Select path to remove:",
      config.protectedPaths
    );

    if (selected) {
      config.protectedPaths = config.protectedPaths.filter((p) => p !== selected);
      ctx.ui.notify("Path removed", "success");
      await sendCmuxNotification("Path Removed", selected, ctx);
    }
  }

  async function viewRequireApprovalAgents(ctx: ExtensionAPI) {
    if (config.requireApprovalAgents.size === 0) {
      ctx.ui.notify("No agents require approval", "info");
      return;
    }

    let output = "Agents requiring approval:\n\n";
    for (const agent of config.requireApprovalAgents) {
      output += `  ${agent}\n`;
    }
    ctx.ui.notify(output, "info");
  }

  async function loadAgentsRequiringApproval(ctx: ExtensionAPI) {
    const fs = await import("node:fs");
    const pathMod = await import("node:path");
    const os = await import("node:os");

    const agentDirs = [
      pathMod.join(ctx.cwd, ".pi/agents"),
      pathMod.join(os.homedir(), ".pi/agent/agents"),
    ];

    config.requireApprovalAgents.clear();

    for (const dir of agentDirs) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".md"));

      for (const file of files) {
        const content = fs.readFileSync(pathMod.join(dir, file), "utf-8");
        const match = content.match(/^---\n([\s\S]*?)\n---/);

        if (match) {
          const frontmatter = match[1];
          if (/requiresApproval:\s*true/i.test(frontmatter)) {
            const nameMatch = frontmatter.match(/name:\s*(\S+)/i);
            const agentName = nameMatch ? nameMatch[1] : file.replace(".md", "");
            config.requireApprovalAgents.add(agentName);
          }
        }
      }
    }
  }

  async function sendCmuxNotification(
    title: string,
    body: string,
    ctx: ExtensionAPI
  ): Promise<void> {
    try {
      const result = await pi.exec(
        "cmux",
        ["notify", "--title", title, "--subtitle", "Approval Required", "--body", body],
        { timeout: NOTIFY_TIMEOUT_MS }
      );

      if (result.code !== 0 && !result.killed) {
        // Silently fail if cmux is not available
        console.debug(`cmux notify failed: ${result.stderr || result.stdout}`);
      }
    } catch (e) {
      // Silently fail if cmux is not available
      console.debug(`cmux notify error: ${(e as Error).message}`);
    }
  }

  function checkProtectedPath(filePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\./g, "\\.").replace(/\?/g, ".")
      );
      return regex.test(filePath) || filePath.includes(pattern.replace(/\*$/, ""));
    });
  }

  function parseSubagentInput(input: Record<string, unknown>): {
    agentName: string;
    task: string;
  } | null {
    if (input.agent && typeof input.agent === "string") {
      return {
        agentName: input.agent,
        task: (input.task as string) || "No task specified",
      };
    }

    if (input.chain && Array.isArray(input.chain) && input.chain.length > 0) {
      const first = input.chain[0];
      if (first && typeof first === "object" && "agent" in first) {
        return {
          agentName: first.agent as string,
          task: (first.task as string) || "Chain workflow",
        };
      }
    }

    return null;
  }
}
