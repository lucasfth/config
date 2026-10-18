import { Resvg } from "@resvg/resvg-js";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Image, colorToHex, getCapabilities, getImageDimensions, renderImage } from "@earendil-works/pi-tui";
import { transformXYCharts } from './xychart.ts';
import { fitMermaid } from './mermaid-fit.ts';

const MAX_SVG_BYTES = 128 * 1024;
const MAX_DIMENSION = 2048;
const MAX_PIXELS = 2_000_000;
const MAX_CHART_ROWS = 24;
const MAX_CHART_SERIES = 4;
const MAX_CHART_CELLS = 72;
const RASTER_CACHE_LIMIT = 16;
const TRANSFORM_CACHE_LIMIT = 16;
const MAX_CACHED_MARKDOWN_LENGTH = 128 * 1024;
const COLOR_TOKENS: Record<string, string> = {
  "--fg": "fg", "--foreground": "fg", "--bg": "bg", "--background": "bg",
  "--muted": "muted", "--border": "border", "--surface": "surface", "--accent": "accent",
  "--success": "success", "--warning": "warning", "--error": "error",
  "--c1": "c1", "--c2": "c2", "--c3": "c3", "--c4": "c4", "--c5": "c5", "--c6": "c6",
  "--c7": "c7", "--c8": "c8", "--c9": "c9", "--c10": "c10", "--c11": "c11", "--c12": "c12",
  "--c13": "c13", "--c14": "c14", "--c15": "c15", "--c16": "c16",
};
const transformCache = new Map<string, string>();
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const rasterCache = new Map<string, string>();

export type SvgThemeColors = Readonly<Record<string, string>>;
export interface SvgRenderOptions { widthCells: number; maxPixels?: number }

/** Expand only named theme vars and currentColor; everything external or active is rejected. */
export function prepareSvg(source: string, theme: SvgThemeColors = {}): string | undefined {
  if (Buffer.byteLength(source, "utf8") > MAX_SVG_BYTES || !/^\s*<svg\b/i.test(source)) return undefined;
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<script\b|<foreignObject\b|\bon[a-z]+\s*=|<image\b|<use\b|<iframe\b|<audio\b|<video\b/i.test(source)) return undefined;
  if (/\b(?:href|src)\s*=\s*(['"])(?!#)[\s\S]*?\1/i.test(source) || /url\(\s*(['"]?)(?!#)[^)]+\)/i.test(source)) return undefined;
  const open = /^\s*<svg\b([^>]*)>/i.exec(source);
  if (!open) return undefined;
  const attrs = open[1];
  const width = dimension(attrs, "width");
  const height = dimension(attrs, "height");
  const viewBox = /\bviewBox\s*=\s*(['"])([\d.eE+\- ,]+)\1/i.exec(attrs)?.[2].trim().split(/[\s,]+/).map(Number);
  const w = width ?? (viewBox?.length === 4 ? viewBox[2] : undefined);
  const h = height ?? (viewBox?.length === 4 ? viewBox[3] : undefined);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w! <= 0 || h! <= 0 || w! > MAX_DIMENSION || h! > MAX_DIMENSION || w! * h! > MAX_PIXELS) return undefined;
  const stack: string[] = [];
  const voidTags: Record<string, true> = { path: true, rect: true, circle: true, ellipse: true, line: true, polyline: true, polygon: true, stop: true };
  const tagPattern = /<\s*(\/)?\s*([A-Za-z][\w:.-]*)\b[^<>]*?(\/)?\s*>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    const between = source.slice(cursor, match.index);
    if (between.includes("<") || between.includes(">")) return undefined;
    cursor = tagPattern.lastIndex;
    const name = match[2].toLowerCase();
    if (match[1]) { if (stack.pop() !== name) return undefined; }
    else if (!match[3] && !voidTags[name]) stack.push(name);
  }
  if (source.slice(cursor).includes("<") || source.slice(cursor).includes(">") || stack.length || !/<\/svg>\s*$/i.test(source)) return undefined;
  const colorMap: Record<string, string> = { ...theme, fg: theme.fg ?? "#ffffff", bg: theme.bg ?? "#000000" };
  for (let i = 1; i <= 16; i++) colorMap[`c${i}`] = theme[`c${i}`] ?? "#ffffff";
  return source
    .replace(/currentColor/gi, colorMap.fg)
    .replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^()]*))?\s*\)/g, (_all, token: string, fallback?: string) => {
      const value = colorMap[COLOR_TOKENS[token] ?? ""];
      return value && /^#[\da-f]{3,8}$|^rgba?\([\d.,%\s]+\)$|^hsla?\([\d.,%\s]+\)$/i.test(value) ? value : fallback?.trim() ?? "none";
    });
}

