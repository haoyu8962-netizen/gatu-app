import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCROLLABLE_TABLES = [
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
	{
		file: "src/components/funding-comparison/funding-comparison-view.tsx",
		label: "scrollableRegionLabel={t`Funding comparison`}",
	},
	{
		file: "src/components/vaults/vaults-list.tsx",
		label: "scrollableRegionLabel={t`Vaults`}",
	},
	{
		file: "src/components/vaults/vault-detail-view.tsx",
		label: "scrollableRegionLabel={t`Vault depositors`}",
	},
] as const;

describe("wide table horizontal scrolling accessibility", () => {
	it.each(SCROLLABLE_TABLES)("labels the opt-in keyboard scroll region in $file", ({ file, label }) => {
		const source = readFileSync(resolve(process.cwd(), file), "utf8");

		expect(source).toContain(label);
	});
});
