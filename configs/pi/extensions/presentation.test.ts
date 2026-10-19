import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CustomEditor, initTheme } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { colorToHex, colorToRgb, mixColors, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { WorkingStatusIndicator, RetryStatusIndicator, CompactionStatusIndicator } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/status-indicator.js';
import { theme } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js';
import presentation, { composerActivity, composerColors, fitBoxBorder, formatWorkingDirectory, headerLayout } from './presentation.ts';

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

function createProfileEditor(appearance = 'dark', sessionId = 'session-a') {
  initTheme(appearance, false);
  const callbacks = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
  let factory: ((tui: TUI, theme: EditorTheme, keys: KeybindingsManager) => CustomEditor) | undefined;
  let header: { render(width: number): string[]; invalidate(): void } | undefined;
  presentation({
    registerToolRenderer() {},
    on(name: string, callback: (event: unknown, ctx: ExtensionContext) => void) {
      callbacks.set(name, [...(callbacks.get(name) ?? []), callback]);
    },
    getThinkingLevel: () => 'high',
    getSessionName: () => 'Spinner check',
  } as unknown as ExtensionAPI);
  let renderRequests = 0;
  const terminal = { rows: 40, columns: 120 };
  const tui = { terminal, requestRender() { renderRequests++; } } as unknown as TUI;
  const ctx = {
    mode: 'tui', cwd: '/work/config', model: { id: 'sol', name: 'Sol' },
    getContextUsage: () => ({ percent: 9 }),
    sessionManager: { getSessionId: () => sessionId },
    isIdle: () => true,
    ui: {
      theme, setHeader(fn: Parameters<ExtensionContext['ui']['setHeader']>[0]) { header = fn?.(tui, theme); },
      setFooter(fn: Parameters<ExtensionContext['ui']['setFooter']>[0]) {
        fn?.(tui, theme, { getGitBranch: () => 'main', onBranchChange: () => () => {} } as never);
      },
      setEditorComponent(fn: typeof factory) { factory = fn; },
    },
  } as unknown as ExtensionContext;
  const emit = (name: string, event: unknown = {}) => {
    for (const callback of callbacks.get(name) ?? []) callback(event, ctx);
  };
  emit('session_start');
  assert.ok(factory);
  const editor = factory(tui, {} as EditorTheme, { matches: () => false } as unknown as KeybindingsManager);
  const border = (width = 110) => editor.render(width).map(stripTerminalSequences).find(line => line.startsWith('╭')) ?? '';
  return { editor, border, tui, terminal, emit, header: header!, renderRequests: () => renderRequests };
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

function lastForeground(line: string) {
  return [...line.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)].at(-1)?.slice(1).map(Number);
}

test('activity gradient follows model → concurrent tools → model → idle without changing input', () => {
  const { editor, emit, renderRequests } = createProfileEditor();
  editor.setText('👩🏽‍💻 cafe\u0301 ╭ keep my text');
  const rows = () => editor.render(110);
  const endpoint = () => lastForeground(rows().find(line => stripTerminalSequences(line).startsWith('╰'))!);
  const idle = endpoint();
  const before = renderRequests();
  emit('agent_start');
  assert.deepEqual(endpoint(), [137, 180, 250], 'model endpoint is Catppuccin blue');
  emit('tool_execution_start', { toolCallId: 'a' });
  emit('tool_execution_start', { toolCallId: 'b' });
  assert.deepEqual(endpoint(), [250, 179, 135], 'tool endpoint is peach');
  emit('tool_execution_end', { toolCallId: 'a', isError: false });
  assert.deepEqual(endpoint(), [250, 179, 135], 'one sibling is still running');
  emit('tool_execution_end', { toolCallId: 'b', isError: false });
  emit('turn_start');
  assert.deepEqual(endpoint(), [137, 180, 250]);
  emit('agent_settled', { aborted: false });
  assert.deepEqual(endpoint(), idle);
  assert.equal(editor.getText(), '👩🏽‍💻 cafe\u0301 ╭ keep my text');
  assert.ok(renderRequests() > before);
});

test('recoverable tool failures retain tool activity for running siblings and settle idle', () => {
  const { editor, emit } = createProfileEditor();
  const endpoint = () => lastForeground(editor.render(100).find(line => stripTerminalSequences(line).startsWith('╰'))!);
  const idle = endpoint();
  emit('agent_start');
  emit('tool_execution_start', { toolCallId: 'outer' });
  emit('tool_execution_start', { toolCallId: 'outer/child' });
  emit('tool_execution_end', { toolCallId: 'outer/child', isError: true });
  assert.deepEqual(endpoint(), [250, 179, 135], 'failed child does not hide its running parent');
  emit('tool_execution_end', { toolCallId: 'outer', isError: true });
  assert.deepEqual(endpoint(), [137, 180, 250], 'model can recover from a tool result');
  emit('agent_before_settle', { outcome: 'completed' });
  emit('agent_settled', { aborted: false });
  assert.deepEqual(endpoint(), idle);
});

test('session colours are deterministic, vary across sessions and adapt to appearance', () => {
  for (const appearance of ['light', 'dark'] as const) {
    const colours = new Set(Array.from({ length: 30 }, (_, i) => colorToHex(composerColors(`session-${i}`, appearance, 'idle').base)));
    assert.equal(colours.size, 6);
    const first = createProfileEditor(appearance, 'resumed-session').editor.render(100)[0];
    assert.equal(createProfileEditor(appearance, 'resumed-session').editor.render(100)[0], first);
    const { base, target } = composerColors('resumed-session', appearance, 'idle');
    assert.deepEqual(base, target);
  }
  assert.notDeepEqual(composerColors('same', 'dark', 'idle'), composerColors('same', 'light', 'idle'));
});

test('held retry/compaction states, blocking prompts and errors override working state', () => {
  const { editor, emit, tui, border } = createProfileEditor();
  const endpoint = () => lastForeground(editor.render(180).find(line => stripTerminalSequences(line).startsWith('╰'))!);
  const idle = endpoint();
  emit('agent_start');
  emit('tool_execution_start', { toolCallId: 'a' });
  emit('ui_prompt_start');
  emit('ui_prompt_start');
  emit('ui_prompt_end');
  assert.deepEqual(endpoint(), [249, 226, 175]);
  emit('ui_prompt_end');
  assert.deepEqual(endpoint(), [250, 179, 135]);
  const retry = new RetryStatusIndicator(tui, 1, 3, 30_000);
  const compaction = new CompactionStatusIndicator(tui, 'manual', text => text);
  try {
    editor.setWorkingStatusIndicator(retry);
    emit('agent_before_settle', { outcome: 'error' });
    assert.match(border(180), /Retrying \(1\/3\)/);
    assert.deepEqual(endpoint(), [249, 226, 175]);
    editor.setWorkingStatusIndicator(compaction);
    assert.match(border(180), /Compacting context/);
    assert.deepEqual(endpoint(), [203, 166, 247]);
    editor.setWorkingStatusIndicator(undefined);
    emit('agent_settled', { aborted: false });
    assert.deepEqual(endpoint(), [243, 139, 168], 'terminal failure remains visible');
    emit('agent_start');
    assert.deepEqual(endpoint(), [137, 180, 250], 'new work clears the error');
    emit('agent_settled', { aborted: true });
    assert.deepEqual(endpoint(), idle, 'cancellation restores idle');
    emit('message_end', { message: { role: 'assistant', stopReason: 'error' } });
    assert.deepEqual(endpoint(), [243, 139, 168]);
    emit('agent_before_settle', { outcome: 'completed' });
    emit('agent_settled', { aborted: false });
    assert.deepEqual(endpoint(), idle, 'successful recovery clears a previous model error');
  } finally { retry.dispose(); compaction.dispose(); }
  assert.equal(composerActivity('idle', { kind: 'working' } as never, 0, 0), 'model');
  assert.equal(composerActivity('model', { kind: 'branchSummary' } as never, 0, 0), 'compaction');
});

test('light/dark diagonal corners and spinner stay exact while text and cursor styling remain intact', () => {
  for (const appearance of ['light', 'dark'] as const) {
    const { editor, emit, tui } = createProfileEditor(appearance);
    editor.setText('👩🏽‍💻 cafe\u0301 ╭\nsecond row');
    editor.focused = true;
    const interior = (line: string) => line.replace(/^\x1b\[38;2;\d+;\d+;\d+m│\x1b\[39m/, '').replace(/\x1b\[38;2;\d+;\d+;\d+m│\x1b\[39m$/, '');
    const before = editor.render(120).slice(1, -1).map(interior);
    emit('agent_start');
    const status = new WorkingStatusIndicator(tui, 'Working...', { frames: ['⠋'] }, text => theme.fg('error', text));
    try {
      editor.setWorkingStatusIndicator(status);
      const rows = editor.render(120);
      const top = rows[0];
      const bottom = rows.at(-1)!;
      const { base, target } = composerColors('session-a', appearance, 'model');
      const rgb = (color: typeof base) => { const { r, g, b } = colorToRgb(color); return [r, g, b].map(Math.round); };
      const first = top.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/)!;
      assert.deepEqual(first.slice(1).map(Number), rgb(base));
      assert.ok(top.includes(theme.style('⠋', { fg: base })), 'spinner cannot retain its host thinking colour');
      assert.deepEqual(lastForeground(top), rgb(mixColors(base, target, 0.5, 'srgb')));
      assert.deepEqual(lastForeground(bottom), rgb(target));
      assert.deepEqual(rows.slice(1, -1).map(interior), before);
      for (const focused of [false, true]) {
        editor.focused = focused;
        for (const width of [4, ...Array.from({ length: 115 }, (_, i) => i + 6)]) {
          for (const line of editor.render(width)) assert.ok(visibleWidth(line) <= width, `${appearance}, width ${width}, focus ${focused}`);
        }
      }
      assert.equal(editor.getText(), '👩🏽‍💻 cafe\u0301 ╭\nsecond row');
    } finally { status.dispose(); }
  }
});

test('native unfit wide-grapheme recursion remains documented, not replaced by a placeholder', () => {
  for (const focused of [false, true]) {
    for (let width = 1; width <= 8; width++) {
      const { editor } = createProfileEditor();
      editor.focused = focused;
      editor.setText('👩🏽‍💻 cafe\u0301 ╭\nsecond row');
      if ([1, 2, 3, 5].includes(width)) assert.throws(() => editor.render(width), RangeError);
      else assert.doesNotThrow(() => editor.render(width));
    }
  }
});

test('startup wordmark matches session identity, shrinks to Hugi and stays within every width', () => {
  for (const appearance of ['dark', 'light'] as const) {
    const { header, terminal } = createProfileEditor(appearance);
    const full = header.render(100);
    assert.equal(full.length, 15, 'selected Braille raven plus final command hints');
    const plain = full.map(stripTerminalSequences);
    assert.match(plain.at(-1)!, /Huginn · Pi.*\/model.*\/switch/);
    assert.equal(plain[1], '                    ⣀⣤⣶⣤⣄⣀');
    assert.equal(plain[5], '            ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏'.padEnd(33) + '█ █ █ █ █▀▀ ▀█▀ █▀█ █▀█');
    const short = header.render(62).map(stripTerminalSequences);
    assert.equal(short.length, 4, 'narrow panes keep just the wordmark');
    assert.equal(short[0], '█ █ █ █ █▀▀ ▀█▀ █▀█ █▀█');
    assert.equal(header.render(22).map(stripTerminalSequences)[0], '█ █ █ █ █▀▀ ▀█▀');
    const { base } = composerColors('session-a', appearance, 'idle');
    assert.equal(full[0], theme.style(plain[0], { fg: base }));
    for (const rows of [0, 10, 15, 16, 24, 29, 30, 40]) {
      terminal.rows = rows;
      for (let width = 0; width <= 160; width++) {
        assert.ok(header.render(width).every(line => visibleWidth(line) <= width), `width ${width}, rows ${rows}`);
      }
    }
    terminal.rows = 29;
    assert.equal(header.render(100).length, 4, 'shorter windows keep the compact header');
    terminal.rows = 30;
    assert.equal(header.render(63).length, 15, 'selected artwork fits exactly');
    assert.equal(header.render(4).map(stripTerminalSequences).join(''), 'Hugi');
    terminal.rows = 10;
    assert.equal(header.render(100).length, 1, 'short terminals retain editor space');
    terminal.rows = 40;
    header.invalidate();
    assert.deepEqual(header.render(100), full);
  }
});

test('raven layout boundaries preserve the approved drawing and wordmark columns', () => {
  const full = headerLayout(63, 30);
  assert.equal(full.length, 15);
  assert.deepEqual(full.slice(0, 14).map(line => line.slice(0, 33).trimEnd()), [
    '', '                    ⣀⣤⣶⣤⣄⣀', '                  ⢀⣼⣿⣿⣿⣿⣿⠿⠛⠛⠂',
    '                ⢀⣴⣿⣿⣿⣿⣿⣿⠁', '              ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣯',
    '            ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏', '           ⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣹⠃',
    '        ⢀⠴⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠁⠁', '       ⣠⣴⠿⣛⣵⣾⣿⣿⣿⣿⣿⡿⠋',
    '     ⠴⢚⣩⣴⣿⣿⣿⠿⠿⣿⡿⣿⡏', '   ⢀⠤⢖⣫⣵⣿⠟⠉   ⠹⣇⠹⣄',
    '  ⢀⡴⢺⠟⠹⠿⠃      ⠈⠦⠈⠶⠄', '  ⠁⠔⠁', '',
  ]);
  assert.deepEqual(full.slice(5, 8).map(line => line.slice(33)), [
    '█ █ █ █ █▀▀ ▀█▀ █▀█ █▀█', '█▀█ █ █ █ ▄  █  █ █ █ █', '█ █ ▀▀▀ ▀▀▀ ▄█▄ █ █ █ █',
  ]);
  assert.deepEqual(headerLayout(62, 30), headerLayout(100, 29));
  assert.equal(headerLayout(62, 30).length, 4);
  assert.equal(full.at(-1), ' '.repeat(33) + 'Huginn · Pi   /model · /switch');
});
