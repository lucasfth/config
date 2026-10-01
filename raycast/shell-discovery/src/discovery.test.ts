import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellTips } from "./catalog";
import { localDateKey, readHistoryUsage, selectDailyTip } from "./discovery";

const tips = [
  {
    id: "first",
    title: "First",
    category: "test",
    description: "",
    example: "",
  },
  {
    id: "second",
    title: "Second",
    category: "test",
    description: "",
    example: "",
  },
  {
    id: "third",
    title: "Third",
    category: "test",
    description: "",
    example: "",
  },
] as const;

describe("selectDailyTip", () => {
  test("prioritizes tips with the lowest recent frequency", () => {
    const selected = selectDailyTip(
      tips,
      ["third"],
      { first: 2, second: 0 },
      "2026-10-01",
    );
    expect(selected?.id).toBe("second");
  });

  test("prefers rare use over frequent use after unused tips are learned", () => {
    expect(
      selectDailyTip(
        tips,
        ["third"],
        { first: 2, second: 8, third: 0 },
        "2026-10-01",
      )?.id,
    ).toBe("first");
  });

  test("is stable for a day and rotates across date keys", () => {
    const first = selectDailyTip(tips, [], {}, "2026-10-01");
    const sameDay = selectDailyTip(tips, [], {}, "2026-10-01");
    const otherDay = selectDailyTip(tips, [], {}, "2026-10-02");
    expect(first?.id).toBe(sameDay?.id);
    expect(otherDay?.id).not.toBe(first?.id);
  });

  test("avoids the previous tip when alternatives exist", () => {
    const selected = selectDailyTip(tips, [], {}, "2026-10-01", "first");
    expect(selected?.id).not.toBe("first");
  });

  test("returns undefined after every tip is learned", () => {
    expect(
      selectDailyTip(tips, ["first", "second", "third"], {}, "2026-10-01"),
    ).toBeUndefined();
  });

  test("changes after the selected tip becomes learned", () => {
    const first = selectDailyTip(tips, [], {}, "2026-10-01");
    const next = selectDailyTip(
      tips,
      first ? [first.id] : [],
      {},
      "2026-10-01",
      first?.id,
    );
    expect(next?.id).not.toBe(first?.id);
  });

  test("unknown counts rank as unseen and learned tips are excluded", () => {
    const selected = selectDailyTip(
      tips,
      ["first"],
      { second: 4 },
      "2026-10-01",
    );
    expect(selected?.id).toBe("third");
  });
});

describe("localDateKey", () => {
  test("uses the local calendar date rather than UTC date", () => {
    const date = new Date(2026, 9, 1, 0, 15);
    expect(localDateKey(date)).toBe("2026-10-01");
  });
});

describe("readHistoryUsage", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "shell-discovery-"));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("recognizes normal, extended, and multiline history without exposing commands", async () => {
    const path = join(directory, "history");
    await writeFile(
      path,
      [
        "echo zmv should not count",
        "zmv -n '(*).log' '$1.txt'",
        ": 1727770000:0;z ~/projects",
        "echo continued \\",
        " zmv is only an argument",
        "zoxide \\",
        " query",
      ].join("\n"),
    );
    const result = await readHistoryUsage(path, [
      shellTips.find((tip) => tip.id === "zmv")!,
      shellTips.find((tip) => tip.id === "zoxide")!,
    ]);
    expect(result.counts).toEqual({ zmv: 1, zoxide: 1 });
    expect(result.status).not.toContain("zmv");
    expect(result.status).not.toContain("z ~/projects");
  });

  test("handles missing files with a visible status and no matches", async () => {
    const result = await readHistoryUsage(
      join(directory, "missing"),
      shellTips,
    );
    expect(result.counts).toEqual({});
    expect(result.status.toLowerCase()).toContain("unavailable");
  });
  test("ignores malformed metadata while preserving valid entries", async () => {
    const path = join(directory, "malformed-history");
    await writeFile(
      path,
      ": not zsh metadata; echo ignored\n: 1727770000:0;zmv -n '*.log' '$1.txt'\n",
    );
    const result = await readHistoryUsage(path, [
      shellTips.find((tip) => tip.id === "zmv")!,
    ]);
    expect(result.counts).toEqual({ zmv: 1 });
    expect(Object.keys(result).sort()).toEqual(["counts", "status"]);
    expect(JSON.stringify(result)).not.toContain("zmv -n");
  });

  test("reads only a bounded recent tail", async () => {
    const path = join(directory, "large-history");
    await writeFile(
      path,
      `zmv -n '*.log' '$1.txt'\n${"echo filler\n".repeat(30_000)}`,
    );
    const result = await readHistoryUsage(path, [
      shellTips.find((tip) => tip.id === "zmv")!,
    ]);
    expect(result.counts).toEqual({ zmv: 0 });
  });
  test("counts each matching history entry once, including compound commands", async () => {
    const path = join(directory, "frequency-history");
    await writeFile(
      path,
      "zmv -n '*.log' '$1.txt'; zmv -n '*.txt' '$1.log'\n" +
        "echo unrelated\n" +
        ": 1727770000:0;zmv -n '*.log' '$1.txt'\n",
    );
    const result = await readHistoryUsage(path, [
      shellTips.find((tip) => tip.id === "zmv")!,
    ]);
    expect(result.counts).toEqual({ zmv: 2 });
  });

  test("refreshes counts after new history entries are saved", async () => {
    const path = join(directory, "changing-history");
    const trackedTips = shellTips.filter((tip) => tip.id === "zmv");
    await writeFile(path, "zmv -n '*.log' '$1.txt'\n");
    expect((await readHistoryUsage(path, trackedTips)).counts.zmv).toBe(1);
    await writeFile(path, "zmv -n '*.log' '$1.txt'\nzmv -n '*.csv' '$1.tsv'\n");
    expect((await readHistoryUsage(path, trackedTips)).counts.zmv).toBe(2);
  });

  test("recognizes named directories and suffix aliases only at command positions", async () => {
    const path = join(directory, "aliases");
    await writeFile(
      path,
      "echo ~config should not count\n~config/settings.nix\nREADME.md\n",
    );
    const selectedTips = shellTips.filter((tip) =>
      ["named-directories", "suffix-aliases"].includes(tip.id),
    );
    const result = await readHistoryUsage(path, selectedTips);
    expect(result.counts).toEqual({
      "named-directories": 1,
      "suffix-aliases": 2,
    });
  });
});
