/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePositionBulkDetailsActions } from "@/components/trade/mobile/mobile-positions-tab";
import { PositionFilterToolbar } from "@/components/trade/positions/position-filter-toolbar";
import { ALL_POSITION_MARKETS } from "@/domain/trade/position-toolbar";
import { createI18nRoot } from "./harness/react";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MOBILE_POSITIONS_TAB_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-positions-tab.tsx"),
	"utf8",
);

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
					market={ALL_POSITION_MARKETS}
					marketOptions={[]}
					onDirectionChange={vi.fn()}
					onMarketChange={vi.fn()}
					mobile
				/>,
			);
		});

		const toolbar = container.querySelector<HTMLElement>('[data-testid="position-filter-toolbar"]');
		const direction = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Filter positions by direction:"]',
		);
		const market = container.querySelector<HTMLButtonElement>('button[aria-label^="Filter positions by market:"]');

		expect(toolbar?.className).toContain("gap-1.5");
		expect(direction?.textContent).toContain("Direction");
		for (const chip of [direction, market]) {
			expect(chip?.className).toContain("rounded-[7px]");
			expect(chip?.className).toContain("px-[9px]");
			expect(chip?.className).toContain("py-1");
			expect(chip?.className).toContain("text-xs");
			expect(chip?.className).toContain("after:h-11");
		}

		expect(MOBILE_POSITIONS_TAB_SOURCE).toContain(
			'className="flex shrink-0 items-center justify-between border-b border-market-close-stroke-card px-3.5 py-2.5"',
		);
		expect(MOBILE_POSITIONS_TAB_SOURCE).toContain('cn("space-y-2.5 px-3.5 py-3"');
	});

	it("keeps expand-all and collapse-all as independent actions", () => {
		const onExpandAll = vi.fn();
		const onCollapseAll = vi.fn();
		const filteredPositionKeys = ["one", "two"];

		function renderActions(expandedPositionKeys: ReadonlySet<string>) {
			act(() => {
				root.render(
					<MobilePositionBulkDetailsActions
						filteredPositionKeys={filteredPositionKeys}
						expandedPositionKeys={expandedPositionKeys}
						onExpandAll={onExpandAll}
						onCollapseAll={onCollapseAll}
					/>,
				);
			});
		}

		renderActions(new Set());
		const expandAll = container.querySelector<HTMLButtonElement>('[data-testid="expand-all-position-details"]');
		const collapseAll = container.querySelector<HTMLButtonElement>('[data-testid="collapse-all-position-details"]');
		const actions = container.querySelector<HTMLElement>('[data-testid="mobile-position-bulk-details-actions"]');

		expect(actions?.className).toContain("gap-3");
		expect(expandAll?.disabled).toBe(false);
		expect(collapseAll?.disabled).toBe(true);
		expect(expandAll?.className).toContain("after:h-11");
		expect(collapseAll?.className).toContain("after:h-11");
		act(() => expandAll?.click());
		expect(onExpandAll).toHaveBeenCalledTimes(1);
		expect(onCollapseAll).not.toHaveBeenCalled();

		renderActions(new Set(["one"]));
		expect(expandAll?.disabled).toBe(false);
		expect(collapseAll?.disabled).toBe(false);
		act(() => collapseAll?.click());
		expect(onCollapseAll).toHaveBeenCalledTimes(1);

		renderActions(new Set(filteredPositionKeys));
		expect(expandAll?.disabled).toBe(true);
		expect(collapseAll?.disabled).toBe(false);
	});
});
