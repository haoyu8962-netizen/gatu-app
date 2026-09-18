/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileBulkDisclosureActions } from "@/components/trade/mobile/mobile-bulk-disclosure-actions";
import { PositionFilterToolbar } from "@/components/trade/positions/position-filter-toolbar";
import { ALL_POSITION_MARKETS } from "@/domain/trade/position-toolbar";
import { createI18nRoot } from "./harness/react";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
function readMobileSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/trade/mobile/${file}`), "utf8");
}
const MOBILE_POSITIONS_TAB_SOURCE = readMobileSource("mobile-positions-tab.tsx");

describe("mobile position filter row", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("matches the 2b spacing and preserves 44px touch hit areas", () => {
		act(() => {
			root.render(
				<PositionFilterToolbar
					direction="all"
					margin="all"
					market={ALL_POSITION_MARKETS}
					marketOptions={[]}
					onDirectionChange={vi.fn()}
					onMarginChange={vi.fn()}
					onMarketChange={vi.fn()}
					mobile
				/>,
			);
		});

		const toolbar = container.querySelector<HTMLElement>('[data-testid="position-filter-toolbar"]');
		const direction = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Filter positions by direction:"]',
		);
		const margin = container.querySelector<HTMLButtonElement>('button[aria-label^="Filter positions by margin mode:"]');

		expect(toolbar?.className).toContain("gap-1.5");
		expect(direction?.textContent).toContain("Direction");
		expect(margin?.textContent).toContain("Margin");
		for (const chip of [direction, margin]) {
			expect(chip?.className).toContain("rounded-[7px]");
			expect(chip?.className).toContain("px-[9px]");
			expect(chip?.className).toContain("!h-[27px]");
			expect(chip?.className).toContain("text-xs");
			expect(chip?.className).toContain("after:h-11");
		}

		expect(MOBILE_POSITIONS_TAB_SOURCE).toContain(
			'className="flex h-9 shrink-0 items-center justify-between border-b border-market-close-stroke-card px-3.5"',
		);
		expect(MOBILE_POSITIONS_TAB_SOURCE).toContain('cn("space-y-2.5 px-3.5 py-3"');
	});

	it("renders every filter control inert while disconnected and drops the connect prompt", () => {
		act(() => {
			root.render(
				<PositionFilterToolbar
					direction="all"
					margin="all"
					market={ALL_POSITION_MARKETS}
					marketOptions={[]}
					onDirectionChange={vi.fn()}
					onMarginChange={vi.fn()}
					onMarketChange={vi.fn()}
					mobile
					disabled
				/>,
			);
		});

		const controls = [...container.querySelectorAll<HTMLButtonElement>("button")];
		expect(controls.length).toBeGreaterThan(0);
		expect(controls.every((control) => control.disabled || control.getAttribute("aria-disabled") === "true")).toBe(
			true,
		);

		const disconnectedBranch = MOBILE_POSITIONS_TAB_SOURCE.slice(
			MOBILE_POSITIONS_TAB_SOURCE.indexOf("if (!isConnected) {"),
			MOBILE_POSITIONS_TAB_SOURCE.indexOf("if (positionsLoading"),
		);
		expect(disconnectedBranch).toContain("renderFilterRow(true)");
		expect(MOBILE_POSITIONS_TAB_SOURCE).not.toContain("Connect your wallet to view positions.");
		for (const file of [
			"mobile-positions-view.tsx",
			"mobile-balances-tab.tsx",
			"mobile-orders-tab.tsx",
			"mobile-twap-tab.tsx",
			"mobile-twap-history-list.tsx",
			"mobile-twap-fill-history-list.tsx",
			"mobile-history-tab.tsx",
			"mobile-funding-tab.tsx",
			"mobile-orders-history-tab.tsx",
			"mobile-account-transfers-tab.tsx",
		]) {
			expect(readMobileSource(file)).not.toContain("Connect your wallet");
		}
	});

	it("keeps expand-all and collapse-all as independent actions", () => {
		const onExpandAll = vi.fn();
		const onCollapseAll = vi.fn();
		const filteredPositionKeys = ["one", "two"];

		function renderActions(keys: readonly string[], expandedKeys: ReadonlySet<string>) {
			act(() => {
				root.render(
					<MobileBulkDisclosureActions
						keys={keys}
						controller={{ expandedKeys, expandAll: onExpandAll, collapseAll: onCollapseAll }}
					/>,
				);
			});
		}

		renderActions([], new Set());
		const expandAll = container.querySelector<HTMLButtonElement>('[data-testid="expand-all-details"]');
		const collapseAll = container.querySelector<HTMLButtonElement>('[data-testid="collapse-all-details"]');
		const actions = container.querySelector<HTMLElement>('[data-testid="mobile-bulk-disclosure-actions"]');

		expect(actions?.className).toContain("gap-3");
		expect(expandAll?.disabled).toBe(true);
		expect(collapseAll?.disabled).toBe(true);
		act(() => expandAll?.click());
		expect(onExpandAll).not.toHaveBeenCalled();

		renderActions(filteredPositionKeys, new Set());
		expect(expandAll?.disabled).toBe(false);
		expect(collapseAll?.disabled).toBe(true);
		expect(expandAll?.className).toContain("after:h-11");
		expect(collapseAll?.className).toContain("after:h-11");
		expect(expandAll?.className).toContain("font-normal");
		expect(expandAll?.className).toContain("text-market-close-fg");
		expect(expandAll?.className).toBe(collapseAll?.className);
		expect(expandAll?.getAttribute("aria-pressed")).toBeNull();
		expect(collapseAll?.getAttribute("aria-pressed")).toBeNull();
		act(() => expandAll?.click());
		expect(onExpandAll).toHaveBeenCalledWith(filteredPositionKeys);
		expect(onCollapseAll).not.toHaveBeenCalled();

		renderActions(filteredPositionKeys, new Set(["one"]));
		expect(expandAll?.disabled).toBe(false);
		expect(collapseAll?.disabled).toBe(false);
		act(() => collapseAll?.click());
		expect(onCollapseAll).toHaveBeenCalledWith(filteredPositionKeys);

		renderActions(filteredPositionKeys, new Set(filteredPositionKeys));
		expect(expandAll?.disabled).toBe(true);
		expect(collapseAll?.disabled).toBe(false);
	});
});
