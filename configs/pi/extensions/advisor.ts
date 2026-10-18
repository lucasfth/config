import advisorExtension from "pi-omplike-advisor/extensions/advisor.ts";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type AdvisorMode = { provider: string; modelId: string; thinkingLevel?: string };
type ModeSettings = { modes?: Record<string, Partial<AdvisorMode>> };
type EventName = Parameters<ExtensionAPI["on"]>[0];
type EventHandler = (...args: unknown[]) => unknown;
export function readAdvisorMode(agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".local", "share", "huginn-pi", "agent")): AdvisorMode | undefined {
  try {
    const settings = JSON.parse(readFileSync(join(agentDir, "modes.json"), "utf8")) as ModeSettings;
    const mode = settings.modes?.advisor;
    if (typeof mode?.provider === "string" && typeof mode.modelId === "string") return { provider: mode.provider, modelId: mode.modelId, thinkingLevel: mode.thinkingLevel };
  } catch {
    // Report absence at session start without exposing file contents.
  }
  return undefined;
}

function hasConfiguredAdvisor(ctx: ExtensionContext): boolean {
  const mode = readAdvisorMode();
  if (!mode || !ctx.model) return false;
  const model = ctx.modelRegistry.find(mode.provider, mode.modelId);
  return model !== undefined && model !== ctx.model && ctx.modelRegistry.hasConfiguredAuth(model);
}

export default function configuredAdvisorExtension(pi: ExtensionAPI): void {
  const guardedPi = new Proxy(pi, {
    get(target, property) {
      if (property === "on") {
        return (event: string, handler: EventHandler) => target.on(event as never, ((...args: unknown[]) => {
          const context = args[1];
          if ((event === "before_agent_start" || event === "turn_end") && (!context || typeof context !== "object" || !hasConfiguredAdvisor(context as ExtensionContext))) return;
          return handler(...args);
        }) as never);
      }
      if (property === "registerCommand") {
        return (name: string, options: Parameters<ExtensionAPI["registerCommand"]>[1]) => {
          if (name !== "advisor") return target.registerCommand(name, options);
          return target.registerCommand(name, {
            ...options,
            handler: async (args, ctx) => {
              if (!hasConfiguredAdvisor(ctx)) {
                ctx.ui.notify("Advisor unavailable: configure a distinct authenticated model in runtime modes.json under advisor.", "warning");
                return;
              }
              await options.handler(args, ctx);
            },
          });
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ExtensionAPI;

  pi.on("session_start", (_event, ctx) => {
    const mode = readAdvisorMode();
    const model = mode && ctx.modelRegistry.find(mode.provider, mode.modelId);
    if (!mode) ctx.ui.notify("Advisor is unavailable: runtime modes.json has no explicit advisor model role.", "warning");
    else if (!model) ctx.ui.notify(`Advisor is unavailable: configured model ${mode.provider}/${mode.modelId} is not in the current model catalogue.`, "warning");
    else if (!ctx.modelRegistry.hasConfiguredAuth(model)) ctx.ui.notify(`Advisor is unavailable: credentials are not configured for ${mode.provider}.`, "warning");
  });
  advisorExtension(guardedPi);
}
