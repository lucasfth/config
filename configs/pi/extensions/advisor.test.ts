import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import configuredAdvisorExtension, { readAdvisorMode } from "./advisor.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AdviseTool } from "pi-omplike-advisor/extensions/advisor.ts";

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

test("routine advice never starts a turn; blockers can interrupt once until primary activity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-advisor-delivery-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  const commands = new Map<string, any>();
  const sent: Array<{ message: any; options: any }> = [];
  const primary = { id: "primary" };
  const secondary = { id: "advisor" };
  const controller = new AbortController();
  const ctx = {
    model: primary,
    modelRegistry: { find: () => secondary, hasConfiguredAuth: () => true },
    signal: controller.signal,
    ui: { notify() {} },
  };
  const pi = {
    on(event: string, handler: (...args: any[]) => any) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand(name: string, options: any) { commands.set(name, options); },
    registerMessageRenderer() {},
    events: { on() {} },
    sendMessage(message: any, options: any) { sent.push({ message, options }); },
  } as unknown as ExtensionAPI;
  async function emit(event: string, value: any) {
    for (const handler of handlers.get(event) ?? []) await handler(value, ctx);
  }
  try {
    await writeFile(join(dir, "modes.json"), JSON.stringify({ modes: { advisor: { provider: "test", modelId: "advisor" } } }));
    configuredAdvisorExtension(pi);
    await emit("before_agent_start", { messageType: "user", prompt: "Work" });
    for (const severity of ["concern", "nit", "blocker", "blocker"]) {
      await commands.get("advisor").handler(`test ${severity} concrete risk`, ctx);
    }
    assert.equal(sent.length, 4, "Even repeated serious findings remain visible");
    assert.deepEqual(sent.map(item => item.options.triggerTurn), [false, false, true, false]);
    assert.ok(!String(sent[0].message.content).includes("self-contained final answer"));
    await emit("before_agent_start", { messageType: "custom" });
    await commands.get("advisor").handler("test blocker still unresolved", ctx);
    assert.equal(sent.at(-1)?.options.triggerTurn, false, "Advisory-only activity cannot rearm interruption");
    await emit("tool_result", { toolName: "edit", isError: false });
    await commands.get("advisor").handler("test blocker unsafe fix", ctx);
    assert.equal(sent.at(-1)?.options.triggerTurn, true, "New tool activity allows another serious warning");
    await emit("before_agent_start", { messageType: "user", prompt: "Continue" });
    await commands.get("advisor").handler("test blocker ignored risk", ctx);
    assert.equal(sent.at(-1)?.options.triggerTurn, true, "A new user instruction rearms supervision");
    controller.abort();
    await emit("tool_result", { toolName: "read", isError: false });
    await commands.get("advisor").handler("test blocker late warning", ctx);
    assert.equal(sent.at(-1)?.options.triggerTurn, false, "An aborted run must not be restarted");
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("issue identity deduplicates rewording but permits evidenced blocker repeats after activity", async () => {
  const deliveries: string[] = [];
  const tool = new AdviseTool(note => { deliveries.push(note); return true; });
  const send = (note: string, severity: "concern" | "blocker", evidence: string) => tool.execute("test", { note, severity, issueId: "unsafe-delete", evidence } as any);
  await send("Deletion is unscoped", "concern", "missing WHERE");
  await send("Same defect, different wording", "concern", "missing WHERE");
  assert.equal(deliveries.length, 1, "Issue identity, not wording, controls deduplication");
  await send("Deletion will erase all rows", "blocker", "missing WHERE");
  assert.equal(deliveries.length, 2, "Severity escalation survives deduplication");
  await send("Still unsafe", "blocker", "bad fix");
  assert.equal(deliveries.length, 2, "Rephrasing evidence without primary activity cannot loop");
  (tool as any).noteActivity();
  await send("Still unsafe", "blocker", "missing WHERE");
  assert.equal(deliveries.length, 2, "Unchanged evidence alone cannot repeat");
  await send("Fix still deletes every row", "blocker", "new WHERE true observed");
  assert.equal(deliveries.length, 3, "New inadequate fix warrants another warning");
  tool.resetDelivered();
  await send("New session", "concern", "missing WHERE");
  assert.equal(deliveries.length, 4);
});
