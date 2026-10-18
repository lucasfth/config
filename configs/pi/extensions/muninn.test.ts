import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionContext, createMemoryRecall, type Project, type VaultClient } from "./muninn.ts";

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
