import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { fitBoxBorder, formatWorkingDirectory } from './presentation.ts';

test("box borders stay within narrow terminal widths", () => {
  for (let width = 0; width <= 12; width++) {
    const line = fitBoxBorder("Huginn · Pi", "gpt-6.1-sol · high", width);
    assert.equal(visibleWidth(line), width);
  }
  assert.equal(fitBoxBorder("title", "model", 1), "╭");
  assert.equal(fitBoxBorder("title", "model", 2), "╭╮");
});


test("working directory abbreviates home and preserves other absolute paths", () => {
  assert.equal(formatWorkingDirectory("/Users/lucas/project", "/Users/lucas"), "~/project");
  assert.equal(formatWorkingDirectory("/work/project", "/Users/lucas"), "/work/project");
  assert.equal(formatWorkingDirectory("/Users/lucas-other/project", "/Users/lucas"), "/Users/lucas-other/project");
});

test("grapheme-aware truncation handles emoji and combining sequences", () => {
  const line = fitBoxBorder("👩🏽‍💻 cafe\u0301", "model", 12);
  assert.equal(visibleWidth(line), 12);
  assert.ok(!line.includes("�"));
});
