import assert from 'node:assert/strict';
import test from 'node:test';
import { renderXYChart } from './xychart.ts';
const source='xychart-beta\n title "O(n²) – Quadratic Growth"\n x-axis "Input size (n)" [1, 2, 3, 4, 5]\n y-axis "Operations" 0 --> 25\n line [1, 4, 9, 16, 25]';
test('renders quadratic Mermaid XY values as a bounded graph',()=>{const chart=renderXYChart(source,70);assert.ok(chart);assert.match(chart,/Quadratic Growth/);assert.match(chart,/Operations/);assert.match(chart,/Input size/);assert.match(chart,/25/);assert.match(chart,/●/);assert.ok(!chart.includes('xychart-beta'));assert.ok(chart.split('\n').every(line=>line.length<=70));});
test('does not silently render malformed or mismatched chart data',()=>{assert.equal(renderXYChart(source.replace('[1, 4, 9, 16, 25]','[1, 4]'),70),undefined);assert.equal(renderXYChart(source.replace('25]','NaN]'),70),undefined);});
test('renders bars below and above zero without changing their sign',()=>{const chart=renderXYChart('xychart-beta\n x-axis [Loss, Gain]\n y-axis -10 --> 10\n bar [-10, 10]',60);assert.ok(chart);assert.match(chart,/█/);assert.match(chart,/-10/);assert.match(chart,/Loss/);assert.match(chart,/Gain/);});
