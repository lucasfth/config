import { truncateToWidth } from '@earendil-works/pi-tui';

/** Terminal XY subset: categorical/numeric x axis, numeric y range, line/bar series. */
export function renderXYChart(source: string, availableWidth: number): string | undefined {
  if (source.length > 16384 || availableWidth < 24 || !/^\s*xychart(?:-beta)?\s*\n/i.test(source)) return undefined;
  let title = '', xTitle = '', yTitle = '', labels: string[] = [];
  let range: [number, number] | undefined;
  const series: { kind: string; values: number[] }[] = [];
  const numeric = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  for (const raw of source.trim().split('\n').slice(1)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) continue;
    const heading = /^title\s+"([^"]*)"$/.exec(line);
    const x = /^x-axis(?:\s+"([^"]*)")?\s*\[([^\]]+)\]$/.exec(line);
    const y = new RegExp(`^y-axis(?:\\s+"([^"]*)")?\\s+(${numeric})\\s*(?:-->|→)\\s*(${numeric})$`).exec(line);
    const plot = /^(line|bar)\s*\[([^\]]+)\]$/.exec(line);
    if (heading) title = heading[1];
    else if (x) { xTitle = x[1] ?? ''; labels = x[2].split(',').map(value => value.trim().replace(/^"|"$/g, '')); }
    else if (y) { yTitle = y[1] ?? ''; range = [Number(y[2]), Number(y[3])]; }
    else if (plot) {
      const values = plot[2].split(',').map(value => value.trim());
      if (values.some(value => !new RegExp(`^${numeric}$`).test(value))) return undefined;
      series.push({ kind: plot[1], values: values.map(Number) });
    } else return undefined;
  }
  if (!series.length || series.length > 4 || !labels.length || labels.length > 24 || series.some(s => s.values.length !== labels.length)) return undefined;
  const values = series.flatMap(s => s.values);
  const [min, max] = range ?? [Math.min(0, ...values), Math.max(...values)];
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || values.some(value => value < min || value > max)) return undefined;
  const width = Math.min(64, Math.floor(availableWidth));
  const left = 7, height = 10, plotWidth = width - left - 2;
  const grid = Array.from({ length: height + 1 }, () => Array<string>(plotWidth).fill(' '));
  const glyphs = ['●', '◆', '■', '▲'];
  const point = (index: number, value: number) => ({ x: Math.round(index * (plotWidth - 1) / Math.max(1, labels.length - 1)), y: Math.round((max - value) / (max - min) * height) });
  series.forEach((s, n) => {
    let previous: { x: number; y: number } | undefined;
    s.values.forEach((value, index) => {
      const p = point(index, value);
      if (s.kind === 'bar') { const zero = point(index, Math.max(min, Math.min(max, 0))).y; for (let y = Math.min(p.y, zero); y <= Math.max(p.y, zero); y++) grid[y][p.x] = '█'; }
      else if (previous) for (let x = previous.x + 1; x < p.x; x++) { const y = Math.round(previous.y + (p.y - previous.y) * (x - previous.x) / (p.x - previous.x)); grid[y][x] = '·'; }
      grid[p.y][p.x] = glyphs[n]; previous = p;
    });
  });
  const rows = grid.map((row, index) => `${index % 2 === 0 ? Number((max - (max - min) * index / height).toPrecision(3)).toString().padStart(6) : '      '} │${row.join('')}`);
  const ticks = Array<string>(plotWidth + 5).fill(' ');
  labels.forEach((label, index) => { const shown = label.slice(0, 5); const x = Math.min(point(index, min).x, plotWidth - shown.length); for (let i = 0; i < shown.length; i++) ticks[x + i] = shown[i]; });
  return [title, yTitle, ...rows, '       └' + '─'.repeat(plotWidth), '        ' + ticks.join('').trimEnd(), xTitle].filter(Boolean).map(line => truncateToWidth(line, width, '…')).join('\n');
}

export function transformXYCharts(markdown: string, width: number): string {
  return markdown.replace(/```mermaid\s*\n(\s*xychart(?:-beta)?\b[\s\S]*?)\n```/gi, (fence, source: string) => {
    const rendered = renderXYChart(source, width);
    return rendered ? rendered.split('\n').map(line => '`' + line.replaceAll('`', "'") + '`').join('  \n') + '\n' : fence;
  });
}
