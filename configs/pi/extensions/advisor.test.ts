import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readAdvisorMode } from "./advisor.ts";

test("advisor model role is read only from the explicit runtime mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-advisor-role-"));
  try {
    await writeFile(join(dir, "modes.json"), JSON.stringify({ modes: { advisor: { provider: "neo-proxy", modelId: "claude-haiku-5-5", thinkingLevel: "minimal" } } }));
    assert.deepEqual(readAdvisorMode(dir), { provider: "neo-proxy", modelId: "claude-haiku-5-5", thinkingLevel: "minimal" });
    await writeFile(join(dir, "modes.json"), JSON.stringify({ modes: {} }));
    assert.equal(readAdvisorMode(dir), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
