import assert from "node:assert/strict";
import test from "node:test";
import { AdvisorRuntime, AdviseTool } from "pi-omplike-advisor/extensions/advisor.ts";

test("advisor retains the proposal and user approval after its own context reset", async () => {
  const prompts: any[][] = [];
  const agent = {
    state: { model: { contextWindow: 100 }, messages: [] as any[] },
    abort() {},
    reset() { this.state.messages = []; },
    async prompt(messages: any[]) {
      prompts.push(messages);
      this.state.messages.push(...messages, { role: "assistant", stopReason: "stop", usage: { input: 90 } });
    },
  };
  const runtime = new AdvisorRuntime(agent as any, new AdviseTool(() => true), 0);
  const proposal = "#### Assistant\n\nProposed: /retro replaces the reserved slot; AAR remains independent. Approve?";
  runtime.push(proposal, proposal);
  assert.equal(await runtime.waitUntilSettled(1000), "settled");
  const approval = "#### User\n\ngo\n\n#### Assistant\n\nImplement the approved design.";
  runtime.push(approval, approval);
  assert.equal(await runtime.waitUntilSettled(1000), "settled");
  const replay = JSON.stringify(prompts.at(-1));
  assert.match(replay, /replaces the reserved slot/);
  assert.match(replay, /#### User\\n\\ngo/);
  runtime.reset();
  runtime.push("#### User\n\nUnrelated new session");
  assert.equal(await runtime.waitUntilSettled(1000), "settled");
  assert.doesNotMatch(JSON.stringify(prompts.at(-1)), /replaces the reserved slot/);
  runtime.dispose();
});

test("decision replay is bounded and preserves context on reactive overflow", async () => {
  const prompts: any[][] = [];
  let overflow = true;
  const agent = {
    state: { model: { contextWindow: 1000 }, messages: [] as any[] },
    abort() {},
    reset() { this.state.messages = []; },
    async prompt(messages: any[]) {
      prompts.push(messages);
      this.state.messages.push(...messages, { role: "assistant", stopReason: overflow ? "length" : "stop" });
      overflow = false;
    },
  };
  const runtime = new AdvisorRuntime(agent as any, new AdviseTool(() => true), 0);
  runtime.push("tool payload must not be retained", "PUBLIC_PROPOSAL");
  assert.equal(await runtime.waitUntilSettled(1000), "settled");
  assert.match(JSON.stringify(prompts.at(-1)), /PUBLIC_PROPOSAL/);
  for (let i = 0; i < 12; i++) {
    runtime.push("tool output", `PUBLIC_${i} ${"x".repeat(3000)}`);
    assert.equal(await runtime.waitUntilSettled(1000), "settled");
  }
  agent.reset();
  runtime.push("latest output");
  assert.equal(await runtime.waitUntilSettled(1000), "settled");
  const preamble = prompts.at(-1)![0].content[0].text;
  assert.ok(preamble.length < 16500);
  assert.ok(!preamble.includes("PUBLIC_PROPOSAL"));
  assert.ok(!preamble.includes("tool output"));
  assert.ok(preamble.includes("PUBLIC_11"));
  runtime.dispose();
});
