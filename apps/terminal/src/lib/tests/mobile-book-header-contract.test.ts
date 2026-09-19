import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-book-view.tsx"), "utf8");

describe("mobile order book header contract", () => {
	it("uses one 36px chip row with grouping on the left, spread in the middle and the unit dropdown on the right", () => {
		expect(SOURCE).toContain(
			'"flex min-h-9 shrink-0 items-center justify-between gap-2 border-b border-stroke-weak/60 bg-surface px-3"',
		);
		expect(SOURCE).toContain("triggerAriaLabel={t`Price grouping`}");
		expect(SOURCE).toContain("triggerAriaLabel={t`Display units`}");
		expect(SOURCE.match(/triggerClassName=\{(?:cn\()?MOBILE_FILTER_CHIP_CLASS/g)).toHaveLength(2);
		expect(SOURCE).toContain('data-slot="mobile-orderbook-spread"');
		expect(SOURCE).not.toContain("Toggle display units");
		expect(SOURCE).not.toContain("ArrowsLeftRightIcon");
	});

	it("keeps the split ladder headings aligned to their columns and names the current unit", () => {
		const headings = SOURCE.slice(
			SOURCE.indexOf('data-slot="split-orderbook-column-headings"'),
			SOURCE.indexOf("<fieldset", SOURCE.indexOf('data-slot="split-orderbook-column-headings"')),
		);
		expect(headings).toContain("grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px py-1.5");
		expect(headings).not.toContain("uppercase");
		expect(headings.match(/t`Total \(\$\{sizeToken\}\)`/g)).toHaveLength(2);
		expect(SOURCE).not.toContain(
			'<span>{t`Spread`}</span>\n\t\t\t\t\t<span className="tabular-nums">{spreadText}</span>\n\t\t\t\t</div>\n\t\t\t\t<div\n\t\t\t\t\tdata-slot="split-orderbook-column-headings"',
		);
	});
});
