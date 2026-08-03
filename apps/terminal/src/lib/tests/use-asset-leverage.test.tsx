// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssetLeverage } from "@/hooks/trade/use-asset-leverage";

const USER = "0x1111111111111111111111111111111111111111";

interface UpdateLeverageParams {
	asset: number;
	isCross: boolean;
	leverage: number;
}

const mocks = vi.hoisted(() => ({
	activeAssetData: undefined as
		| {
				coin: string;
				user: string;
				leverage: { type: "cross" | "isolated"; value: number; rawUsd?: string };
		  }
		| undefined,
	isConnected: true,
	market: undefined as
		| {
				kind: "perp" | "builderPerp";
				name: string;
				assetId: number;
				maxLeverage: number;
				dex?: string;
				marginMode?: "strictIsolated" | "noCross";
				onlyIsolated?: true;
		  }
		| undefined,
	position: null as { coin: string; dex: string } | null,
	positionError: false,
	positionLoading: false,
	positionStale: false,
	activeAssetStale: false,
	storedMarginMode: "cross" as "cross" | "isolated",
	getPosition: vi.fn(),
	resetMutation: vi.fn(),
	setStoredMarginMode: vi.fn(),
	updateLeverage: vi.fn(),
	executeLeverage: vi.fn(),
	beforeQueuedExecution: null as null | (() => Promise<void>),
	executionGuard: undefined as ((params: UpdateLeverageParams) => void) | undefined,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.isConnected ? USER : undefined, isConnected: mocks.isConnected }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useMarginMode: () => mocks.storedMarginMode,
	useGlobalSettingsActions: () => ({ setMarginMode: mocks.setStoredMarginMode }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketCapabilities: (market: typeof mocks.market) => {
		const isOnlyIsolated =
			market?.onlyIsolated === true || market?.marginMode === "noCross" || market?.marginMode === "strictIsolated";
		return { isOnlyIsolated, allowsCrossMargin: !isOnlyIsolated };
	},
	useExchange: (_method: string, options?: { executionGuard?: (params: UpdateLeverageParams) => void }) => {
		mocks.executionGuard = options?.executionGuard;
		return {
			mutateAsync: mocks.updateLeverage,
			isPending: false,
			error: null,
			reset: mocks.resetMutation,
		};
	},
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	useSubscription: () => ({
		data: mocks.activeAssetData,
		status: "active",
		isStale: mocks.activeAssetStale,
	}),
	useUserPositions: () => ({
		getPosition: mocks.getPosition,
		isLoading: mocks.positionLoading,
		hasError: mocks.positionError,
		isStale: mocks.positionStale,
	}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useAssetLeverage> | null = null;

function Probe() {
	hookValue = useAssetLeverage();
	return null;
}

function corePerp() {
	return {
		kind: "perp" as const,
		name: "ETH",
		assetId: 1,
		maxLeverage: 50,
	};
}

function builderPerp() {
	return {
		kind: "builderPerp" as const,
		name: "xyz:SMSN",
		assetId: 120_031,
		maxLeverage: 10,
		dex: "xyz",
		marginMode: "noCross" as const,
		onlyIsolated: true as const,
	};
}

function setActiveAsset(coin: string, type: "cross" | "isolated", value = 10) {
	mocks.activeAssetData = { coin, user: USER, leverage: { type, value } };
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("useAssetLeverage", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.isConnected = true;
		mocks.market = corePerp();
		mocks.position = null;
		mocks.positionError = false;
		mocks.positionLoading = false;
		mocks.positionStale = false;
		mocks.activeAssetStale = false;
		mocks.storedMarginMode = "cross";
		setActiveAsset("ETH", "cross");
		mocks.getPosition.mockReset().mockImplementation(() => mocks.position);
		mocks.resetMutation.mockReset();
		mocks.setStoredMarginMode.mockReset();
		mocks.executionGuard = undefined;
		mocks.beforeQueuedExecution = null;
		mocks.executeLeverage.mockReset().mockResolvedValue({ status: "ok", response: { type: "default" } });
		mocks.updateLeverage.mockReset().mockImplementation(async (params: UpdateLeverageParams) => {
			mocks.executionGuard?.(params);
			await mocks.beforeQueuedExecution?.();
			mocks.executionGuard?.(params);
			return mocks.executeLeverage(params);
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	function renderHook() {
		act(() => root.render(createElement(Probe)));
		if (!hookValue) throw new Error("Expected leverage hook value");
		return hookValue;
	}

	function currentHook() {
		if (!hookValue) throw new Error("Expected leverage hook value");
		return hookValue;
	}

	function currentExecutionGuard() {
		if (!mocks.executionGuard) throw new Error("Expected updateLeverage execution guard");
		return mocks.executionGuard;
	}

	it("allows leverage updates for a forced-isolated HIP-3 market and queries the exact dex", async () => {
		mocks.market = builderPerp();
		setActiveAsset("xyz:SMSN", "isolated");
		const hook = renderHook();

		expect(hook.marginMode).toBe("isolated");
		expect(hook.isOnlyIsolated).toBe(true);
		expect(hook.allowsCrossMargin).toBe(false);
		expect(hook.allowsIsolatedMarginRemoval).toBe(true);
		expect(mocks.getPosition).toHaveBeenCalledWith("xyz:SMSN", "xyz");

		await act(async () => {
			await expect(currentHook().switchMarginMode("cross")).rejects.toThrow(
				"This market only supports isolated margin mode",
			);
		});
		expect(mocks.updateLeverage).not.toHaveBeenCalled();

		act(() => currentHook().setPendingLeverage(6.6));
		expect(currentHook().pendingLeverage).toBe(7);
		await act(async () => {
			await currentHook().confirmLeverage();
		});

		expect(mocks.updateLeverage).toHaveBeenCalledWith({
			asset: 120_031,
			isCross: false,
			leverage: 7,
		});
	});

	it("reports append-only isolated margin for strictIsolated markets", () => {
		mocks.market = { ...builderPerp(), marginMode: "strictIsolated" };
		setActiveAsset("xyz:SMSN", "isolated");

		const hook = renderHook();

		expect(hook.allowsCrossMargin).toBe(false);
		expect(hook.allowsIsolatedMarginRemoval).toBe(false);
	});

	it("keeps isolated margin removable for normal perps", () => {
		const hook = renderHook();

		expect(hook.allowsCrossMargin).toBe(true);
		expect(hook.allowsIsolatedMarginRemoval).toBe(true);
	});

	it("revalidates a queued request against the latest selected market and forced-isolated capability", () => {
		renderHook();
		const executionGuard = currentExecutionGuard();

		mocks.market = builderPerp();
		mocks.positionLoading = true;
		mocks.activeAssetData = undefined;
		renderHook();

		expect(() => executionGuard({ asset: 1, isCross: false, leverage: 5 })).toThrow(
			"Leverage request no longer matches the selected market",
		);
		expect(() => executionGuard({ asset: 120_031, isCross: true, leverage: 5 })).toThrow(
			"This market only supports isolated margin mode",
		);
		expect(() => executionGuard({ asset: 120_031, isCross: false, leverage: 5 })).toThrow(
			"Active asset data is unavailable",
		);
	});

	it("fails closed when active asset data is stale", () => {
		mocks.market = builderPerp();
		setActiveAsset("xyz:SMSN", "isolated");
		renderHook();
		const executionGuard = currentExecutionGuard();

		mocks.activeAssetStale = true;
		renderHook();

		expect(() => executionGuard({ asset: 120_031, isCross: false, leverage: 5 })).toThrow(
			"Active asset data is unavailable",
		);
	});

	it("fails closed when the latest active margin mode is unavailable", () => {
		renderHook();
		const executionGuard = currentExecutionGuard();

		mocks.activeAssetData = undefined;
		mocks.storedMarginMode = "isolated";
		renderHook();

		expect(() => executionGuard({ asset: 1, isCross: false, leverage: 5 })).toThrow("Margin mode data is unavailable");
		expect(() => executionGuard({ asset: 1, isCross: true, leverage: 5 })).toThrow("Margin mode data is unavailable");
	});

	it("revalidates cross-to-isolated transitions against the latest position state", () => {
		renderHook();
		const executionGuard = currentExecutionGuard();

		mocks.position = { coin: "ETH", dex: "" };
		renderHook();
		expect(() => executionGuard({ asset: 1, isCross: false, leverage: 5 })).toThrow(
			"Cannot switch to isolated mode with an open position",
		);

		mocks.position = null;
		mocks.positionLoading = true;
		renderHook();
		expect(() => executionGuard({ asset: 1, isCross: false, leverage: 5 })).toThrow("Position data is unavailable");

		mocks.positionLoading = false;
		mocks.positionStale = true;
		renderHook();
		expect(() => executionGuard({ asset: 1, isCross: false, leverage: 5 })).toThrow("Position data is unavailable");
	});

	it("fails closed when active asset data becomes stale while execution is queued", async () => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		mocks.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		mocks.market = builderPerp();
		setActiveAsset("xyz:SMSN", "isolated");
		renderHook();
		act(() => currentHook().setPendingLeverage(5));

		let updatePromise!: Promise<void>;
		act(() => {
			updatePromise = currentHook().confirmLeverage();
		});
		await queueStarted.promise;

		mocks.activeAssetStale = true;
		renderHook();
		releaseQueue.resolve();

		await act(async () => {
			await expect(updatePromise).rejects.toThrow("Active asset data is unavailable");
		});
		expect(mocks.executeLeverage).not.toHaveBeenCalled();
	});

	it("rejects non-integer and out-of-range leverage at final execution", () => {
		renderHook();
		const executionGuard = currentExecutionGuard();

		expect(() => executionGuard({ asset: 1, isCross: true, leverage: 5.5 })).toThrow("Invalid leverage");
		expect(() => executionGuard({ asset: 1, isCross: true, leverage: 51 })).toThrow("Invalid leverage");
		expect(() => executionGuard({ asset: 1, isCross: true, leverage: 1 })).not.toThrow();
	});

	it("blocks switching an open cross position to isolated", async () => {
		mocks.position = { coin: "ETH", dex: "" };
		const hook = renderHook();

		expect(hook.hasPosition).toBe(true);
		expect(mocks.getPosition).toHaveBeenCalledWith("ETH", "");
		await act(async () => {
			await expect(currentHook().applyMarginAndLeverage("isolated", 5)).rejects.toThrow(
				"Cannot switch to isolated mode with an open position",
			);
		});
		expect(mocks.updateLeverage).not.toHaveBeenCalled();
	});

	it.each([
		["loading", true, false],
		["error", false, true],
	] as const)("fails closed when position state is %s", async (_label, positionLoading, positionError) => {
		mocks.positionLoading = positionLoading;
		mocks.positionError = positionError;
		const hook = renderHook();

		expect(hook.positionStateReady).toBe(false);
		await act(async () => {
			await expect(currentHook().applyMarginAndLeverage("isolated", 5)).rejects.toThrow("Position data is unavailable");
		});
		expect(mocks.updateLeverage).not.toHaveBeenCalled();
	});

	it("switches a position-free market to isolated with an integer target leverage", async () => {
		renderHook();

		await act(async () => {
			await currentHook().applyMarginAndLeverage("isolated", 5.5);
		});

		expect(mocks.updateLeverage).toHaveBeenCalledWith({ asset: 1, isCross: false, leverage: 6 });
		expect(mocks.setStoredMarginMode).toHaveBeenCalledWith("isolated");
	});

	it("normalizes connected leverage input and rejects non-finite apply values", async () => {
		setActiveAsset("ETH", "cross", 5);
		renderHook();

		act(() => currentHook().setPendingLeverage(99));
		expect(currentHook().pendingLeverage).toBe(50);
		act(() => currentHook().setPendingLeverage(-10));
		expect(currentHook().pendingLeverage).toBe(1);
		act(() => currentHook().setPendingLeverage(Number.NaN));
		expect(currentHook().pendingLeverage).toBe(1);

		await act(async () => {
			await expect(currentHook().applyMarginAndLeverage("cross", Number.POSITIVE_INFINITY)).rejects.toThrow(
				"Invalid leverage",
			);
		});
		expect(mocks.updateLeverage).not.toHaveBeenCalled();
	});
});
