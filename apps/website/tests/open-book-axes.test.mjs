// The Live market view's scales (review 2026-10-26 item 4): price gridlines at round steps, the mid tag with its
// exact half tick, and time gridlines counted back from now.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { axisPriceTicks, axisTimeTicks, formatAgo, formatAxisPrice, MAX_LEVELS, N_SIG_FIGS } from "../src/scripts/open-book.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("price ticks fall on a 1, 2, 2.5 or 5 step inside the range, never more than asked", () => {
	assert.deepEqual(axisPriceTicks(79650.3, 79690.1, 6), { values: [79660, 79670, 79680, 79690], decimals: 0 });
	assert.deepEqual(axisPriceTicks(79600, 79700, 4), { values: [79600, 79625, 79650, 79675, 79700], decimals: 0 });
	assert.deepEqual(axisPriceTicks(1.2345, 1.2389, 4), { values: [1.236, 1.238], decimals: 3 });
	assert.deepEqual(axisPriceTicks(10, 10, 4), { values: [], decimals: 0 }, "an empty range draws no scale");
	for (const [min, max, count] of [
		[0.00012, 0.000135, 5],
		[3.1, 3.9, 4],
		[80_000, 81_250, 6],
	]) {
		const { values } = axisPriceTicks(min, max, count);
		assert.ok(values.length >= 1 && values.length <= count + 1, `${min}–${max}: ${values.length} ticks`);
		for (const value of values) assert.ok(value >= min && value <= max);
	}
});

test("axis prices group thousands and keep the mid's half tick", () => {
	assert.equal(formatAxisPrice(79660, 0), "79,660");
	assert.equal(formatAxisPrice("79666.5", 0, true), "79,666.5");
	assert.equal(formatAxisPrice(1.235, 4), "1.2350");
	assert.equal(formatAxisPrice(1_234_567.25, 2), "1,234,567.25");
});

test("time ticks count back from now at a readable step", () => {
	assert.deepEqual(axisTimeTicks(120_000, 6).offsets, [0, 30_000, 60_000, 90_000, 120_000]);
	assert.deepEqual(axisTimeTicks(60_000, 4).offsets, [0, 15_000, 30_000, 45_000, 60_000]);
	assert.deepEqual(axisTimeTicks(9_000, 4).offsets, [0, 5_000]);
	assert.deepEqual([0, 15_000, 60_000, 90_000, 120_000].map(formatAgo), ["now", "−15 s", "−1 min", "−1.5 min", "−2 min"]);
});

test("the legend states the feed's limits from the same constants the socket subscribes with", () => {
	const component = readFileSync(resolve(WEBSITE_ROOT, "src/components/OpenBook.astro"), "utf8");
	assert.equal(MAX_LEVELS, 20);
	assert.equal(N_SIG_FIGS, 5);
	assert.match(component, /Up to \{MAX_LEVELS\} aggregated levels per side,\s+\{SIG_FIGS\} significant figures\./);
	assert.match(component, /\{coin\} only; depth varies by market and orders can be cancelled\./);
	assert.match(component, /\{coin\} order-book activity/);
	assert.match(component, /brighter = more size, relative to the largest level in view/);
});
