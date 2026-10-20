import assert from 'node:assert/strict';
import test from 'node:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { TuiMainScreen, Text } from '@earendil-works/pi-tui';
import type { Component, OverlayOptions, Terminal } from '@earendil-works/pi-tui';
import { theme } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js';
import { filterModelChoices, pickModelOverlay } from './model-picker.ts';

test('model overlay searches model labels and providers rather than only provider prefixes', () => {
  const choices = [
    {value:'neo-proxy/gpt-6-luna',label:'gpt-6-luna',description:'neo-proxy · 1050k'},
    {value:'neo-proxy/claude-haiku-5-5',label:'claude-haiku-5-5',description:'neo-proxy · 1000k'},
  ];
  assert.deepEqual(filterModelChoices(choices,'claude-haiku'),[choices[1]]);
  assert.deepEqual(filterModelChoices(choices,'neo-proxy'),choices);
  assert.deepEqual(filterModelChoices(choices,'missing'),[]);
});

test('model picker remains bottom-anchored at different heights and after filtering', async () => {
  initTheme('dark', false);
  for (const rows of [24, 40, 60]) {
    const terminal = { columns: 110, rows, write() {}, hideCursor() {}, showCursor() {} };
    const tui = new TuiMainScreen(terminal as unknown as Terminal);
    tui.addChild(new Text('Transcript', 0, 0));
    let picker!: Component;
    let options!: OverlayOptions;
    let finish!: (value: string | undefined) => void;
    const ctx = { ui: { custom(factory: Function, config: { overlayOptions: OverlayOptions }) {
      options = config.overlayOptions;
      return new Promise(resolve => {
        finish = resolve;
        picker = factory(tui, theme, {}, resolve);
      });
    } } } as unknown as ExtensionCommandContext;
    const result = pickModelOverlay(ctx, 'Switch session model', Array.from({ length: 20 }, (_, i) => ({ value: `model-${i}`, label: `Model ${i}` })));
    const overlay = tui.showOverlay(picker, options);
    try {
      for (const query of ['', 'model-19']) {
        if (query) picker.handleInput?.(query);
        tui.renderNow(true);
        const bounds = overlay.getBounds();
        assert.ok(bounds);
        assert.equal(bounds.row + bounds.height, rows - 1, 'picker ends one margin row above bottom');
      }
      picker.handleInput?.('\x1b');
      assert.equal(await result, undefined, 'Escape cancels');
    } finally { finish(undefined); overlay.hide(); }
  }
});
