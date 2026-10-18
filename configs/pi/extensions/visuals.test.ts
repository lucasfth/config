import assert from "node:assert/strict";
import test from "node:test";
import { chartNumericTable, prepareSvg, safeRenderSvg } from "./visuals.ts";

test("rejects malformed, active and external SVG content", () => {
  assert.equal(prepareSvg("<svg><script>alert(1)</script></svg>"), undefined);
  assert.equal(prepareSvg('<svg><image href="https://example.com/x.png"/></svg>'), undefined);
  assert.equal(prepareSvg("not xml <svg>"), undefined);
  assert.equal(prepareSvg("<svg><foreignObject><p>bad</p></foreignObject></svg>"), undefined);
  assert.equal(prepareSvg('<svg width="1" height="1"><g></svg>'), undefined);
});

test("maps OMP theme tokens and currentColor to Pi colors", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="var(--c1)" stroke="currentColor"/></svg>';
  const prepared = prepareSvg(svg, { fg: "#eeeeee", c1: "#ff0000" });
  assert.ok(prepared?.includes('fill="#ff0000"'));
  assert.ok(prepared?.includes('stroke="#eeeeee"'));
});

test("bounds SVG source, dimensions, raster output and numeric chart widths", () => {
  assert.equal(prepareSvg(`<svg>${" ".repeat(256 * 1024)}</svg>`), undefined);
  const tooLarge = '<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"><rect width="10" height="10"/></svg>';
  assert.equal(safeRenderSvg(tooLarge, { widthCells: 10 }), undefined);
  const raster = safeRenderSvg('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="var(--c1)"/></svg>', { widthCells: 10 }, { c1: "#ff0000" });
  assert.ok(raster && Buffer.from(raster, "base64").byteLength < 128 * 1024);
  const table = "| Label | First | Second | Note |\n|---|---:|---:|---|\n| A | 1 | 4 | x |\n| B | 2 | 8 | x |";
  const chart = chartNumericTable(table, 40);
  assert.ok(chart?.includes("A") && chart.includes("B"));
  assert.equal(chartNumericTable("| Name | Note |\n|---|---|\n| a | x |", 40), undefined);
  assert.equal(chartNumericTable("| Label | A |\n|---|---:|\n| A | 0 |\n| B | 0 |", 40), undefined);
  assert.equal(chartNumericTable(table, 8), undefined);
});

test("numeric charts distinguish equal-magnitude negative and positive values", () => {
  const chart = chartNumericTable("| Label | Change |\n|---|---:|\n| Loss | -10 |\n| Gain | 10 |", 40);
  const rows = chart?.split('\n') ?? [];
  assert.match(rows[0], /Loss.*−/);
  assert.ok(!rows[1].includes('−'));
});
test('percentage columns render utilization bars with series labels', () => {
  const chart = chartNumericTable('| Host | CPU usage | RAM usage |\n|---|---:|---:|\n| Local | 24% | 68% |\n| Freyr | 81% | 54% |\n| Mimer | 63% | 79% |\n| Loki | 12% | 36% |', 80);
  assert.ok(chart);
  assert.match(chart, /CPU usage/);
  assert.match(chart, /RAM usage/);
  assert.match(chart, /Freyr.*█/);
});
