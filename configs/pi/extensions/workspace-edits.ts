import { lstat, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export type TextEdit = { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string };
export type WorkspaceEdit = {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<{ textDocument: { uri: string }; edits: TextEdit[] } | { kind: string }>;
};
type Prepared = { filename: string; before: Buffer; after: Buffer; temp: string; mode: number; mtimeMs: number; dev: number; ino: number };

export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const indexed = edits.map((edit) => {
    const start = positionOffset(lines, starts, edit.range.start);
    const end = positionOffset(lines, starts, edit.range.end);
    if (end < start) throw new Error("WorkspaceEdit range ends before it starts.");
    return { start, end, text: edit.newText };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < indexed.length; i++) {
    if (indexed[i].start < indexed[i - 1].end || (indexed[i].start === indexed[i - 1].start && indexed[i].end === indexed[i - 1].end)) {
      throw new Error("WorkspaceEdit contains overlapping edits.");
    }
  }
  for (let i = indexed.length - 1; i >= 0; i--) {
    const edit = indexed[i];
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}

function positionOffset(lines: string[], starts: number[], position: { line: number; character: number }): number {
  const line = lines[position.line];
  const logicalLength = typeof line === 'string' ? line.length - (line.endsWith('\r') ? 1 : 0) : -1;
  if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.line >= lines.length || position.character < 0 || position.character > logicalLength) {
    throw new Error("WorkspaceEdit position is outside the file bounds.");
  }
  return starts[position.line] + position.character;
}

export async function applyWorkspaceEdit(root: string, edit: WorkspaceEdit): Promise<string[]> {
  const grouped = new Map<string, TextEdit[]>();
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) grouped.set(uri, [...edits]);
  for (const change of edit.documentChanges ?? []) {
    if (!('textDocument' in change)) throw new Error(`Unsupported destructive workspace operation: ${change.kind}.`);
    grouped.set(change.textDocument.uri, [...(grouped.get(change.textDocument.uri) ?? []), ...change.edits]);
  }
  if (grouped.size === 0) return [];
  const canonicalRoot = await realpath(root);
  const prepared: Prepared[] = [];
  try {
    for (const [uri, edits] of grouped) {
      const filename = decodeFileUri(uri);
      const absolute = path.resolve(filename);
      if (!inside(path.resolve(root), absolute) && !inside(canonicalRoot, absolute)) throw new Error(`Refusing WorkspaceEdit outside project: ${filename}`);
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing non-regular file: ${filename}`);
      const canonicalFile = await realpath(absolute);
      if (!inside(canonicalRoot, canonicalFile)) throw new Error(`Refusing symlink outside project: ${filename}`);
      const before = await readFile(absolute);
      const source = before.toString("utf8");
      if (!Buffer.from(source, "utf8").equals(before)) throw new Error(`Refusing non-UTF-8 file: ${filename}`);
      const after = Buffer.from(applyTextEdits(source, edits), "utf8");
      const temp = path.join(path.dirname(absolute), `.${path.basename(absolute)}.lsp-${randomUUID()}`);
      await writeFile(temp, after, { mode: stat.mode, flag: "wx" });
      prepared.push({ filename: absolute, before, after, temp, mode: stat.mode, mtimeMs: stat.mtimeMs, dev: stat.dev, ino: stat.ino });
    }
    for (const item of prepared) {
      const current = await lstat(item.filename);
      const currentBytes = await readFile(item.filename);
      if (current.isSymbolicLink() || current.dev !== item.dev || current.ino !== item.ino || current.mtimeMs !== item.mtimeMs || !currentBytes.equals(item.before)) {
        throw new Error(`Refusing stale WorkspaceEdit; file changed during preparation: ${item.filename}`);
      }
    }
    const committed: Prepared[] = [];
    try {
      for (const item of prepared) { await rename(item.temp, item.filename); committed.push(item); }
    } catch (error) {
      for (const item of committed.reverse()) {
        const rollback = `${item.filename}.lsp-rollback-${process.pid}`;
        await writeFile(rollback, item.before, { mode: 0o600 });
        await rename(rollback, item.filename);
      }
      throw error;
    }
    return prepared.map((item) => item.filename);
  } finally {
    await Promise.all(prepared.map(({ temp }) => rm(temp, { force: true })));
  }
}

function decodeFileUri(uri: string): string {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { throw new Error(`Invalid workspace document URI: ${uri}`); }
  if (parsed.protocol !== "file:") throw new Error(`Unsupported workspace document URI scheme: ${parsed.protocol}`);
  return decodeURIComponent(parsed.pathname);
}
function inside(root: string, target: string): boolean { const relative = path.relative(root, target); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
