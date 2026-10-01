import { open } from "node:fs/promises";
import { homedir } from "node:os";
import type { ShellTip } from "./catalog";

const MAX_HISTORY_BYTES = 256 * 1024;
const MAX_HISTORY_ENTRIES = 10_000;

export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return `${homedir()}${path.slice(1)}`;
  return path;
}

async function readRecentHistory(path: string): Promise<string> {
  const file = await open(expandTilde(path), "r");
  try {
    const size = (await file.stat()).size;
    const length = Math.min(size, MAX_HISTORY_BYTES);
    const offset = size - length;
    const buffer = Buffer.alloc(length);
    let position = 0;
    while (position < length) {
      const result = await file.read(
        buffer,
        position,
        length - position,
        offset + position,
      );
      if (result.bytesRead === 0) break;
      position += result.bytesRead;
    }
    let text = buffer.subarray(0, position).toString("utf8");
    if (offset > 0) {
      const newline = text.indexOf("\n");
      text = newline === -1 ? "" : text.slice(newline + 1);
    }
    return text;
  } finally {
    await file.close();
  }
}

function hasUnclosedQuote(command: string): boolean {
  let single = false;
  let double = false;
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && !single) {
      escaped = true;
      continue;
    }
    if (character === "'" && !double) single = !single;
    if (character === '"' && !single) double = !double;
  }
  return single || double;
}

function needsContinuation(command: string): boolean {
  const trimmed = command.trimEnd();
  return (
    trimmed.endsWith("\\") ||
    hasUnclosedQuote(command) ||
    /(?:\|\||&&|\||[<>])$/.test(trimmed)
  );
}

function parseHistory(text: string): string[] {
  const entries: string[] = [];
  let current = "";
  let extended = false;

  const flush = (): void => {
    if (current.trim()) entries.push(current);
    current = "";
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const metadata = /^:\s*\d+:\d+;(.*)$/.exec(line);
    if (metadata) {
      flush();
      current = metadata[1] ?? "";
      extended = true;
      continue;
    }

    if (!current) {
      current = line;
      extended = false;
      continue;
    }

    if (extended || needsContinuation(current)) {
      current += `\n${line}`;
    } else {
      flush();
      current = line;
      extended = false;
    }
  }
  flush();
  return entries.slice(-MAX_HISTORY_ENTRIES);
}

function commandSegments(command: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (
      (character === "'" || character === '"') &&
      (!quote || quote === character)
    ) {
      quote = quote ? undefined : character;
      continue;
    }
    if (
      !quote &&
      (character === ";" ||
        character === "\n" ||
        character === "|" ||
        character === "&")
    ) {
      const segment = command.slice(start, index).trim();
      if (segment) segments.push(segment);
      if (character === "|" || character === "&") {
        while (command[index + 1] === character) index += 1;
      }
      start = index + 1;
    }
  }
  const finalSegment = command.slice(start).trim();
  if (finalSegment) segments.push(finalSegment);
  return segments;
}

function dateSeed(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (match) {
    const timestamp = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    if (Number.isFinite(timestamp)) return Math.floor(timestamp / 86_400_000);
  }
  let hash = 2_166_136_261;
  for (const character of dateKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function selectDailyTip(
  tips: readonly ShellTip[],
  learnedIds: readonly string[],
  counts: Readonly<Record<string, number>>,
  dateKey: string,
  previousId?: string,
): ShellTip | undefined {
  const learned = new Set(learnedIds);
  const unlearned = tips.filter((tip) => !learned.has(tip.id));
  if (unlearned.length === 0) return undefined;

  const minimum = Math.min(...unlearned.map((tip) => counts[tip.id] ?? 0));
  const prioritized = unlearned.filter(
    (tip) => (counts[tip.id] ?? 0) === minimum,
  );
  const candidates =
    previousId && prioritized.length > 1
      ? prioritized.filter((tip) => tip.id !== previousId)
      : prioritized;
  const pool = candidates.length > 0 ? candidates : prioritized;
  return pool[dateSeed(dateKey) % pool.length];
}
export async function readHistoryUsage(
  path: string,
  tips: readonly ShellTip[],
): Promise<{ counts: Record<string, number>; status: string }> {
  let text: string;
  try {
    text = await readRecentHistory(path);
  } catch {
    return {
      counts: {},
      status:
        "History unavailable: the local Zsh history file could not be read.",
    };
  }

  const tracked = tips
    .filter((tip) => tip.historyPattern)
    .map((tip) => ({
      id: tip.id,
      pattern: new RegExp(tip.historyPattern ?? ""),
    }));
  const counts: Record<string, number> = {};
  for (const tip of tracked) counts[tip.id] = 0;
  const entries = parseHistory(text);
  for (const entry of entries) {
    const commands = commandSegments(entry);
    for (const tip of tracked) {
      if (commands.some((command) => tip.pattern.test(command))) {
        counts[tip.id] = (counts[tip.id] ?? 0) + 1;
      }
    }
  }
  const matched = Object.values(counts).filter((count) => count > 0).length;
  const status =
    matched > 0
      ? `History scanned locally; ${matched} matching tip${matched === 1 ? "" : "s"} found.`
      : "History scanned locally; no matching tip usage found.";
  return { counts, status };
}
