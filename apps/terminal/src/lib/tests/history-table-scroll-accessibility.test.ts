import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HISTORY_TABLES = [
	{
		file: "src/components/historical-orders/historical-orders-page.tsx",
		label: "scrollableRegionLabel={t`Order history`}",
	},
	{
		file: "src/components/trade-history/trade-history-page.tsx",
		label: "scrollableRegionLabel={t`Trade history`}",
	},
	{
		file: "src/components/funding-history/funding-history-page.tsx",
		label: "scrollableRegionLabel={t`Funding payments`}",
	},
] as const;

describe("history table horizontal scrolling accessibility", () => {
	it.each(HISTORY_TABLES)("labels the opt-in keyboard scroll region in $file", ({ file, label }) => {
		const source = readFileSync(resolve(process.cwd(), file), "utf8");

		expect(source).toContain(label);
	});
});
