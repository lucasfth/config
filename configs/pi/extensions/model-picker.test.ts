import assert from 'node:assert/strict';
import test from 'node:test';
import { filterModelChoices } from './model-picker.ts';

test('model overlay searches model labels and providers rather than only provider prefixes', () => {
  const choices = [
    {value:'neo-proxy/gpt-6-luna',label:'gpt-6-luna',description:'neo-proxy · 1050k'},
    {value:'neo-proxy/claude-haiku-5-5',label:'claude-haiku-5-5',description:'neo-proxy · 1000k'},
  ];
  assert.deepEqual(filterModelChoices(choices,'claude-haiku'),[choices[1]]);
  assert.deepEqual(filterModelChoices(choices,'neo-proxy'),choices);
  assert.deepEqual(filterModelChoices(choices,'missing'),[]);
});
