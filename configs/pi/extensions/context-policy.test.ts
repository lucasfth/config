import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemPrompt, normalizeBuildSystemPromptOptions } from '../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js';
import type { BeforeAgentStartEvent, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createSyntheticSourceInfo } from '@earendil-works/pi-coding-agent';
import policy from './context-policy.ts';

test('compact skill index preserves discovery paths without loading bodies or overwriting safety context', () => {
  let handler: ((event: BeforeAgentStartEvent) => void) | undefined;
  // Registration-only harness captures the single before_agent_start handler.
  const api = { on(name: string, callback: unknown) { if(name==='before_agent_start') handler=callback as (event: BeforeAgentStartEvent)=>void; } } as unknown as ExtensionAPI;
  policy(api);
  const options=normalizeBuildSystemPromptOptions({cwd:'/repo',contextFiles:[{path:'/repo/AGENTS.md',content:'MANDATORY_SAFETY_CANARY'}],skills:[{name:'debug',description:'Inspect runtime failures. '.repeat(30),filePath:'/skills/debug/SKILL.md',baseDir:'/skills/debug',sourceInfo:createSyntheticSourceInfo('<inline:debug>',{source:'user'}),disableModelInvocation:false}]});
  const event={type:'before_agent_start',messageType:'user',prompt:'Debug this',systemPrompt:'',systemPromptOptions:options} satisfies BeforeAgentStartEvent;
  handler?.(event);
  const prompt=buildSystemPrompt(options);
  assert.ok(prompt.includes('/skills/debug/SKILL.md'));
  assert.ok(prompt.includes('MANDATORY_SAFETY_CANARY'));
  assert.equal(options.skills.length,0);
  assert.ok(options.sections.skills.length<400);
});
