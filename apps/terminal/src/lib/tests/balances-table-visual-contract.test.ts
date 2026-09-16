import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	balancesTableActionClass,
	balancesTableCellClass,
	balancesTableHeadClass,
	balancesTableHeaderClass,
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
const MOBILE_BALANCES_TAB_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-balances-tab.tsx"),
	"utf8",
);

describe("balances table visual contract", () => {
	it("matches the latest desktop header and row rhythm without a redundant summary", () => {
		expect(balancesTableHeaderClass).toContain("bg-modal");
		expect(balancesTableHeadClass).toContain("h-[33px]");
		expect(balancesTableHeadClass).toContain("text-[11px]");
		expect(balancesTableHeadClass).toContain("font-semibold");
		expect(balancesTableHeadClass).toContain("normal-case");
		expect(balancesTableCellClass).toContain("h-12");
		expect(balancesTableCellClass).toContain("text-[13px]");
		expect(BALANCES_TAB_SOURCE).not.toContain('data-testid="balances-summary-bar"');
		expect(MOBILE_BALANCES_TAB_SOURCE).not.toContain('data-testid="mobile-balances-summary-bar"');
		expect(BALANCES_TAB_SOURCE).toContain("DesktopTabToolbarPortal");
		expect(POSITIONS_PANEL_SOURCE).toContain(
			'<BalancesTab toolbarTarget={activeTab === "balances" ? toolbarTarget : null} />',
		);
	});

	it("uses a flat total-first asset hierarchy while preserving real funds actions", () => {
		expect(BALANCES_TAB_SOURCE).toContain("min-w-[52rem]");
		expect(balancesTableActionClass).toContain("rounded-[7px]");
		expect(balancesTableActionClass).toContain("border-market-close-stroke-input");
		expect(balancesTableActionClass).toContain("duration-[120ms]");
		expect(BALANCES_TAB_SOURCE).not.toContain("{t`PNL`}");
		expect(BALANCES_TAB_SOURCE).not.toContain("balancesTableGroupCellClass");
		expect(BALANCES_TAB_SOURCE).not.toContain("{t`Perpetuals`}");
		expect(BALANCES_TAB_SOURCE).not.toContain("t`Perps`");
		expect(BALANCES_TAB_SOURCE).toContain("showBalanceAccountType ? (");
		expect(BALANCES_TAB_SOURCE).toContain('row.type === "perp" ? t`Trading` : t`Spot`');
		expect(BALANCES_TAB_SOURCE).toContain("getBalanceRowDisplayAvailable(row)");
		expect(BALANCES_TAB_SOURCE).toContain("row.transferable");
		expect(BALANCES_TAB_SOURCE).toContain('row.type === "spot" || perpFundsActionsEnabled');
		expect(BALANCES_TAB_SOURCE).toContain("Balance available to trade");
		expect(BALANCES_TAB_SOURCE.indexOf("{t`Total`}")).toBeLessThan(BALANCES_TAB_SOURCE.indexOf("{t`Available`}"));
		expect(BALANCES_TAB_SOURCE.match(/onClick=\{\(\) => handleTransferClick\(row\)\}/g)).toHaveLength(1);
		expect(BALANCES_TAB_SOURCE.match(/onClick=\{\(\) => openSwapModal\(row\.asset\)\}/g)).toHaveLength(1);
		expect(BALANCES_TAB_SOURCE.match(/onClick=\{\(\) => handleSendClick\(row\)\}/g)).toHaveLength(1);
		expect(BALANCES_TAB_SOURCE).toContain('openDepositModal("withdraw")');
	});

	it("uses the mobile flat balance row while keeping a supported 44px transfer target", () => {
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain("min-h-[57px]");
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain("size-[26px]");
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain("min-h-11");
		expect(MOBILE_BALANCES_TAB_SOURCE).not.toContain("grid grid-cols-2 divide-x");
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain("useBalanceRows()");
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain("getBalanceRowDisplayAvailable(row)");
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain("row.transferable");
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain('row.type === "spot" || perpFundsActionsEnabled');
		expect(MOBILE_BALANCES_TAB_SOURCE).not.toContain("t`Perps`");
		expect(MOBILE_BALANCES_TAB_SOURCE).toContain('row.type === "perp" ? t`Trading` : t`Spot`');
	});

	it("keeps the positions toolbar dense and removes inherited tab-panel padding", () => {
		expect(POSITIONS_PANEL_SOURCE).toContain('size="xs"');
		expect(
			readFileSync(resolve(TEST_DIR, "../..", "components/trade/positions/account-table-header-view.tsx"), "utf8"),
		).toContain("flex h-[45px] shrink-0");
		expect(POSITIONS_PANEL_SOURCE).toContain("<AccountTableHeaderView");
		expect(POSITIONS_PANEL_SOURCE).toContain("flex-col pt-0");
	});
});