function dimension(attrs: string, name: string): number | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(['"])([\\d.]+)(?:px)?\\1`, "i").exec(attrs);
  return match ? Number(match[2]) : undefined;
}

/** Rasterize safe SVGs synchronously for Pi's synchronous markdown transformer. */
export function safeRenderSvg(source: string, options: SvgRenderOptions, theme: SvgThemeColors = {}): string | undefined {
  const svg = prepareSvg(source, theme);
  if (!svg || !Number.isFinite(options.widthCells) || options.widthCells < 1) return undefined;
  const key = `${options.widthCells}:${svg}`;
  const cached = rasterCache.get(key);
  if (cached) { rasterCache.delete(key); rasterCache.set(key, cached); return cached; }
  try {
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: Math.min(MAX_DIMENSION, Math.floor(options.widthCells * 16)) }, font: { loadSystemFonts: false }, logLevel: "off" });
    if (resvg.width > MAX_DIMENSION || resvg.height > MAX_DIMENSION || resvg.width * resvg.height > (options.maxPixels ?? MAX_PIXELS)) return undefined;
    const png = resvg.render().asPng();
    if (png.byteLength > MAX_SVG_BYTES * 8) return undefined;
    const encoded = png.toString("base64");
    rasterCache.set(key, encoded);
    if (rasterCache.size > RASTER_CACHE_LIMIT) rasterCache.delete(rasterCache.keys().next().value!);
    return encoded;
  } catch { return undefined; }
}

interface ChartRow { label: string; values: number[] }
export function chartNumericTable(markdown: string, availableWidth: number): string | undefined {
  if (!Number.isFinite(availableWidth) || availableWidth < 12) return undefined;
  const lines = markdown.trim().split(/\r?\n/);
  if (lines.length < 4 || lines.length > MAX_CHART_ROWS + 2 || !/^\s*\|.*\|\s*$/.test(lines[0]) || !/^\s*\|.*\|\s*$/.test(lines[1])) return undefined;
  const split = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim().replace(/\\\|/g, "|"));
  const headers = split(lines[0]);
  const alignment = split(lines[1]);
  const data = lines.slice(2).filter((line) => /^\s*\|.*\|\s*$/.test(line));
  if (headers.length < 2 || headers.length > MAX_CHART_SERIES + 2 || alignment.length !== headers.length || alignment.some((cell) => !/^:?-{3,}:?$/.test(cell)) || data.length < 2 || data.length > MAX_CHART_ROWS) return undefined;
  const cells = data.map(split);
  if (cells.some((row) => row.length !== headers.length)) return undefined;
  const numericCell = (value: string) => { const raw = value.endsWith('%') ? value.slice(0, -1).trim() : value; return NUMBER.test(raw) && Number.isFinite(Number(raw)) ? Number(raw) : undefined; };
  const numericColumns = headers.slice(1).map((_header, index) => index + 1).filter(column => cells.every(row => numericCell(row[column]) !== undefined) && cells.every(row => row[column].endsWith('%') === cells[0][column].endsWith('%'))).slice(0, MAX_CHART_SERIES);
  if (!numericColumns.length) return undefined;
  const rows: ChartRow[] = cells.map(row => ({ label: row[0].slice(0, 24), values: numericColumns.map(column => numericCell(row[column])!) }));
  const min = Math.min(0, ...rows.flatMap((row) => row.values));
  const max = Math.max(0, ...rows.flatMap((row) => row.values));
  if (!Number.isFinite(max - min) || max === min) return undefined;
  const labelWidth = Math.min(16, Math.max(2, ...rows.map((row) => row.label.length)));
  const barWidth = Math.min(12, Math.floor((Math.min(MAX_CHART_CELLS, Math.floor(availableWidth)) - labelWidth - 3) / numericColumns.length));
  if (barWidth < 2) return undefined;
  const glyphs = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
  const rendered = rows.map((row) => {
    const bars = row.values.map((value) => {
      const amount = Math.abs(value) / Math.max(Math.abs(min), Math.abs(max)) * barWidth * 8;
      const full = Math.floor(amount / 8);
      const partial = Math.min(7, Math.floor(amount % 8));
      const bar = "█".repeat(Math.min(barWidth, full)) + (full < barWidth && partial ? glyphs[partial - 1] : "");
      return `${value < 0 ? "−" : " "}${bar}`.padEnd(barWidth + 1);
    });
    return `${row.label.slice(0, labelWidth).padStart(labelWidth)} ${bars.join(" ").trimEnd()}`;
  }).join('\n');
  return numericColumns.length > 1 ? numericColumns.map((column, index) => `${index + 1}: ${headers[column]}`).join(' · ') + '\n' + rendered : rendered;
}

function extractSvg(markdown: string): { before: string; svg: string; after: string } | undefined {
  const regex = /(^|\n)( {0,3})```svg\s*\n([\s\S]*?)\n\2```(?=\n|$)/i;
  const match = regex.exec(markdown);
  if (!match) return undefined;
  const start = match.index + match[1].length;
  return { before: markdown.slice(0, start), svg: match[3], after: markdown.slice(match.index + match[0].length) };
}

