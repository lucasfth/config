import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { CustomEditor } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from '@earendil-works/pi-coding-agent';
import { mixColors, parseColor, stripTerminalSequences, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { EditorTheme, TUI } from '@earendil-works/pi-tui';
import { installToolFrames } from './tool-frames.ts';
import { installSessionTitles } from './session-title.ts';


export function formatWorkingDirectory(cwd: string, home = process.env.HOME) {
  return home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd;
}

const execFileAsync = promisify(execFile);

export async function getWorkingDirectoryLabel(cwd: string): Promise<string> {
  const git = async (...args: string[]) => (await execFileAsync('git', args, { cwd, timeout: 2000 })).stdout.trim();
  try {
    const [root, common, gitDir] = (await git('rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir', '--absolute-git-dir')).split('\n');
    if (common === gitDir) return path.basename(root);
    const worktrees = await git(`--git-dir=${common}`, 'worktree', 'list', '--porcelain', '-z');
    const mainRoot = worktrees.match(/^worktree ([^\0]+)\0/)?.[1];
    return `${path.basename(mainRoot ?? path.dirname(common))} (wt:${path.basename(root)})`;
  } catch {
    return formatWorkingDirectory(cwd);
  }
}

export function fitBoxBorder(left: string, right: string, width: number, [open, close] = ['╭', '╮']) {
  if (width <= 0) return '';
  if (width === 1) return open;
  if (width < 5) return `${open}${'─'.repeat(width - 2)}${close}`;
  const available = width - 4;
  const leftBudget = Math.min(visibleWidth(left), Math.floor(available / 2));
  const rightText = truncateToWidth(right, available - leftBudget, '…');
  const leftText = truncateToWidth(left, Math.max(0, available - visibleWidth(rightText)), '…');
  return `${open} ${leftText}${'─'.repeat(Math.max(0, available - visibleWidth(leftText) - visibleWidth(rightText)))}${rightText} ${close}`;
}

/** Prefixes a user message with a session-coloured dot without breaking leading Markdown blocks. */
export function markUserMessage(markdown: string, dot: string) {
  return /^(\s|#|>|[-*+|]|\d+[.)]|```|~~~)/.test(markdown) ? `${dot}\n\n${markdown}` : `${dot} ${markdown}`;
}

export type ComposerActivity = 'idle' | 'model' | 'tool' | 'waiting' | 'retry' | 'compaction' | 'error';
type ProfileStatus = Parameters<CustomEditor['setWorkingStatusIndicator']>[0];
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const headerLetters: Record<string, string[]> = {
  H: ['█ █', '█▀█', '█ █'],
  U: ['█ █', '█ █', '▀▀▀'],
  G: ['█▀▀', '█ ▄', '▀▀▀'],
  I: ['▀█▀', ' █ ', '▄█▄'],
  N: ['█▀█', '█ █', '█ █'],
};
const headerWordmarks = ['HUGINN', 'HUGI'].map(word =>
  [0, 1, 2].map(row => [...word].map(letter => headerLetters[letter][row]).join(' ')));
// Braille conversion of the user-supplied reference, selected by Lucas.
// Source: Shutterstock image 2285354879; no original-artwork/licence claim.
const headerRaven = [
  '',
  '                    ⣀⣤⣶⣤⣄⣀',
  '                  ⢀⣼⣿⣿⣿⣿⣿⠿⠛⠛⠂',
  '                ⢀⣴⣿⣿⣿⣿⣿⣿⠁',
  '              ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣯',
  '            ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏',
  '           ⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣹⠃',
  '        ⢀⠴⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠁⠁',
  '       ⣠⣴⠿⣛⣵⣾⣿⣿⣿⣿⣿⡿⠋',
  '     ⠴⢚⣩⣴⣿⣿⣿⠿⠿⣿⡿⣿⡏',
  '   ⢀⠤⢖⣫⣵⣿⠟⠉   ⠹⣇⠹⣄',
  '  ⢀⡴⢺⠟⠹⠿⠃      ⠈⠦⠈⠶⠄',
  '  ⠁⠔⠁',
  '',
];

export function headerLayout(width: number, rows: number): string[] {
  if (width <= 0) return [];
  const hints = 'Huginn · Pi   /model · /switch';
  if (width >= 63 && rows >= 30) {
    return [
      ...headerRaven.map((row, i) => i >= 5 && i <= 7 ? row.padEnd(33) + headerWordmarks[0][i - 5] : row),
      ' '.repeat(33) + hints,
    ];
  }
  const wordmark = rows >= 16 ? headerWordmarks.find(art => visibleWidth(art[0]) <= width) : undefined;
  if (wordmark) return [...wordmark, truncateToWidth(hints, width, '')];
  return [truncateToWidth(width >= 6 ? 'Huginn · Pi' : 'Hugi', width, '')];
}

export function composerColors(sessionId: string, appearance: 'light' | 'dark', activity: ComposerActivity) {
  const light = appearance === 'light';
  const identities = light
    ? ['#179299', '#40a02b', '#8839ef', '#d65d0e', '#ea76cb', '#7287fd']
    : ['#94e2d5', '#a6e3a1', '#cba6f7', '#f5c2e7', '#89dceb', '#b4befe'];
  const index = createHash('sha256').update(sessionId).digest().readUInt32BE(0) % identities.length;
  const base = parseColor(identities[index]);
  const targets = light
    ? { model: '#1e66f5', tool: '#fe640b', waiting: '#df8e1d', retry: '#df8e1d', compaction: '#8839ef', error: '#d20f39' }
    : { model: '#89b4fa', tool: '#fab387', waiting: '#f9e2af', retry: '#f9e2af', compaction: '#cba6f7', error: '#f38ba8' };
  return { base, target: activity === 'idle' ? base : parseColor(targets[activity]) };
}

export function composerActivity(
  activity: ComposerActivity, status: ProfileStatus, promptDepth: number, toolCount: number,
): ComposerActivity {
  if (status?.kind === 'retry') return 'retry';
  if (status?.kind === 'compaction' || status?.kind === 'branchSummary') return 'compaction';
  if (promptDepth) return 'waiting';
  if (activity === 'error') return 'error';
  if (toolCount) return 'tool';
  return status?.kind === 'working' && activity === 'idle' ? 'model' : activity;
}


export default function presentationExtension(pi: ExtensionAPI) {
  installToolFrames(pi);
  installSessionTitles(pi);
  let active: ExtensionContext | undefined;
  let branch = '';
  let render: (() => void) | undefined;
  let activity: ComposerActivity = 'idle';
  const tools = new Set<string>();
  let promptDepth = 0;
  let demoTimer: ReturnType<typeof setInterval> | undefined;
  let demoMs = 0;
  const demoStates = ['model', 'tool', 'waiting', 'compaction', 'error'] as const;
  const stopDemo = () => {
    if (demoTimer !== undefined) clearInterval(demoTimer);
    demoTimer = undefined;
  };
  const update = (next: ComposerActivity) => { activity = next; render?.(); };
  pi.on('input', () => { stopDemo(); render?.(); });
  pi.on('agent_start', () => { stopDemo(); tools.clear(); update('model'); });
  pi.on('turn_start', () => update('model'));
  pi.on('tool_execution_start', event => { tools.add(event.toolCallId); render?.(); });
  pi.on('tool_execution_end', event => { tools.delete(event.toolCallId); render?.(); });
  pi.on('message_end', event => {
    if (event.message.role === 'assistant' && event.message.stopReason === 'error') update('error');
  });
  pi.on('agent_before_settle', event => update(event.outcome === 'error' ? 'error' : 'idle'));
  pi.on('agent_settled', event => {
    tools.clear();
    promptDepth = 0;
    update(activity === 'error' && !event.aborted ? 'error' : 'idle');
  });
  pi.on('ui_prompt_start', () => { promptDepth++; render?.(); });
  pi.on('ui_prompt_end', () => { promptDepth = Math.max(0, promptDepth - 1); render?.(); });
  pi.on('model_select', () => render?.());
  pi.on('thinking_level_select', () => render?.());
  pi.on('session_info_changed', () => render?.());
  pi.on('message_end', () => render?.());
  pi.on('session_shutdown', () => { stopDemo(); active = undefined; render = undefined; tools.clear(); promptDepth = 0; activity = 'idle'; });
  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType !== 'user' || !active) return markdown;
    const theme = active.ui.theme;
    const { base } = composerColors(active.sessionManager.getSessionId(), theme.appearance, 'idle');
    return markUserMessage(markdown, theme.style('●', { fg: base }));
  });
  pi.on('session_start', async (_event, ctx) => {
    stopDemo();
    if (ctx.mode !== 'tui') return;
    active = ctx;
    tools.clear();
    promptDepth = 0;
    activity = ctx.isIdle() ? 'idle' : 'model';
    const sessionId = ctx.sessionManager.getSessionId();
    let location = formatWorkingDirectory(ctx.cwd);
    let profileStatus: ProfileStatus;
    ctx.ui.setHeader(tui => ({
      render(width) {
        if (width <= 0) return [];
        const theme = ctx.ui.theme;
        const { base } = composerColors(sessionId, theme.appearance, 'idle');
        const lines = headerLayout(width, tui.terminal.rows);
        const artwork = lines.map((line, i) => lines.length > 1 && i === lines.length - 1
          ? theme.fg('muted', line)
          : theme.style(line, { fg: base }));
        if (width < 40 || tui.terminal.rows < 20) return artwork;
        const entries = ([['model', 'Responding'], ['tool', 'Tools'], ['waiting', 'Waiting / retry'],
          ['compaction', 'Compacting'], ['error', 'Error']] as const).map(([state, label]) =>
          theme.style('■', { fg: composerColors(sessionId, theme.appearance, state).target }) + theme.fg('muted', ` ${label}`));
        entries.push(theme.fg('muted', 'Idle · session colour'));
        const label = 'Activity type  ';
        const indent = visibleWidth(label);
        const legend = [theme.fg('muted', label)];
        for (const entry of entries) {
          const last = legend.length - 1;
          const gap = visibleWidth(legend[last]) > indent ? '   ' : '';
          if (visibleWidth(legend[last]) + gap.length + visibleWidth(entry) > width) {
            legend.push(' '.repeat(indent) + entry);
          } else legend[last] += gap + entry;
        }
        const sample = ['', theme.fg('muted', '─'.repeat(width))];
        if (width >= 63) {
          const state = demoTimer !== undefined ? 'model' : composerActivity(activity, profileStatus, promptDepth, tools.size);
          let { target } = composerColors(sessionId, theme.appearance, state);
          if (demoTimer !== undefined) {
            const phase = demoMs / 2000;
            const index = Math.floor(phase) % demoStates.length;
            const amount = phase % 1;
            target = mixColors(composerColors(sessionId, theme.appearance, demoStates[index]).target,
              composerColors(sessionId, theme.appearance, demoStates[(index + 1) % demoStates.length]).target,
              amount * amount * (3 - 2 * amount), 'srgb');
          }
          const sampleWidth = width;
          const caption = 'Activity type';
          const borders = [fitBoxBorder('Session colour', '', sampleWidth),
            `│${' '.repeat(sampleWidth - 2)}│`,
            `╰${'─'.repeat(sampleWidth - visibleWidth(caption) - 4)} ${caption} ╯`];
          sample.splice(0, 2, ...borders.map((line, row) => [...line].map((char, column) => {
            if (!'╭╮╰╯─│'.includes(char)) return theme.fg('muted', char);
            const across = Math.max(0, column - 16) / (sampleWidth - 17);
            const amount = state === 'idle' ? 0 : (across + row / 2) / 2;
            return theme.style(char, { fg: mixColors(base, target, amount, 'srgb') });
          }).join('')));
        }
        const extra = [...sample, ...legend];
        return artwork.length + extra.length <= tui.terminal.rows - 8 ? [...artwork, ...extra] : artwork;
      },
      invalidate() {},
    }));
    ctx.ui.setFooter((tui, _theme, footer) => {
      render = () => tui.requestRender();
      branch = footer.getGitBranch() ?? '';
      const unsubscribe = footer.onBranchChange(() => { branch = footer.getGitBranch() ?? ''; render?.(); });
      return { dispose: unsubscribe, invalidate() {}, render: () => [] };
    });
    class ProfileEditor extends CustomEditor {
      private identityColumns = 0;
      private titleColumns = 0;
      override setWorkingStatusIndicator(indicator: Parameters<CustomEditor['setWorkingStatusIndicator']>[0]) {
        super.setWorkingStatusIndicator(indicator);
        profileStatus = indicator;
        render?.();
      }
      constructor(tui: TUI, theme: EditorTheme, keys: KeybindingsManager) {
        super(tui, theme, keys, { paddingX: 2, embedWorkingStatus: true });
      }
      override insertImage(path: string) {
        super.insertImage(path);
        pi.events.emit('huginn:image-attachment', path);
      }
      protected override renderTopBorder(width: number, hiddenLines: number) {
        if (width < 5) return fitBoxBorder('', '', width);
        const title = pi.getSessionName()?.trim().toLocaleUpperCase();
        const right = truncateToWidth(hiddenLines ? ` ↑${hiddenLines} ─` : '', width - 3, '');
        const left = truncateToWidth(title ? `─ ${title} ` : '', width - 2 - visibleWidth(right), '… ');
        this.titleColumns = visibleWidth(left);
        return `╭${left}${'─'.repeat(Math.max(0, width - 2 - visibleWidth(left) - visibleWidth(right)))}${right}╮`;
      }
      protected override renderBottomBorder(width: number, hiddenLines: number) {
        const usage = active?.getContextUsage();
        const model = active?.model?.name || active?.model?.id || 'no model';
        const percent = usage?.percent == null ? '0%' : `${Math.round(usage.percent)}%`;
        const details = `${percent} ctx · ${pi.getThinkingLevel()}${hiddenLines ? ` · ↓${hiddenLines}` : ''}`;
        const status = profileStatus
          ? profileStatus.kind === 'working'
            // The host colours this with the thinking level; the composer owns its visible colour.
            ? stripTerminalSequences(profileStatus.renderSpinnerInBorder(1))
            : profileStatus.renderInBorder(Math.max(1, Math.floor(width / 2)))
          : '◉';
        const label = ` ${status} ${model}  ›  ${location}${branch ? `  ⎇ ${branch}` : ''} `;
        this.identityColumns = Math.max(0, Math.min(width - 2, visibleWidth(`   ${status} ${model}`)));
        return fitBoxBorder(label, ` ${details} `, width, ['╰', '╯']);
      }
      override render(width: number) {
        const lines = super.render(width);
        if (width <= 0) return lines;
        // Native editor layout puts the composer first and autocomplete after its bottom border.
        const bottom = lines.findIndex(line => stripTerminalSequences(line).startsWith('╰'));
        if (bottom < 0) return lines;
        const theme = ctx.ui.theme;
        const state = composerActivity(activity, profileStatus, promptDepth, tools.size);
        const { base, target } = composerColors(sessionId, theme.appearance, state);
        const paint = (text: string, column: number, row: number) => {
          const across = Math.max(0, column - this.identityColumns) / Math.max(1, width - 1 - this.identityColumns);
          const amount = state === 'idle' ? 0 : (across + row / Math.max(1, bottom)) / 2;
          const color = amount === 0 ? base : amount === 1 ? target : mixColors(base, target, amount, 'srgb');
          // Only the session title is bold; the corner, dashes and scroll marker stay plain.
          return theme.style(text, { fg: color, bold: row === 0 && column > 1 && column <= this.titleColumns && text !== ' ' });
        };
        for (let row = 0; row <= bottom; row++) {
          if (row === 0 || row === bottom) {
            let column = 0;
            lines[row] = Array.from(graphemes.segment(stripTerminalSequences(lines[row])), ({ segment }) => {
              const cell = paint(segment, column, row);
              column += visibleWidth(segment);
              return cell;
            }).join('');
          } else if (width > 1 && lines[row].startsWith(' ') && lines[row].endsWith(' ')) {
            lines[row] = paint('│', 0, row) + lines[row].slice(1, -1) + paint('│', width - 1, row);
          }
        }
        return lines;
      }
    }
    ctx.ui.setEditorComponent((tui, theme, keys) => new ProfileEditor(tui, theme, keys));
    if (ctx.isIdle() && !ctx.sessionManager.getBranch?.().some(entry => entry.type === 'message' && entry.message.role === 'user')) {
      demoMs = 0;
      demoTimer = setInterval(() => { demoMs += 100; render?.(); }, 100);
      demoTimer.unref();
    }
    location = await getWorkingDirectoryLabel(ctx.cwd);
    if (active === ctx) render?.();
  });
}
