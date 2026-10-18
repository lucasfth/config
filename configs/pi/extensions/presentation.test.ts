import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CustomEditor, initTheme } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { WorkingStatusIndicator, RetryStatusIndicator, CompactionStatusIndicator } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/status-indicator.js';
import { theme } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js';
import presentation, { fitBoxBorder, formatWorkingDirectory } from './presentation.ts';

test("box borders stay within narrow terminal widths", () => {
  for (let width = 0; width <= 12; width++) {
    const line = fitBoxBorder("Huginn · Pi", "gpt-6.1-sol · high", width);
    assert.equal(visibleWidth(line), width);
  }
  assert.equal(fitBoxBorder("title", "model", 1), "╭");
  assert.equal(fitBoxBorder("title", "model", 2), "╭╮");
});


test("working directory abbreviates home and preserves other absolute paths", () => {
  assert.equal(formatWorkingDirectory("/Users/lucas/project", "/Users/lucas"), "~/project");
  assert.equal(formatWorkingDirectory("/work/project", "/Users/lucas"), "/work/project");
  assert.equal(formatWorkingDirectory("/Users/lucas-other/project", "/Users/lucas"), "/Users/lucas-other/project");
});

test("grapheme-aware truncation handles emoji and combining sequences", () => {
  const line = fitBoxBorder("👩🏽‍💻 cafe\u0301", "model", 12);
  assert.equal(visibleWidth(line), 12);
  assert.ok(!line.includes("�"));
});

function createProfileEditor() {
  initTheme('dark', false);
  const callbacks = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
  let factory: ((tui: TUI, theme: EditorTheme, keys: KeybindingsManager) => CustomEditor) | undefined;
  presentation({
    registerToolRenderer() {},
    on: (name: string, callback: (event: unknown, ctx: ExtensionContext) => void) => callbacks.set(name, callback),
    getThinkingLevel: () => 'high',
    getSessionName: () => 'Spinner check',
  } as unknown as ExtensionAPI);
  let renderRequests = 0;
  const tui = { terminal: { rows: 40, columns: 120 }, requestRender() { renderRequests++; } } as unknown as TUI;
  const ctx = {
    mode: 'tui', cwd: '/work/config', model: { id: 'sol', name: 'Sol' },
    getContextUsage: () => ({ percent: 9 }),
    ui: {
      theme, setHeader() {},
      setFooter(fn: Parameters<ExtensionContext['ui']['setFooter']>[0]) {
        fn?.(tui, theme, { getGitBranch: () => 'main', onBranchChange: () => () => {} } as never);
      },
      setEditorComponent(fn: typeof factory) { factory = fn; },
    },
  } as unknown as ExtensionContext;
  callbacks.get('session_start')!({}, ctx);
  assert.ok(factory);
  const editor = factory(tui, {} as EditorTheme, { matches: () => false } as unknown as KeybindingsManager);
  const border = (width = 110) => editor.render(width).map(stripTerminalSequences).find(line => line.startsWith('╭')) ?? '';
  return { editor, border, tui, renderRequests: () => renderRequests };
}

test('native working spinner replaces the idle icon without a working suffix', () => {
  const { editor, border, tui } = createProfileEditor();
  assert.match(border(), /╭\s+◉ Sol/);
  const indicator = new WorkingStatusIndicator(tui, 'Working...', { frames: ['⠋'] }, text => text);
  try {
    editor.setWorkingStatusIndicator(indicator);
    assert.match(border(), /╭\s+⠋ Sol/);
    assert.ok(!border().includes('◉'));
    assert.ok(!/working/i.test(border()));
    for (let width = 1; width <= 120; width++) {
      for (const line of editor.render(width)) assert.ok(visibleWidth(line) <= width);
    }
    editor.setWorkingStatusIndicator(undefined);
    assert.match(border(), /╭\s+◉ Sol/);
  } finally { indicator.dispose(); }
});

test('native spinner advances and requests renders without an extension timer', async () => {
  const { editor, border, tui, renderRequests } = createProfileEditor();
  const animated = new WorkingStatusIndicator(tui, 'Working...',
    { frames: ['⠋', '⠙'], intervalMs: 10 }, text => text);
  const initialRequests = renderRequests();
  try {
    editor.setWorkingStatusIndicator(animated);
    const first = border();
    let changed = false;
    for (let attempt = 0; attempt < 30 && !changed; attempt++) {
      await delay(11);
      changed = border() !== first;
    }
    assert.ok(changed, 'Native animation reaches the custom top border');
    assert.ok(renderRequests() > initialRequests, 'Native loader requests a render for its next frame');
    editor.setWorkingStatusIndicator(undefined);
    assert.match(border(), /◉ Sol/);
  } finally { animated.dispose(); }
});

test('retry status retains its explanation instead of becoming a bare spinner', () => {
  const { editor, border, tui } = createProfileEditor();
  const indicator = new RetryStatusIndicator(tui, 1, 3, 30_000);
  try {
    editor.setWorkingStatusIndicator(indicator);
    assert.match(border(180), /Retrying \(1\/3\)/);
    editor.setWorkingStatusIndicator(undefined);
    assert.match(border(), /◉ Sol/);
  } finally { indicator.dispose(); }
});

test('compaction status retains its explanation', () => {
  const { editor, border, tui } = createProfileEditor();
  const indicator = new CompactionStatusIndicator(tui, 'manual', text => text);
  try {
    editor.setWorkingStatusIndicator(indicator);
    assert.match(border(180), /Compacting context/);
    editor.setWorkingStatusIndicator(undefined);
    assert.match(border(), /◉ Sol/);
  } finally { indicator.dispose(); }
});
