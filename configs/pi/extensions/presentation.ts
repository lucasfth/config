import { CustomEditor } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
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


export default function presentationExtension(pi: ExtensionAPI) {
  installToolFrames(pi);
  installSessionTitles(pi);
  let active: ExtensionContext | undefined;
  let working = false;
  let branch = '';
  let render: (() => void) | undefined;
  pi.on('model_select', () => render?.());
  pi.on('thinking_level_select', () => render?.());
  pi.on('session_info_changed', () => render?.());
  pi.on('agent_start', () => { working = true; render?.(); });
  pi.on('agent_settled', () => { working = false; render?.(); });
  pi.on('message_end', () => render?.());
  pi.on('session_shutdown', () => { active = undefined; render = undefined; });
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    active = ctx;
    ctx.ui.setHeader((_tui, theme) => ({
      render: width => [truncateToWidth(theme.fg('muted', 'Huginn · Pi   /model · /switch'), width)],
      invalidate() {},
    }));
    ctx.ui.setFooter((tui, _theme, footer) => {
      render = () => tui.requestRender();
      branch = footer.getGitBranch() ?? '';
      const unsubscribe = footer.onBranchChange(() => { branch = footer.getGitBranch() ?? ''; render?.(); });
      return { dispose: unsubscribe, invalidate() {}, render: () => [] };
    });
    class ProfileEditor extends CustomEditor {
      constructor(tui: TUI, theme: EditorTheme, keys: KeybindingsManager) {
        super(tui, theme, keys, { paddingX: 2, embedWorkingStatus: true });
      }
      protected override renderTopBorder(width: number, hiddenLines: number) {
        const theme = ctx.ui.theme;
        const usage = active?.getContextUsage();
        const model = active?.model?.name || active?.model?.id || 'no model';
        const location = formatWorkingDirectory(ctx.cwd);
        const percent = usage?.percent == null ? '0%' : `${Math.round(usage.percent)}%`;
        const title = pi.getSessionName();
        const details = `${percent} · ${pi.getThinkingLevel()}${title ? ` · ${title}` : ''}${working ? ' · working' : ''}${hiddenLines ? ` · ↑${hiddenLines}` : ''}`;
        const label = ` ◉ ${model}  ›  ▰ ${location}${branch ? `  ⎇ ${branch}` : ''} `;
        return theme.fg('border', fitBoxBorder(label, ` ${details} `, width));
      }
      protected override renderBottomBorder(width: number, hiddenLines: number) {
        if (width <= 0) return '';
        if (width === 1) return ctx.ui.theme.fg('border', '╰');
        const label = hiddenLines ? ` ↓${hiddenLines} ` : '';
        const text = truncateToWidth(label, Math.max(0, width - 2), '');
        return ctx.ui.theme.fg('border', `╰${'─'.repeat(Math.max(0, width - 2 - visibleWidth(text)))}${text}╯`);
      }
      override render(width: number) {
        const lines = super.render(width);
        let inComposer = false;
        for (let index = 0; index < lines.length; index++) {
          const plain = lines[index];
          if (plain.includes('╭')) { inComposer = true; continue; }
          if (plain.includes('╰')) { inComposer = false; continue; }
          if (inComposer && plain.startsWith(' ') && plain.endsWith(' ')) lines[index] = ctx.ui.theme.fg('border', '│') + plain.slice(1, -1) + ctx.ui.theme.fg('border', '│');
        }
        return lines;
      }
    }
    ctx.ui.setEditorComponent((tui, theme, keys) => new ProfileEditor(tui, theme, keys));
  });
}
