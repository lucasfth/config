import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionContext, createMemoryRecall, McpVaultClient, type Project, type VaultClient } from "./muninn.ts";

const project: Project = { org: "lucasfth", repo: "config", branch: "work" };

function clientWith(notes: string[]): { client: VaultClient; reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    client: {
      async read(filename) {
        reads.push(filename);
        return { content: `---\ntags: [test]\n---\nbody:${filename}` };
      },
      async list(pattern) {
        assert.equal(pattern, "projects/lucasfth/config/work/*.md");
        return { files: notes };
      },
    },
  };
}

test("Muninn injects mandatory guidance and a bounded prior-note index without reading note bodies", async () => {
  const files = Array.from({ length: 7 }, (_, index) => `projects/lucasfth/config/work/${index}.md`);
  const { client, reads } = clientWith(files);
  const context = await buildSessionContext(project, client);
  assert.match(context, /huginn-identity/);
  assert.match(context, /huginn-web-rules/);
  assert.match(context, /huginn-conventions/);
  assert.match(context, /030-Coding-Style/);
  assert.match(context, /010-Lucas/);
  assert.match(context, /032-Nix-Darwin-Patterns/);
  assert.match(context, /Prior session index/);
  assert.match(context, /projects\/lucasfth\/config\/work\/6\.md/);
  assert.doesNotMatch(context, /body:projects/);
  assert.equal(reads.filter(filename => filename.startsWith("projects/")).length, 0);
});

test("memory recall reads only selected notes and bounds each returned body", async () => {
  const paths = ["projects/lucasfth/config/work/one.md", "projects/lucasfth/config/work/two.md"];
  const { client, reads } = clientWith(paths);
  const result = await createMemoryRecall(client)([paths[1]], 500);
  assert.deepEqual(reads, [paths[1]]);
  assert.match(result, /body:projects\/lucasfth\/config\/work\/two\.md/);
  assert.doesNotMatch(result, /body:projects\/lucasfth\/config\/work\/one\.md/);
  assert.ok(result.length <= 500);
});

test("Muninn note listing failures produce an explicit empty note index while preserving guidance", async () => {
  const { client } = clientWith([]);
  const broken: VaultClient = { read: client.read.bind(client), async list() { throw new Error("offline"); } };
  const context = await buildSessionContext(project, broken);
  assert.match(context, /huginn-identity/);
  assert.match(context, /Prior session index unavailable: offline/);
});

test("selected-note recall reports empty results and isolates per-note read failures", async () => {
  const client: VaultClient = {
    async read(filename) { if (filename.endsWith("broken.md")) throw new Error("offline"); return { content: "" }; },
    async list() { return { files: [] }; },
  };
  const result = await createMemoryRecall(client)(["projects/x/y/main/empty.md", "projects/x/y/main/broken.md"]);
  assert.match(result, /empty\.md[\s\S]*No content/);
  assert.match(result, /broken\.md[\s\S]*unavailable: offline/);
});

test("Muninn authenticates initialize and tools/call with the exported bearer token", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-muninn-client-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  const previous = process.env.MUNINN_MCP_TOKEN;
  process.env.PI_CODING_AGENT_DIR = dir;
  process.env.MUNINN_MCP_TOKEN = "synthetic-muninn-token";
  await writeFile(join(dir, "mcp.json"), JSON.stringify({ mcpServers: { muninn: { url: "https://vault.invalid/mcp" } } }));
  t.after(async () => {
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    await rm(dir, { recursive: true, force: true });
  });
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer synthetic-muninn-token");
    const request = JSON.parse(options.body as string);
    methods.push(request.method);
    return Response.json({ jsonrpc: "2.0", id: request.id, result: request.method === "initialize" ? {} : { content: [{ type: "text", text: JSON.stringify({ content: "authenticated note" }) }] } });
  });
  try {
    assert.deepEqual(await new McpVaultClient().read("tech/030-Coding-Style.md"), { content: "authenticated note" });
    assert.deepEqual(methods, ["initialize", "tools/call"]);
  } finally {
    if (previous === undefined) delete process.env.MUNINN_MCP_TOKEN;
    else process.env.MUNINN_MCP_TOKEN = previous;
  }
});

test("Muninn rejects missing bearer tokens before making an HTTP request", async (t) => {
  const previous = process.env.MUNINN_MCP_TOKEN;
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ result: {} }));
  try {
    for (const token of [undefined, "", "   "]) {
      if (token === undefined) delete process.env.MUNINN_MCP_TOKEN;
      else process.env.MUNINN_MCP_TOKEN = token;
      await assert.rejects(new McpVaultClient().read("tech/030-Coding-Style.md"), /MUNINN_MCP_TOKEN is missing/);
    }
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    if (previous === undefined) delete process.env.MUNINN_MCP_TOKEN;
    else process.env.MUNINN_MCP_TOKEN = previous;
  }
});
