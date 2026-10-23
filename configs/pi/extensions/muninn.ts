import { Type } from "typebox";
import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";


type McpConfig = { mcpServers?: Record<string, { url?: unknown }> };
export type Project = { org: string; repo: string; branch: string };
type VaultRead = { content: string };
type VaultList = { files: string[] };

export interface VaultClient {
  read(filename: string): Promise<VaultRead>;
  list(pattern: string): Promise<VaultList>;
}

export const COMMON_PATHS = [
  "tech/huginn-identity.md",
  "tech/huginn-web-rules.md",
  "tech/huginn-conventions.md",
  "life/010-Lucas.md",
  "tech/030-Coding-Style.md",
];
export const TECH_DOCS: Record<string, string[]> = {
  "lucasfth/config": ["tech/032-Nix-Darwin-Patterns.md"],
  "EcoRayDev/ecoray-web": ["tech/031-Nuxt-Vue-Patterns.md"],
};
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_INDEX_NOTES = 8;
const MAX_NOTE_BODY_CHARS = 12_000;

export function readMuninnEndpoint(configPath = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".local", "share", "huginn-pi", "agent"), "mcp.json")): string {
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as McpConfig;
  const endpoint = config.mcpServers?.muninn?.url;
  if (typeof endpoint !== "string" || endpoint.length === 0) throw new Error("Muninn MCP endpoint is missing from generated mcp.json");
  return endpoint;
}



export class McpVaultClient implements VaultClient {
  #requestId = 0;
  #initialized = false;
  #endpoint: string | undefined;

  async read(filename: string): Promise<VaultRead> {
    return this.#call("vault_read", { filename });
  }

  async list(pattern: string): Promise<VaultList> {
    return this.#call("vault_list", { pattern });
  }

  async #call<T>(name: string, arguments_: Record<string, string>): Promise<T> {
    await this.#initialize();
    const response = await this.#request("tools/call", { name, arguments: arguments_ });
    const text = response.result?.content
      ?.filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    if (!text) throw new Error(`Muninn ${name} returned no text content`);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Muninn ${name} returned malformed JSON`);
    }
  }

  async #initialize(): Promise<void> {
    if (this.#initialized) return;
    await this.#request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "huginn", version: "1.0" },
    });
    this.#initialized = true;
  }

  async #request(method: string, params: unknown): Promise<{ result?: { content?: Array<{ type?: string; text?: string }> } }> {
    const token = process.env.MUNINN_MCP_TOKEN;
    if (!token?.trim()) throw new Error("MUNINN_MCP_TOKEN is missing; source ~/config/nix_secrets before launching Huginn.");
    this.#endpoint ??= readMuninnEndpoint();
    const response = await fetch(this.#endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.#requestId, method, params }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Muninn ${method} failed: HTTP ${response.status}`);
    const body = await response.json() as {
      error?: { message?: string };
      result?: { content?: Array<{ type?: string; text?: string }> };
    };
    if (body.error) throw new Error(`Muninn ${method} failed: ${body.error.message ?? "unknown error"}`);
    return body;
  }
}

export function detectProject(cwd = process.env.INIT_CWD ?? process.cwd()): Project {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    const remote = execSync("git remote get-url origin", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    const match = remote.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return { org: match[1], repo: match[2], branch };
  } catch {
    // Fall through to local-project identity.
  }
  return { org: "_local", repo: basename(cwd), branch: "main" };
}

