import { render } from 'grok-mermaid';

/** Reflow over-wide horizontal flowcharts vertically; preserve every node/edge. */
export function fitMermaid(markdown: string, width: number): string {
  return markdown.replace(/```mermaid\s*\n([\s\S]*?)\n```/gi, (fence, source: string) => {
    if (/^\s*xychart(?:-beta)?\b/i.test(source)) return fence;
    if (!/^\s*(?:flowchart|graph)\s+(?:LR|RL)\b/.test(source)) return fence;
    const original = render(source);
    if (!original || original.warnings.length || original.width <= width) return fence;
    const vertical = render(source.replace(/^(\s*(?:flowchart|graph)\s+)(?:LR|RL)\b/, '$1TD'));
    if (!vertical || vertical.warnings.length || vertical.width > width) return fence;
    return vertical.plain.map(line => '`' + line.replaceAll('`', "'") + '`').join('  \n') + '\n';
  });
}
