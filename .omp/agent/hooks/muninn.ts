import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
const COMMON_PATHS = [
  "tech/huginn-identity.md",
  "tech/huginn-web-rules.md",
  "tech/huginn-conventions.md",
  "life/010-Lucas.md",
  "tech/030-Coding-Style.md",
];
const TECH_DOCS: Record<string, string[]> = {
  "lucasfth/config": ["tech/032-Nix-Darwin-Patterns.md"],
  "EcoRayDev/ecoray-web": ["tech/031-Nuxt-Vue-Patterns.md"],
};

export type Project = { org: string; repo: string; branch: string };
type VaultRead = { content: string };
type VaultList = { files: string[] };

export interface VaultClient {
  read(filename: string): Promise<VaultRead>;
  list(pattern: string): Promise<VaultList>;
}

export function readMuninnEndpoint(configPath = join(homedir(), ".omp", "agent", "mcp.json")): string {
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as { mcpServers?: Record<string, { url?: unknown }> };
  const endpoint = config.mcpServers?.muninn?.url;
  if (typeof endpoint !== "string" || endpoint.length === 0) throw new Error("Muninn MCP endpoint is missing from generated mcp.json");
  return endpoint;
}

class McpVaultClient implements VaultClient {
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
    this.#endpoint ??= readMuninnEndpoint();
    const response = await fetch(this.#endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.#requestId, method, params }),
    });

    if (!response.ok) throw new Error(`Muninn ${method} failed: HTTP ${response.status}`);

    const body = (await response.json()) as {
      error?: { message?: string };
      result?: { content?: Array<{ type?: string; text?: string }> };
    };
    if (body.error) throw new Error(`Muninn ${method} failed: ${body.error.message ?? "unknown error"}`);
    return body;
  }
}

function detectProject(): Project {
  try {
    const cwd = process.env.INIT_CWD ?? process.cwd();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    const remote = execSync("git remote get-url origin", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    const match = remote.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return { org: match[1], repo: match[2], branch };
  } catch {
    // Fall through to local-project identity.
  }

  return { org: "_local", repo: basename(process.env.INIT_CWD ?? process.cwd()), branch: "main" };
}


export async function buildSessionContext(project: Project, client: VaultClient): Promise<string> {
  try {
    const techPaths = [...COMMON_PATHS, ...(TECH_DOCS[`${project.org}/${project.repo}`] ?? [])];
    const tech = await Promise.all(techPaths.map((filename) => client.read(filename).then(({ content }) => `## ${basename(filename, ".md")}\n\n${content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim()}`)));
    const pattern = `projects/${project.org}/${project.repo}/${project.branch}/*.md`;
    const { files } = await client.list(pattern);
    const notes = await Promise.all(files.sort().slice(-5).map((filename) => client.read(filename).then(({ content }) => `### ${basename(filename, ".md")}\n\n${content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim()}`)));
    const prior = notes.length === 0 ? "" : `## Prior sessions (from Muninn)\n\nProject: ${project.org}/${project.repo}  \nBranch: ${project.branch}\n\n${notes.join("\n\n---\n\n")}`;

    return [...tech, prior].filter(Boolean).join("\n\n---\n\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `## Muninn context unavailable\n\nMuninn context unavailable: ${message}`;
  }
}

export default function muninnHook(pi: HookAPI): void {
  pi.on("context", async () => {
    const content = await buildSessionContext(detectProject(), new McpVaultClient());
    return { messages: [{ role: "user" as const, content }] };
  });
}