function cleanBody(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/u, "").trim();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function buildSessionContext(project: Project, client: VaultClient): Promise<string> {
  const sections: string[] = [];
  try {
    const techPaths = [...COMMON_PATHS, ...(TECH_DOCS[`${project.org}/${project.repo}`] ?? [])];
    const tech = await Promise.all(techPaths.map(async filename => {
      try {
        const { content } = await client.read(filename);
        // Hide only the retired generated block; keep curated rules and raw recall intact.
        const curated = cleanBody(content).replace(/^## Auto-Generated Correction Log[^\n]*\n[\s\S]*?<!-- OMP-sessions-refresh -->\n?/gmu, "");
        return `## ${basename(filename, ".md")}\n\n${curated}`;
      } catch (error) {
        return `## ${basename(filename, ".md")}\n\nUnavailable: ${errorText(error)}`;
      }
    }));
    sections.push(...tech);
    // Approved supplements only. Candidate prose and arbitrary JSON fields are never injected.
    const scopes = ["general"];
    if ([project.org, project.repo].every(part => /^[\w.-]+$/u.test(part) && part !== "..")) {
      scopes.push(`${project.org}/${project.repo}`);
    }
    const supplements = await Promise.all(scopes.map(async scope => {
      const filename = scope === "general" ? "tech/learning/general.md" : `tech/learning/projects/${scope}.md`;
      try {
        const { content } = await client.read(filename);
        if (content.length > 80_000) return "";
        const block = content.match(/^```json\n([\s\S]*?)\n```\s*$/mu)?.[1];
        if (!block) return "";
        const payload = JSON.parse(block) as { schema?: unknown; scope?: unknown; entries?: unknown };
        if (payload.schema !== 1 || payload.scope !== scope || !Array.isArray(payload.entries)) return "";
        const heading = `## Approved supplemental learning — ${scope}\n\n`;
        let budget = 8_000 - heading.length;
        const lines: string[] = [];
        for (const entry of payload.entries.slice(0, 20)) {
          if (!entry || typeof entry !== "object") continue;
          const e = entry as Record<string, unknown>;
          const source = e.source as { path?: unknown; sha256?: unknown } | undefined;
          if (e.status === "candidate" || e.approved_by !== "Lucas" ||
              typeof e.approved_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(e.approved_at) ||
              typeof e.approval_reference !== "string" || !e.approval_reference.trim() || e.approval_reference.length > 500 ||
              typeof e.text !== "string" || !e.text.trim() || e.text.length > 1_500 ||
              !source || typeof source.path !== "string" || !/^projects\/[\w./-]+\.md$/u.test(source.path) ||
              source.path.split("/").includes("..") || typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(source.sha256)) continue;
          const line = `- ${e.text}\n  Approval: Lucas, ${e.approved_at}. Source: ${source.path} (${source.sha256}).`;
          const cost = line.length + (lines.length ? 2 : 0);
          if (cost > budget) break;
          lines.push(line);
          budget -= cost;
        }
        return lines.length ? heading + lines.join("\n\n") : "";
      } catch {
        // Optional learning must not prevent mandatory guidance or the prior-note index.
        return "";
      }
    }));
    sections.push(...supplements.filter(Boolean));
    const pattern = `projects/${project.org}/${project.repo}/${project.branch}/*.md`;
    try {
      const { files } = await client.list(pattern);
      const index = files.filter(filename => !filename.startsWith("projects/_archive/")).sort().slice(-MAX_INDEX_NOTES).map(filename => `- ${filename}`);
      sections.push(`## Prior session index\n\nProject: ${project.org}/${project.repo}  \nBranch: ${project.branch}\n\n${index.length ? index.join("\n") : "No prior session notes."}\n\nUse memory_recall with selected paths to retrieve note bodies on demand.`);
    } catch (error) {
      sections.push(`## Prior session index\n\nPrior session index unavailable: ${errorText(error)}`);
    }
    return sections.join("\n\n---\n\n");
  } catch (error) {
    return `## Muninn context unavailable\n\nMuninn context unavailable: ${errorText(error)}`;
  }
}

export function createMemoryRecall(client: VaultClient): (paths: string[], maxChars?: number) => Promise<string> {
  return async (paths, maxChars = MAX_NOTE_BODY_CHARS) => {
    if (paths.length === 0) return "No note paths selected.";
    if (paths.length > 5) throw new Error("Select at most five Muninn notes per recall.");
    const limit = Math.max(100, Math.min(MAX_NOTE_BODY_CHARS, maxChars));
    const notes = await Promise.all(paths.map(async filename => {
      if (!/^(?:tech|life|projects)\/[\w./-]+\.md$/u.test(filename) || filename.split("/").includes("..")) return `### ${filename}\n\nRejected unsafe Muninn note path.`;
      try {
        let content: string;
        let resolved = filename;
        try {
          ({ content } = await client.read(filename));
        } catch (error) {
          if (!filename.startsWith("projects/") || filename.startsWith("projects/_archive/")) throw error;
          resolved = filename.replace(/^projects\//u, "projects/_archive/");
          ({ content } = await client.read(resolved));
        }
        const body = cleanBody(content).slice(0, limit);
        const location = resolved === filename ? "" : `Archived source: ${resolved}\n\n`;
        return `### ${filename}\n\n${location}${body || "No content."}${cleanBody(content).length > limit ? "\n\n[Note truncated to the configured bound.]" : ""}`;
      } catch (error) {
        return `### ${filename}\n\nMuninn note unavailable: ${errorText(error)}`;
      }
    }));
    return notes.join("\n\n---\n\n").slice(0, limit * paths.length + paths.length * 500);
  };
}

export default function muninnExtension(pi: ExtensionAPI): void {
  const injectedSessions: Record<string, true> = {};
  const recall = createMemoryRecall(new McpVaultClient());
  pi.on("before_agent_start", async (_event: BeforeAgentStartEvent, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    if (injectedSessions[sessionId]) return;
    const content = await buildSessionContext(detectProject(ctx.cwd), new McpVaultClient());
    injectedSessions[sessionId] = true;
    return { message: { customType: "muninn-context", content, display: false } };
  });
  pi.registerTool({
    name: "memory_recall", label: "Muninn memory recall", exposure: "deferred", defaultActive: false,
    description: "Retrieve selected Muninn note bodies on demand. Initial context contains only note paths, not prior-session bodies.",
    parameters: Type.Object({ paths: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1, maxItems: 5 }) }),
    async execute(_id, params) {
      const text = await recall(params.paths);
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
}
