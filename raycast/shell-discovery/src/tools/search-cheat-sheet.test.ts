import { describe, expect, test } from "bun:test";
import searchCheatSheet from "./search-cheat-sheet";

describe("AI cheat-sheet search", () => {
  test("matches case-insensitive terms across category and tip content", () => {
    const result = searchCheatSheet({ query: "  KEYBINDING   ViM  " });
    expect(result.matches.map((tip) => tip.id)).toEqual(["edit-command-line"]);
  });

  test("finds a literal shortcut without matching individual letters inside words", () => {
    const result = searchCheatSheet({ query: "Ctrl+X Ctrl+Y" });
    expect(result.matches.map((tip) => tip.id)).toEqual(["copy-buffer"]);
  });

  test("requires every search term instead of returning unrelated partial matches", () => {
    expect(
      searchCheatSheet({ query: "vim nonexistent-command-xyz" }).matches,
    ).toEqual([]);
  });
});
