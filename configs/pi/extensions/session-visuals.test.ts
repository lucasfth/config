import assert from 'node:assert/strict';
import test from 'node:test';
import { topicTitle } from './session-title.ts';
import { fitMermaid } from './mermaid-fit.ts';

test('topic names skip greetings and bound substantive requests',()=>{assert.equal(topicTitle('Hey'),undefined);assert.equal(topicTitle('create some dummy graphs charts just inside this sessions'),'create some dummy graphs charts just inside thi…');assert.ok(!topicTitle('👩🏽‍💻 '.repeat(40))?.includes('�'));});
test('title strips terminal sequences before truncation and from inserted resets',()=>{
  const title = topicTitle('\u001b[31m' + 'request '.repeat(10));
  assert.ok(title);
  assert.doesNotMatch(title, /\u001b/);
  assert.ok(title.length <= 48);
});

test('native non-horizontal Mermaid diagrams remain fenced',()=>{
  const source = '```mermaid\nflowchart TD\n A --> B\n```';
  assert.equal(fitMermaid(source, 90), source);
});
test('wide processing flow renders every node vertically rather than source',()=>{const source='```mermaid\nflowchart LR\n A[Incoming request] --> B{Cached?}\n B -->|Yes| C[Return cached result]\n B -->|No| D[Process request]\n D --> E[Store result]\n E --> F[Return response]\n C --> G[Done]\n F --> G\n```';const output=fitMermaid(source,90);assert.ok(!output.includes('```'));for(const label of ['Incoming request','Cached?','Return cached result','Process request','Store result','Return response','Done'])assert.ok(output.includes(label));});
