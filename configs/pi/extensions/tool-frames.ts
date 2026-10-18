import { Text, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { Component } from '@earendil-works/pi-tui';
import type { ExtensionAPI, Theme, ToolRenderers } from '@earendil-works/pi-coding-agent';

function rule(theme: Theme, width: number, left: string, label = '', right = '┤') {
  const title = truncateToWidth(label, Math.max(0, width - 4), '…');
  return theme.fg('borderMuted', left + title + '─'.repeat(Math.max(0, width - visibleWidth(left + title + right))) + right);
}

function rows(component: Component | undefined, width: number, theme: Theme, background: 'toolPendingBg' | 'toolSuccessBg' | 'toolErrorBg' = 'toolPendingBg') {
  if (!component) return [];
  return component.render(Math.max(1, width - 4)).map(line => {
    // Kitty/sixel image transport is not printable text and must never be clipped.
    if (line.includes('\x1b_G') || line.includes('\x1bP')) return line;
    const content = truncateToWidth(line, Math.max(0, width - 4), '…');
    return theme.bg(background, theme.fg('borderMuted', '│ ') + content + ' '.repeat(Math.max(0, width - 4 - visibleWidth(content))) + theme.fg('borderMuted', ' │'));
  });
}

export function installToolFrames(pi: ExtensionAPI) {
  pi.registerToolRenderer((name, next) => {
    const native = next();
    if (name === 'todo') return {
      renderShell: 'self',
      renderCall: () => new Text('', 0, 0),
      renderResult(result, _options, theme) {
        const tasks = result.content.filter(item => item.type === 'text').flatMap(item => item.text.split('\n')).flatMap(line => {
          const match = line.match(/^\[([ x])\]\s+[^:]+:\s*(.*)$/);
          return match ? [{ done: match[1] === 'x', text: match[2] }] : [];
        });
        const title = theme.fg('accent', '☷ Todo') + theme.fg('muted', ` ${tasks.length} tasks`);
        return new Text(tasks.length ? [title, ...tasks.map((task, index) => theme.fg('borderMuted', index === tasks.length - 1 ? '└─ ' : '├─ ') + (task.done ? theme.fg('success', '☑ ' + theme.strikethrough(task.text)) : '☐ ' + task.text))].join('\n') : title, 1, 0);
      },
    };
    // Keep self-framed interactive renderers (questions, diagrams, subagent panes).
    if (native?.renderShell === 'self') return native;
    const wrapped: ToolRenderers = {
      renderShell: 'self',
      renderCall(args, theme, context) {
        const values = args && typeof args === 'object' ? args as Record<string, unknown> : {};
        const call = native?.renderCall?.(args, theme, { ...context, lastComponent: context.state.ompNativeCall }) ?? new Text(
          name === 'bash' ? `$ ${String(values.command ?? '')}` : `${name} ${Object.entries(values).map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' ')}`, 0, 0,
        );
        context.state.ompNativeCall = call;
        return {
          invalidate: () => call.invalidate(),
          render(width) {
            if (width < 5) return call.render(width);
            return [rule(theme, width, '╭', '', '╮'), ...rows(call, width, theme)];
          },
        };
      },
      renderResult(result, options, theme, context) {
        const nativeResult = native?.renderResult?.(result, options, theme, { ...context, lastComponent: context.state.ompNativeResult });
        context.state.ompNativeResult = nativeResult;
        const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
        const fallback = new Text(options.expanded ? text : text.split('\n').slice(0, 12).join('\n') + (text.split('\n').length > 12 ? '\n… (Ctrl+O to expand)' : ''), 0, 0);
        const content = nativeResult ?? (text ? fallback : undefined);
        return {
          invalidate: () => content?.invalidate(),
          render(width) {
            if (width < 5) return content?.render(width) ?? [];
            const duration = nativeResult || context.durationMs == null ? '' : ` ${(context.durationMs / 1000).toFixed(2)}s`;
            const state = context.isError ? 'Error' : options.isPartial ? 'Running' : 'Output';
            return [rule(theme, width, '├', ` ${state} `), ...rows(content, width, theme, context.isError ? 'toolErrorBg' : 'toolSuccessBg'), rule(theme, width, '╰', duration ? ` Wall:${duration} ` : '', '╯')];
          },
        };
      },
    };
    return wrapped;
  });
}
