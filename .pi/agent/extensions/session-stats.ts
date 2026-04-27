/**
 * Session Stats Footer Extension
 *
 * Displays comprehensive session info at the bottom of the current session.
 *
 * Features:
 * - Current path (shortened) and git branch
 * - Provider/model being used
 * - Thinking mode (off/minimal/low/medium/high/xhigh)
 * - Total tokens and cost
 - /files command to show/hide modified files widget
 *
 * Usage:
 *   pi -e ~/.pi/agent/extensions/session-stats.ts
 *
 * Or add to settings.json:
 *   "extensions": ["~/.pi/agent/extensions/session-stats.ts"]
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolResultEvent, WriteToolResultEvent, EditToolResultEvent } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

function shortenPath(path: string, maxLen: number = 20): string {
	// Replace home directory with ~
	const short = path.replace(process.env.HOME || "/Users/lucasfreytorreshanson", "~");
	// If too long, truncate from the left
	if (short.length > maxLen) {
		const parts = short.split("/");
		if (parts.length > 2) {
			// Show first dir, then last dirs
			return "…/" + parts.slice(-(maxLen - 2)).join("/");
		}
		return short.slice(-maxLen);
	}
	return short;
}

function getThinkingEmoji(level: string): string {
	switch (level) {
		case "off": return "🫥";
		case "minimal": return "😐";
		case "low": return "🙂";
		case "medium": return "🤔";
		case "high": return "💭";
		case "xhigh": return "🧠";
		default: return "🤔";
	}
}

export default function (pi: ExtensionAPI) {
	let modifiedFiles = new Set<string>();
	let footerDisposer: (() => void) | null = null;
	let widgetVisible = false;
	let currentThinkingLevel = "medium";

	// Toggle widget visibility
	function toggleWidget(ctx: ExtensionContext) {
		widgetVisible = !widgetVisible;
		
		if (!widgetVisible) {
			ctx.ui.setWidget("session-stats-files", undefined);
			ctx.ui.notify("Modified files hidden", "info");
		} else {
			const files = Array.from(modifiedFiles);
			if (files.length === 0) {
				ctx.ui.notify("No files modified yet", "info");
				widgetVisible = false;
				return;
			}
			
			ctx.ui.setWidget("session-stats-files", (_tui, theme) => {
				const header = theme.fg("accent", theme.bold("Modified Files"));
				const fileLines = files.map((f) => {
					const path = shortenPath(f, 50);
					return `  ${theme.fg("success", "✓")} ${theme.fg("text", path)}`;
				});
				
				return {
					render: () => [header, ...fileLines],
					invalidate: () => {},
				};
			}, { placement: "belowEditor" });
			ctx.ui.notify(`Showing ${files.length} modified file${files.length === 1 ? "" : "s"}`, "info");
		}
	}

	function setCustomFooter(ctx: ExtensionContext) {
		// Clear any existing footer
		if (footerDisposer) {
			footerDisposer();
			footerDisposer = null;
		}

		footerDisposer = ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					// Compute tokens from ctx
					let input = 0,
						output = 0,
						cacheWrite = 0,
						cost = 0;

					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input || 0;
							output += m.usage.output || 0;
							cacheWrite += m.usage.cacheWrite || 0;
							cost += m.usage.cost?.total || 0;
						}
					}

					// Get context info
					const cwd = shortenPath(ctx.cwd);
					const branch = footerData.getGitBranch();
					const branchStr = branch ? theme.fg("accent", `(${branch})`) : "";
					
					// Get model info
					const model = ctx.model;
					const modelStr = model ? model.id : "no-model";
					const providerStr = (model as any)?.provider ? `${(model as any).provider}/` : "";
					
					// Get thinking level
					const thinkingEmoji = getThinkingEmoji(currentThinkingLevel);
					const thinkingLabel = currentThinkingLevel === "off" ? "off" : currentThinkingLevel;
					const thinkingStr = theme.fg("muted", `${thinkingEmoji}${thinkingLabel}`);

					// Format tokens/cost
					const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);
					const totalTokens = input + output + cacheWrite;
					const tokensStr = theme.fg("text", `${fmt(totalTokens)}t`);
					const costStr = cost > 0 
						? theme.fg("warning", `$${cost.toFixed(3)}`) 
						: theme.fg("dim", "$0");

					// Modified files
					const files = Array.from(modifiedFiles);
					const filesStr = files.length > 0
						? theme.fg("success", `${files.length}f`)
						: theme.fg("dim", "0f");

					// Build the footer line
					// Format: [path] [branch] │ [provider/model] [thinking] │ [tokens] [cost] [files]
					const sep = theme.fg("borderMuted", "│");
					
					const left = `${cwd} ${branchStr}`;
					const center = `${theme.fg("text", providerStr)}${theme.fg("accent", modelStr)} ${thinkingStr}`;
					const right = `${tokensStr} ${costStr} ${filesStr}`;

					// Calculate padding
					const sepLen = 2; // " │ "
					const combinedLen = visibleWidth(left) + sepLen + visibleWidth(center) + sepLen + visibleWidth(right);
					const padding = Math.max(1, width - combinedLen);
					
					const line = `${left} ${sep} ${center} ${sep} ${right}${" ".repeat(padding - 1)}`;
					return [truncateToWidth(line, width)];
				},
			};
		});
	}

	// Register command to toggle files widget
	pi.registerCommand("files", {
		description: "Toggle modified files widget",
		handler: async (_args, ctx) => {
			toggleWidget(ctx);
		},
	});

	// Track tool results for file modifications
	pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
		// Type guard for write/edit events
		if (event.toolName === "write" || event.toolName === "edit") {
			const path = event.input.path as string | undefined;
			if (path) {
				modifiedFiles.add(path);
				// Don't auto-show widget - only update if already visible
				if (widgetVisible) {
					toggleWidget(ctx); // toggle off
					widgetVisible = true;
					toggleWidget(ctx); // toggle on to refresh
				}
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		modifiedFiles.clear();
		currentThinkingLevel = "medium";
		widgetVisible = false;
		setCustomFooter(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (footerDisposer) {
			footerDisposer();
			footerDisposer = null;
		}
		ctx.ui.setWidget("session-stats-files", undefined);
	});
}