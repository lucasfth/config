import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CustomEditor, initTheme } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { colorToHex, colorToRgb, mixColors, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { WorkingStatusIndicator, RetryStatusIndicator, CompactionStatusIndicator } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/status-indicator.js';
import { theme } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js';
import presentation, { composerActivity, composerColors, fitBoxBorder, formatWorkingDirectory, getWorkingDirectoryLabel, headerLayout } from './presentation.ts';

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

test('composer location uses the main repo name from subdirectories and linked worktrees', async () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pi-location-')));
  const repo = path.join(dir, 'ecoray-web');
  const worktree = path.join(dir, '3002');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    mkdirSync(repo);
    git(repo, 'init');
    git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
    git(repo, 'worktree', 'add', '-b', 'fixture', worktree);
    mkdirSync(path.join(repo, 'src'));
    mkdirSync(path.join(worktree, 'src'));
    const location = getWorkingDirectoryLabel;
    assert.equal(await location(repo), 'ecoray-web');
    assert.equal(await location(path.join(repo, 'src')), 'ecoray-web');
    assert.equal(await location(worktree), 'ecoray-web (wt:3002)');
    assert.equal(await location(path.join(worktree, 'src')), 'ecoray-web (wt:3002)');
    const title = 'Fix battery dispatch savings, recipient phone and Firebase-backed report images';
    const { border, ready } = createProfileEditor('dark', 'location-fixture', false, { cwd: worktree, title });
    await ready;
    assert.match(border(180), /ecoray-web \(wt:3002\).*⎇ main/);
    assert.ok(!border(180).includes('▰'));
    assert.ok(!border(180).includes(dir));
    assert.ok(border(180).includes(title));
    assert.equal(await location(dir), formatWorkingDirectory(dir));
    assert.equal(await location(path.join(dir, 'missing')), formatWorkingDirectory(path.join(dir, 'missing')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('short left labels free more than half the border for the session description', () => {
  const left = ' ◉ Sol › config ⎇ main ';
  const right = ' 9% · high · Fix battery dispatch savings, recipient phone and Firebase-backed report images ';
  const line = fitBoxBorder(left, right, 120);
  assert.ok(line.includes(left));
  assert.ok(line.includes(right));
  assert.equal(visibleWidth(line), 120);
});

test("grapheme-aware truncation handles emoji and combining sequences", () => {
  const line = fitBoxBorder("👩🏽‍💻 cafe\u0301", "model", 12);
  assert.equal(visibleWidth(line), 12);
  assert.ok(!line.includes("�"));
});

function createProfileEditor(appearance = 'dark', sessionId = 'session-a', fresh = false, options: { cwd?: string; title?: string } = {}) {
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
    getSessionName: () => options.title ?? 'Spinner check',
  } as unknown as ExtensionAPI);
  let renderRequests = 0;
  const terminal = { rows: 40, columns: 120 };
  const tui = { terminal, requestRender() { renderRequests++; } } as unknown as TUI;
  const ctx = {
    mode: 'tui', cwd: options.cwd ?? '/work/config', model: { id: 'sol', name: 'Sol' },
    getContextUsage: () => ({ percent: 9 }),
    sessionManager: { getSessionId: () => sessionId, getBranch: () => fresh ? [] : [{ type: 'message', message: { role: 'user' } }] },
    isIdle: () => true,
    ui: {
      theme, setHeader(fn: Parameters<ExtensionContext['ui']['setHeader']>[0]) { header = fn?.(tui, theme); },
      setFooter(fn: Parameters<ExtensionContext['ui']['setFooter']>[0]) {
        fn?.(tui, theme, { getGitBranch: () => 'main', onBranchChange: () => () => {} } as never);
      },
      setEditorComponent(fn: typeof factory) { factory = fn; },
    },
  } as unknown as ExtensionContext;
  const emit = (name: string, event: unknown = {}) => Promise.all(
    (callbacks.get(name) ?? []).map(callback => callback(event, ctx)),
  );
  const ready = emit('session_start');
  assert.ok(factory);
  const editor = factory(tui, {} as EditorTheme, { matches: () => false } as unknown as KeybindingsManager);
  const border = (width = 110) => editor.render(width).map(stripTerminalSequences).find(line => line.startsWith('╭')) ?? '';
  return { editor, border, tui, terminal, emit, ready, header: header!, renderRequests: () => renderRequests };
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
    assert.equal(full.length, 20, '15 artwork rows plus three-row sample and two-line legend');
    const plain = full.map(stripTerminalSequences);
    assert.match(plain[14], /Huginn · Pi.*\/model.*\/switch/);
    assert.equal(plain[1], '                    ⣀⣤⣶⣤⣄⣀');
    assert.equal(plain[5], '            ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏'.padEnd(33) + '█ █ █ █ █▀▀ ▀█▀ █▀█ █▀█');
    const short = header.render(62).map(stripTerminalSequences);
    assert.equal(short.length, 8, 'narrow panes keep the wordmark plus wrapped legend');
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
    assert.equal(header.render(100).length, 9, 'shorter windows keep the compact header plus sample and legend');
    terminal.rows = 30;
    assert.equal(header.render(63).length, 20, 'sample and legend fit a 30-row terminal');
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

test('separated header legend uses exact activity swatches and wraps without stealing composer space', () => {
  for (const appearance of ['dark', 'light'] as const) {
    const { header, terminal } = createProfileEditor(appearance);
    for (const width of [40, 62, 63, 80, 100, 115, 160]) {
      terminal.rows = 30;
      const lines = header.render(width);
      const plain = lines.map(stripTerminalSequences);
      const start = plain.findIndex(line => line.startsWith('Activity type'));
      assert.ok(start > 0, `legend present at ${width} columns`);
      if (width >= 63) {
        assert.match(plain[start - 3], /^╭.*Session colour.*╮$/u);
        assert.match(plain[start - 2], /^│ +│$/u, 'dummy input interior stays empty');
        assert.match(plain[start - 1], /^╰.*Activity type.*╯$/u);
        assert.equal(visibleWidth(lines[start - 1]), width, 'sample follows available header width');
      } else assert.match(plain[start - 1], /^─+$/u, 'small panes retain text-only legend');
      assert.ok(plain.slice(0, start).some(line => line.includes('/switch')));
      const legend = lines.slice(start).join('\n');
      for (const [activity, label] of [['model', 'Responding'], ['tool', 'Tools'], ['waiting', 'Waiting / retry'], ['compaction', 'Compacting'], ['error', 'Error']] as const) {
        const { target } = composerColors('session-a', appearance, activity);
        assert.ok(legend.includes(theme.style('■', { fg: target }) + theme.fg('muted', ` ${label}`)), `${appearance}: ${activity} swatch and muted label`);
      }
      assert.ok(stripTerminalSequences(legend).includes('Idle · session colour'));
      assert.ok(lines.every(line => visibleWidth(line) <= width));
      assert.ok(lines.length <= terminal.rows - 8, 'leave at least eight rows outside header');
    }
    terminal.rows = 15;
    assert.ok(!header.render(100).some(line => stripTerminalSequences(line).includes('Activity type')));
    terminal.rows = 40;
    assert.ok(!header.render(39).some(line => stripTerminalSequences(line).includes('Activity type')));
  }
});

test('sample border follows composer endpoints with one compact text row', () => {
  for (const appearance of ['dark', 'light'] as const) {
    const { header, editor, emit, tui } = createProfileEditor(appearance);
    const check = (state: Parameters<typeof composerColors>[2]) => {
      const lines = header.render(100);
      assert.equal(lines.length, 20, 'one interior row added to the compact sample');
      const { base, target } = composerColors('session-a', appearance, state);
      assert.ok(lines[15].startsWith(theme.style('╭', { fg: base })));
      assert.ok(lines[17].endsWith(theme.style('╯', { fg: target })));
      assert.ok(lines[15].includes(theme.fg('muted', 'S')));
      assert.ok(lines[17].includes(theme.fg('muted', 'A')));
    };
    check('idle');
    emit('agent_start');
    check('model');
    emit('tool_execution_start', { toolCallId: 'preview-tool' });
    check('tool');
    emit('ui_prompt_start');
    check('waiting');
    emit('ui_prompt_end');
    const status = new RetryStatusIndicator(tui, 1, 3, 30_000);
    try {
      editor.setWorkingStatusIndicator(status);
      check('retry');
    } finally { editor.setWorkingStatusIndicator(undefined); status.dispose(); }
    emit('agent_settled');
    check('idle');
  }
});

test('fresh header demos colours only until first submitted prompt and cleans up its timer', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { header, editor, emit, renderRequests } = createProfileEditor('dark', 'session-a', true);
  const endpoint = () => lastForeground(header.render(100)[17]);
  const composer = editor.render(100);
  assert.match(stripTerminalSequences(header.render(100)[17]), /Activity type/);
  assert.equal(visibleWidth(header.render(100)[17]), 100);
  const model = endpoint();
  t.mock.timers.tick(1600);
  assert.notDeepEqual(endpoint(), model, 'fades between activity colours');
  t.mock.timers.tick(400);
  assert.deepEqual(endpoint(), [250, 179, 135], 'next demo colour is tools');
  assert.deepEqual(editor.render(100), composer, 'demo never changes the real composer');
  for (const [width, rows] of [[63, 30], [80, 30], [160, 40]]) {
    assert.equal(visibleWidth(header.render(width)[15]), width);
    assert.ok(header.render(width).length <= rows - 8);
  }
  emit('input', { text: 'First prompt', source: 'interactive' });
  const requests = renderRequests();
  const stopped = header.render(100);
  assert.match(stripTerminalSequences(stopped[17]), /Activity type/);
  t.mock.timers.tick(12_000);
  assert.equal(renderRequests(), requests, 'first input clears the interval');
  assert.deepEqual(header.render(100), stopped);
  emit('agent_start');
  assert.deepEqual(endpoint(), [137, 180, 250], 'real activity takes over');
  emit('agent_settled');
  t.mock.timers.tick(12_000);
  assert.deepEqual(editor.render(100), composer);
  assert.ok(!stripTerminalSequences(header.render(100)[17]).includes('demo'));
  emit('session_shutdown');
});

test('header demo stops on agent start, session replacement and shutdown', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { emit, renderRequests } = createProfileEditor('light', 'session-a', true);
  t.mock.timers.tick(200);
  let requests = renderRequests();
  assert.ok(requests > 0);
  emit('session_start');
  requests = renderRequests();
  t.mock.timers.tick(100);
  assert.equal(renderRequests(), requests + 1, 'session replacement leaves exactly one timer');
  emit('agent_start');
  requests = renderRequests();
  t.mock.timers.tick(5000);
  assert.equal(renderRequests(), requests);
  emit('session_start');
  emit('session_shutdown');
  requests = renderRequests();
  t.mock.timers.tick(5000);
  assert.equal(renderRequests(), requests, 'shutdown clears animation timer');
});
