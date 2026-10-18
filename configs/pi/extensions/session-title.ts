import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, stripTerminalSequences } from '@earendil-works/pi-tui';

export function topicTitle(text: string): string | undefined {
  const clean = stripTerminalSequences(text.replace(/<skill\b[\s\S]*?<\/skill>/gi, '')).replace(/\s+/g, ' ').trim();
  if (!clean || clean.startsWith('/') || /^(?:hi|hey|hello|thanks|thank you)[!.?]*$/i.test(clean)) return undefined;
  return stripTerminalSequences(truncateToWidth(clean, 48, '…'));
}

export function installSessionTitles(pi: ExtensionAPI): void {
  pi.on('message_start', event => {
    if (event.message.role !== 'user' || pi.getSessionName()) return;
    const content = event.message.content;
    const text = typeof content === 'string' ? content : content.filter(part => part.type === 'text').map(part => part.text).join(' ');
    const title = topicTitle(text);
    if (title) pi.setSessionName(title);
  });
}