export default function visualsExtension(pi: ExtensionAPI) {
  let currentTheme: Theme | undefined;
  pi.on("session_start", (_event, ctx) => { currentTheme = ctx.ui.theme; });
  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType !== "assistant" || context.isStreaming) return markdown;
    const width = context.availableWidth;
    const colors = currentTheme ? themeColors(currentTheme) : {};
    const capabilities = getCapabilities();
    const key = markdown.length <= MAX_CACHED_MARKDOWN_LENGTH
      ? `${width}\0${capabilities.images || 'none'}\0${JSON.stringify(colors)}\0${markdown}`
      : undefined;
    if (key !== undefined) {
      const cached = transformCache.get(key);
      if (cached !== undefined) {
        transformCache.delete(key);
        transformCache.set(key, cached);
        return cached;
      }
    }
    let display = fitMermaid(transformXYCharts(markdown, width), width);
    const fenced = extractSvg(display);
    if (fenced) {
      const svg = prepareSvg(fenced.svg);
      if (svg) {
        const widthCells = Math.max(1, Math.min(80, width));
        const raster = safeRenderSvg(fenced.svg, { widthCells }, colors);
        if (raster && capabilities.images) {
          const dims = getImageDimensions(raster, "image/png");
          const image = dims && renderImage(raster, dims, { maxWidthCells: widthCells });
          if (image) display = `${fenced.before}${image.sequence}${fenced.after}`;
        } else display = `${fenced.before}[SVG: ${svgDimensions(svg) ?? "safe vector"} — inline terminal images unavailable]${fenced.after}`;
      } else display = `${fenced.before}[SVG omitted: invalid or unsafe SVG]${fenced.after}`;
    }
    const tableMatch = /(?:^|\n)((?:\|[^\n]*\|\s*\n){2,}\|[^\n]*\|?)(?=\n|$)/.exec(display);
    if (tableMatch) {
      const chart = chartNumericTable(tableMatch[1].trim(), width);
      if (chart) display = `${display.slice(0, tableMatch.index + tableMatch[0].length)}\n\n${chart}${display.slice(tableMatch.index + tableMatch[0].length)}`;
    }
    if (key !== undefined) {
      transformCache.set(key, display);
      if (transformCache.size > TRANSFORM_CACHE_LIMIT) transformCache.delete(transformCache.keys().next().value!);
    }
    return display;
  });

  pi.registerCommand("visuals", {
    description: "Show native visual rendering status or deterministic SVG demo",
    getArgumentCompletions: () => [{ value: "status", label: "status", description: "Show native image/Mermaid support" }, { value: "demo", label: "demo", description: "Render a deterministic SVG sample" }],
    handler: async (args, ctx) => {
      const action = args.trim() || "status";
      if (action === "status") {
        ctx.ui.setWidget("visuals-demo", undefined);
        ctx.ui.notify(`Images: ${getCapabilities().images ? "available" : "unavailable"}; Mermaid and LaTeX are native markdown settings.`, "info");
        return;
      }
      if (action !== "demo") { ctx.ui.notify("Usage: /visuals [status|demo]", "warning"); return; }
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96"><rect width="320" height="96" rx="12" fill="var(--bg)"/><path d="M24 72 L96 56 L168 64 L240 24 L296 40" fill="none" stroke="var(--c1)" stroke-width="5"/><circle cx="240" cy="24" r="7" fill="currentColor"/></svg>';
      const png = safeRenderSvg(svg, { widthCells: 72 }, themeColors(ctx.ui.theme));
      const dims = png && getImageDimensions(png, "image/png");
      if (png && dims && getCapabilities().images) {
        ctx.ui.setWidget("visuals-demo", (_tui, theme) => new Image(png, "image/png", { fallbackColor: (text) => theme.fg("muted", text) }, { maxWidthCells: 72 }), { placement: "aboveEditor" });
        ctx.ui.notify("Native SVG preview shown above the editor.", "info");
      } else ctx.ui.notify("SVG sample rasterized, but native inline image placement is unavailable.", "warning");
    },
  });
}

function themeColors(theme: Theme): SvgThemeColors {
  const colors: Record<string, string> = {};
  const tokens: Record<string, keyof typeof theme.colors> = {
    fg: "text", bg: "userMessageBg", surface: "toolSuccessBg", muted: "muted", border: "border", accent: "accent",
    success: "success", warning: "warning", error: "error", c1: "accent", c2: "success", c3: "warning", c4: "error", c5: "borderAccent", c6: "muted",
  };
  for (const [name, token] of Object.entries(tokens)) colors[name] = colorToHex(theme.colors[token]);
  return colors;
}
function svgDimensions(svg: string): string | undefined {
  const attrs = /^\s*<svg\b([^>]*)>/i.exec(svg)?.[1] ?? "";
  const width = dimension(attrs, "width");
  const height = dimension(attrs, "height");
  return width && height ? `${width}×${height}` : undefined;
}
