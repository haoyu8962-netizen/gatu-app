// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ activeTab: "positions", names: [] as string[] }));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_importer: unknown, name: string) => ({
		preload: () => {
			state.names.push(name);
			return Promise.resolve();
		},
	}),
	preloadLazyComponents: (components: ReadonlyArray<{ preload?: () => Promise<void> }>) =>
		Promise.all(components.map((component) => component.preload?.())).then(() => undefined),
}));
vi.mock("@/stores/use-global-settings-store", () => ({
	getPositionsActiveTab: () => state.activeTab,
	usePositionsActiveTab: () => state.activeTab,
	useGlobalSettingsActions: () => ({ setPositionsActiveTab: () => {} }),
}));

describe("preloadPositionsPanel", () => {
	let preloadPositionsPanel: () => Promise<void>;

	beforeAll(async () => {
		({ preloadPositionsPanel } = await import("@/components/trade/positions/positions-panel"));
	}, 30_000);

	beforeEach(() => {
		state.names.length = 0;
	});

	it.each([
		["positions", ["PositionsTab"]],
		["orders", ["PositionsTab", "OrdersTab"]],
		["balances", ["PositionsTab", "BalancesTab"]],
		["orders-history", ["PositionsTab", "OrdersHistoryTab"]],
		["transfers", ["PositionsTab"]],
		["unknown-tab", ["PositionsTab"]],
	])("preloads the default tab and the restored %s tab", async (activeTab, expected) => {
		state.activeTab = activeTab;
		await preloadPositionsPanel();
		expect(state.names).toEqual(expected);
	});
});
