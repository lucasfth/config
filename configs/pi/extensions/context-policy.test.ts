import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemPrompt, normalizeBuildSystemPromptOptions } from '../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js';
import type { BeforeAgentStartEvent, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createSyntheticSourceInfo } from '@earendil-works/pi-coding-agent';
import policy from './context-policy.ts';

test('compact skill index preserves routing without overwriting safety context or the native catalogue', () => {
  let handler: ((event: BeforeAgentStartEvent) => void) | undefined;
  // Registration-only harness captures the single before_agent_start handler.
  const api = { registerTool() {}, on(name: string, callback: unknown) { if(name==='before_agent_start') handler=callback as (event: BeforeAgentStartEvent)=>void; } } as unknown as ExtensionAPI;
  policy(api);
  const options=normalizeBuildSystemPromptOptions({cwd:'/repo',contextFiles:[{path:'/repo/AGENTS.md',content:'MANDATORY_SAFETY_CANARY'}],skills:[{name:'debug',description:'Inspect runtime failures. '.repeat(30),filePath:'/skills/debug/SKILL.md',baseDir:'/skills/debug',sourceInfo:createSyntheticSourceInfo('<inline:debug>',{source:'user'}),disableModelInvocation:false}]});
  const event={type:'before_agent_start',messageType:'user',prompt:'Debug this',systemPrompt:'',systemPromptOptions:options} satisfies BeforeAgentStartEvent;
  handler?.(event);
  const prompt=buildSystemPrompt(options);
  assert.ok(prompt.includes('debug: Inspect runtime failures.'));
  assert.ok(!prompt.includes('/skills/debug/SKILL.md'));
  assert.ok(prompt.includes('MANDATORY_SAFETY_CANARY'));
  assert.equal(options.skills.length, 1);
  assert.ok(options.sections.skills.length<400);
});

test('skill index excludes manual-only guides without modifying the native catalogue', () => {
  let handler: ((event: BeforeAgentStartEvent) => void) | undefined;
  policy({ registerTool() {}, on(name: string, callback: unknown) { if (name === 'before_agent_start') handler = callback as (event: BeforeAgentStartEvent) => void; } } as unknown as ExtensionAPI);
  const skill = (name: string, disableModelInvocation = false) => ({ name, description: 'Read this guide.', filePath: `/skills/${name}/SKILL.md`, baseDir: `/skills/${name}`, sourceInfo: createSyntheticSourceInfo('<inline:test>', { source: 'user' }), disableModelInvocation });
  const options = normalizeBuildSystemPromptOptions({ cwd: '/repo', skills: [
    skill('visible'),
    skill('hidden', true),
  ] });
  handler?.({ type: 'before_agent_start', messageType: 'user', prompt: 'Test', systemPrompt: '', systemPromptOptions: options });
  assert.ok(options.sections.skills.includes('visible: Read this guide.'));
  assert.ok(!options.sections.skills.includes('hidden'));
  assert.deepEqual(options.skills.map(item => item.name), ['visible', 'hidden']);
});
