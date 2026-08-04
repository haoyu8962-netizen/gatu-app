import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	balancesTableActionClass,
	balancesTableCellClass,
	balancesTableGroupCellClass,
	balancesTableHeadClass,
	balancesTableHeaderClass,
	balancesToolbarClass,
} from "@/components/trade/positions/balances-table-styles";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const BALANCES_TAB_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/positions/balances-tab.tsx"),
	"utf8",
);
const POSITIONS_PANEL_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/positions/positions-panel.tsx"),
	"utf8",
);

describe("balances table visual contract", () => {
	it("uses a compact, flat hierarchy without structural status colors", () => {
		expect(balancesToolbarClass).toContain("h-6");
		expect(balancesTableHeaderClass).toContain("bg-transparent");
		expect(balancesTableHeadClass).toContain("h-6");
		expect(balancesTableHeadClass).toContain("font-normal");
		expect(balancesTableHeadClass).toContain("normal-case");
		expect(balancesTableCellClass).toContain("h-7");
		expect(balancesTableGroupCellClass).toContain("text-fg-muted");
		expect(balancesTableGroupCellClass).not.toMatch(/text-(brand|warning)|bg-(brand|warning)/);
	});

	it("keeps action feedback accessible while reducing its default emphasis", () => {
		expect(balancesTableActionClass).toContain("text-fg-muted");
		expect(balancesTableActionClass).toContain("hover:text-brand");
		expect(BALANCES_TAB_SOURCE.match(/variant="ghost"/g)).toHaveLength(3);
		expect(BALANCES_TAB_SOURCE.match(/onClick=\{\(\) => handleTransferClick\(row\)\}/g)).toHaveLength(1);
		expect(BALANCES_TAB_SOURCE.match(/onClick=\{\(\) => openSwapModal\(row\.asset\)\}/g)).toHaveLength(1);
		expect(BALANCES_TAB_SOURCE.match(/onClick=\{\(\) => handleSendClick\(row\)\}/g)).toHaveLength(1);
	});

	it("keeps the positions toolbar dense and removes inherited tab-panel padding", () => {
		expect(POSITIONS_PANEL_SOURCE).toContain('size="xs"');
		expect(POSITIONS_PANEL_SOURCE).toContain("flex h-[45px] shrink-0");
		expect(POSITIONS_PANEL_SOURCE).toContain("flex-col pt-0");
	});
});
