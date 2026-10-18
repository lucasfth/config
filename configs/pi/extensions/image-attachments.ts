import { readFile } from 'node:fs/promises';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { detectSupportedImageMimeType } from '../node_modules/@earendil-works/pi-coding-agent/dist/utils/mime.js';


export default function imageAttachments(pi: ExtensionAPI): void {
  const registry = new Set<string>();
  const unsubscribe = pi.events.on('huginn:image-attachment', (path: unknown) => {
    if (typeof path === 'string') registry.add(path);
  });
  pi.on('input', async (event, ctx) => {
    if (event.source !== 'interactive') return;
    const paths = [...registry].filter(path => event.text.split(/\s+/).includes(path));
    if (!paths.length) return;
    try {
      const images = await Promise.all(paths.map(async path => {
        const bytes = await readFile(path);
        const mimeType = detectSupportedImageMimeType(bytes);
        if (!mimeType) throw new Error(`Unsupported image attachment: ${path}`);
        return { type: 'image' as const, mimeType, data: bytes.toString('base64') };
      }));
      for (const path of paths) registry.delete(path);
      return { action: 'transform' as const, text: event.text, images: [...(event.images ?? []), ...images] };
    } catch (error) {
      ctx.ui.setEditorText(event.text);
      ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      return { action: 'handled' as const };
    }
  });
  pi.on('session_shutdown', () => { registry.clear(); unsubscribe(); });
}
