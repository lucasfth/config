import { shellTips } from "../catalog";

type Input = {
  /** Keywords, command, shortcut, or category to find. Omit or leave empty to browse all tips. */
  query?: string;
};

const words = (text: string) => text.match(/[\p{L}\p{N}]+/gu) ?? [];

const index = shellTips.map((tip) => {
  const result = {
    id: tip.id,
    title: tip.title,
    category: tip.category,
    description: tip.description,
    example: tip.example,
    shortcut: tip.shortcut,
    caution: tip.caution,
  };
  const text = Object.values(result)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return { result, text, words: new Set(words(text)) };
});

/** Search the configured shell cheat sheet. Read-only: no history access and no command execution. */
export default function searchCheatSheet({ query = "" }: Input) {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  const terms = words(normalized);
  const matches = index
    .filter((entry) =>
      terms.length
        ? terms.every((term) => entry.words.has(term))
        : !normalized || entry.text.includes(normalized),
    )
    .sort(
      (a, b) =>
        Number(b.text.includes(normalized)) -
        Number(a.text.includes(normalized)),
    )
    .map((entry) => entry.result);
  return { query, matches };
}
