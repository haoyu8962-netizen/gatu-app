// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { LeaderboardSourceRow } from "../leaderboard-domain";
import { useLeaderboardController } from "../use-leaderboard-controller";

interface QueryState<T> {
	data: T | undefined;
	isLoading: boolean;
	isError: boolean;
	isFetching: boolean;
	refetch: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
	leaderboard: {} as QueryState<readonly LeaderboardSourceRow[]>,
	vaults: {} as QueryState<readonly { vaultAddress: `0x${string}` }[]>,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerAddressUrl: (address: string) => `https://example.invalid/address/${address}`,
	useHyperliquid: () => ({ isTestnet: false }),
	usePublicLeaderboard: () => mocks.leaderboard,
	usePublicVaults: () => mocks.vaults,
}));

let controller: ReturnType<typeof useLeaderboardController> | null = null;

function Probe() {
	controller = useLeaderboardController();
	return null;
}

describe("useLeaderboardController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.leaderboard = query([row("1")]);
		mocks.vaults = query([]);
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("derives normal and no-results states and preserves ranked rows", () => {
		render();
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
		expect(current().rows[0]).toMatchObject({ rank: 1, pnl: "30" });

		act(() => current().onQueryChange("missing"));
		expect(current()).toMatchObject({ pageState: "noResults", totalRows: 0 });
	});

	it("prioritizes loading and error and retries both verified feeds", () => {
		mocks.leaderboard = query<readonly LeaderboardSourceRow[]>(undefined, { isLoading: true });
		render();
		expect(current().pageState).toBe("loading");

		mocks.leaderboard.isLoading = false;
		mocks.leaderboard.isError = true;
		act(() => root.render(<Probe />));
		expect(current().pageState).toBe("error");

		act(() => current().onRetry());
		expect(mocks.leaderboard.refetch).toHaveBeenCalledOnce();
		expect(mocks.vaults.refetch).toHaveBeenCalledOnce();
	});

	function render() {
		act(() => root.render(<Probe />));
	}

	function current() {
		if (!controller) throw new Error("Controller was not captured");
		return controller;
	}
});

function query<T>(data: T | undefined, overrides: Partial<QueryState<T>> = {}): QueryState<T> {
	return {
		data,
		isLoading: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn(),
		...overrides,
	};
}

function row(suffix: string): LeaderboardSourceRow {
	return {
		address: `0x${suffix.padStart(40, "0")}`,
		accountValue: "250000",
		displayName: null,
		prize: 0,
		performance: {
			day: { pnl: "10", roi: "0.01", volume: "100" },
			week: { pnl: "20", roi: "0.02", volume: "200" },
			month: { pnl: "30", roi: "0.03", volume: "300" },
			allTime: { pnl: "40", roi: "0.04", volume: "20000000" },
		},
	};
}
