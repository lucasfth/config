import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import muninnExtension, { buildSessionContext, readMuninnEndpoint, type Project, type VaultClient } from "../extensions/muninn";

const project: Project = { org: "lucasfth", repo: "config", branch: "main" };
const client: VaultClient = {
  read: async (filename) => ({ content: `body:${filename}` }),
  list: async () => ({
    files: [
      "projects/lucasfth/config/main/2026-09-01.md",
      "projects/lucasfth/config/main/2026-09-06.md",
      "projects/lucasfth/config/main/2026-09-02.md",
      "projects/lucasfth/config/main/2026-09-05.md",
      "projects/lucasfth/config/main/2026-09-03.md",
      "projects/lucasfth/config/main/2026-09-04.md",
    ],
  }),
};

test("injects baseline, applicable tech docs, and five newest notes", async () => {
  const context = await buildSessionContext(project, client);

  expect(context).toContain("body:tech/huginn-identity.md");
  expect(context).toContain("body:tech/huginn-web-rules.md");
  expect(context).toContain("body:tech/huginn-conventions.md");
  expect(context).toContain("body:life/010-Lucas.md");
  expect(context).toContain("body:tech/030-Coding-Style.md");
  expect(context).toContain("body:tech/032-Nix-Darwin-Patterns.md");
  expect(context).not.toContain("body:projects/lucasfth/config/main/2026-09-01.md");
  expect(context).toContain("body:projects/lucasfth/config/main/2026-09-06.md");
});

test("returns an unavailable-context notice when Muninn fails", async () => {
  const context = await buildSessionContext(project, {
    ...client,
    list: async () => {
      throw new Error("offline");
    },
  });

  expect(context).toContain("Muninn context unavailable: offline");
});


test("reads the endpoint from generated MCP configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "muninn-"));
  const config = join(directory, "mcp.json");
  writeFileSync(config, JSON.stringify({ mcpServers: { muninn: { type: "http", url: "http://private.example/mcp" } } }));

  try {
    expect(readMuninnEndpoint(config)).toBe("http://private.example/mcp");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("injects Muninn context before the agent starts without replacing the conversation", () => {
  const handlers: Record<string, unknown> = {};
  muninnExtension({
    on: (event: string, handler: unknown) => {
      handlers[event] = handler;
    },
  } as never);

  expect(handlers.before_agent_start).toBeDefined();
  expect(handlers.context).toBeUndefined();
});