import { createHash } from 'node:crypto';
import { CustomEditor } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from '@earendil-works/pi-coding-agent';
import { mixColors, parseColor, stripTerminalSequences, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { EditorTheme, TUI } from '@earendil-works/pi-tui';
import { installToolFrames } from './tool-frames.ts';
import { installSessionTitles } from './session-title.ts';


export function formatWorkingDirectory(cwd: string, home = process.env.HOME) {
  return home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd;
}

export function fitBoxBorder(left: string, right: string, width: number) {
  if (width <= 0) return '';
  if (width === 1) return '╭';
  if (width < 5) return `╭${'─'.repeat(width - 2)}╮`;
  const available = width - 4;
  const rightText = truncateToWidth(right, Math.floor(available / 2), '');
  const leftText = truncateToWidth(left, Math.max(0, available - visibleWidth(rightText)), '');
  return `╭ ${leftText}${'─'.repeat(Math.max(0, available - visibleWidth(leftText) - visibleWidth(rightText)))}${rightText} ╮`;
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
  const update = (next: ComposerActivity) => { activity = next; render?.(); };
  pi.on('agent_start', () => { tools.clear(); update('model'); });
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
  pi.on('session_shutdown', () => { active = undefined; render = undefined; tools.clear(); promptDepth = 0; activity = 'idle'; });
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    active = ctx;
    tools.clear();
    promptDepth = 0;
    activity = ctx.isIdle() ? 'idle' : 'model';
    const sessionId = ctx.sessionManager.getSessionId();
    ctx.ui.setHeader(tui => ({
      render(width) {
        if (width <= 0) return [];
        const theme = ctx.ui.theme;
        const { base } = composerColors(sessionId, theme.appearance, 'idle');
        const lines = headerLayout(width, tui.terminal.rows);
        return lines.map((line, i) => lines.length > 1 && i === lines.length - 1
          ? theme.fg('muted', line)
          : theme.style(line, { fg: base }));
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
      private profileStatus: Parameters<CustomEditor['setWorkingStatusIndicator']>[0];
      private identityColumns = 0;
      override setWorkingStatusIndicator(indicator: Parameters<CustomEditor['setWorkingStatusIndicator']>[0]) {
        super.setWorkingStatusIndicator(indicator);
        this.profileStatus = indicator;
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
        const usage = active?.getContextUsage();
        const model = active?.model?.name || active?.model?.id || 'no model';
        const location = formatWorkingDirectory(ctx.cwd);
        const percent = usage?.percent == null ? '0%' : `${Math.round(usage.percent)}%`;
        const title = pi.getSessionName();
        const details = `${percent} · ${pi.getThinkingLevel()}${title ? ` · ${title}` : ''}${hiddenLines ? ` · ↑${hiddenLines}` : ''}`;
        const status = this.profileStatus
          ? this.profileStatus.kind === 'working'
            // The host colours this with the thinking level; the composer owns its visible colour.
            ? stripTerminalSequences(this.profileStatus.renderSpinnerInBorder(1))
            : this.profileStatus.renderInBorder(Math.max(1, Math.floor(width / 2)))
          : '◉';
        const label = ` ${status} ${model}  ›  ▰ ${location}${branch ? `  ⎇ ${branch}` : ''} `;
        this.identityColumns = Math.max(0, Math.min(width - 2, visibleWidth(`   ${status} ${model}`)));
        return fitBoxBorder(label, ` ${details} `, width);
      }
      protected override renderBottomBorder(width: number, hiddenLines: number) {
        if (width <= 0) return '';
        if (width === 1) return '╰';
        const label = hiddenLines ? ` ↓${hiddenLines} ` : '';
        const text = truncateToWidth(label, Math.max(0, width - 2), '');
        return `╰${'─'.repeat(Math.max(0, width - 2 - visibleWidth(text)))}${text}╯`;
      }
      override render(width: number) {
        const lines = super.render(width);
        if (width <= 0) return lines;
        // Native editor layout puts the composer first and autocomplete after its bottom border.
        const bottom = lines.findIndex(line => stripTerminalSequences(line).startsWith('╰'));
        if (bottom < 0) return lines;
        const theme = ctx.ui.theme;
        const state = composerActivity(activity, this.profileStatus, promptDepth, tools.size);
        const { base, target } = composerColors(sessionId, theme.appearance, state);
        const paint = (text: string, column: number, row: number) => {
          const across = Math.max(0, column - this.identityColumns) / Math.max(1, width - 1 - this.identityColumns);
          const amount = state === 'idle' ? 0 : (across + row / Math.max(1, bottom)) / 2;
          const color = amount === 0 ? base : amount === 1 ? target : mixColors(base, target, amount, 'srgb');
          return theme.style(text, { fg: color });
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
  });
}
