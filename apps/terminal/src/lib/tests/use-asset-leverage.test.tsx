// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssetLeverage } from "@/hooks/trade/use-asset-leverage";
import { createExchangeHarness } from "./harness/hyperliquid-exchange";

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
	accountAddress: "0x1111111111111111111111111111111111111111",
	network: "mainnet" as "mainnet" | "testnet",
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
	positionReceivedAt: Date.now(),
	activeAssetStale: false,
	activeAssetReceivedAt: Date.now(),
	storedMarginMode: "cross" as "cross" | "isolated",
	getPosition: vi.fn(),
	resetMutation: vi.fn(),
	setStoredMarginMode: vi.fn(),
	updateLeverage: vi.fn(),
	updateLeverageError: null as Error | null,
	executeLeverage: vi.fn(),
	beforeQueuedExecution: null as null | (() => Promise<void>),
	executionGuard: undefined as ((params: UpdateLeverageParams) => void) | undefined,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.isConnected ? mocks.accountAddress : undefined,
		isConnected: mocks.isConnected,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useMarginMode: () => mocks.storedMarginMode,
	useNetwork: () => mocks.network,
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
			error: mocks.updateLeverageError,
			reset: mocks.resetMutation,
		};
	},
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	useSubscription: () => ({
		data: mocks.activeAssetData,
		status: "active",
		isStale: mocks.activeAssetStale,
		lastMessageAt: mocks.activeAssetReceivedAt,
	}),
	useUserPositions: () => ({
		getPosition: mocks.getPosition,
		isLoading: mocks.positionLoading,
		hasError: mocks.positionError,
		isStale: mocks.positionStale,
		receivedAt: mocks.positionReceivedAt,
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
	mocks.activeAssetData = { coin, user: mocks.accountAddress, leverage: { type, value } };
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
		mocks.accountAddress = USER;
		mocks.network = "mainnet";
		mocks.market = corePerp();
		mocks.position = null;
		mocks.positionError = false;
		mocks.positionLoading = false;
		mocks.positionStale = false;
		mocks.positionReceivedAt = Date.now();
		mocks.activeAssetStale = false;
		mocks.activeAssetReceivedAt = Date.now();
		mocks.storedMarginMode = "cross";
		setActiveAsset("ETH", "cross");
		mocks.getPosition.mockReset().mockImplementation(() => mocks.position);
		mocks.resetMutation.mockReset();
		mocks.setStoredMarginMode.mockReset();
		mocks.executionGuard = undefined;
		mocks.beforeQueuedExecution = null;
		mocks.updateLeverageError = null;
		mocks.executeLeverage.mockReset().mockResolvedValue({ status: "ok", response: { type: "default" } });
		mocks.updateLeverage.mockReset().mockImplementation(async (params: UpdateLeverageParams) => {
			mocks.executionGuard?.(params);
			await mocks.beforeQueuedExecution?.();
			mocks.executionGuard?.(params);
			try {
				return await mocks.executeLeverage(params);
			} catch (error) {
				mocks.updateLeverageError = error instanceof Error ? error : new Error(String(error));
				throw error;
			}
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
		vi.useRealTimers();
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

	it.each([corePerp(), builderPerp()])(
		"sends confirmed $name leverage through the installed SDK exactly once",
		async (market) => {
			const sdk = createExchangeHarness();
			const mode = market.kind === "builderPerp" ? "isolated" : "cross";
			mocks.market = market;
			setActiveAsset(market.name, mode);
			mocks.executeLeverage.mockImplementation((params: UpdateLeverageParams) => sdk.client.updateLeverage(params));
			renderHook();

			act(() => currentHook().setPendingLeverage(7));
			expect(sdk.signTypedData).not.toHaveBeenCalled();
			expect(sdk.request).not.toHaveBeenCalled();
			await act(async () => currentHook().confirmLeverage());

			expect(sdk.signTypedData).toHaveBeenCalledOnce();
			expect(sdk.request).toHaveBeenCalledOnce();
			expect(sdk.getAction()).toEqual({
				type: "updateLeverage",
				asset: market.assetId,
				isCross: mode === "cross",
				leverage: 7,
			});
		},
	);

	it("blocks an account change before the real leverage SDK boundary", async () => {
		const sdk = createExchangeHarness();
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		mocks.executeLeverage.mockImplementation((params: UpdateLeverageParams) => sdk.client.updateLeverage(params));
		renderHook();
		act(() => currentHook().setPendingLeverage(7));
		mocks.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		let updatePromise!: Promise<void>;
		act(() => {
			updatePromise = currentHook().confirmLeverage();
		});
		await queueStarted.promise;
		mocks.accountAddress = "0x2222222222222222222222222222222222222222";
		renderHook();
		releaseQueue.resolve();
		await act(async () => {
			await expect(updatePromise).rejects.toThrow();
		});
		expect(sdk.signTypedData).not.toHaveBeenCalled();
		expect(sdk.request).not.toHaveBeenCalled();
	});

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

	it("fails closed when active asset data exceeds its exact age before the watchdog runs", () => {
		mocks.market = builderPerp();
		setActiveAsset("xyz:SMSN", "isolated");
		mocks.activeAssetReceivedAt = Date.now() - 20_001;
		renderHook();

		expect(() => currentExecutionGuard()({ asset: 120_031, isCross: false, leverage: 5 })).toThrow(
			"Active asset data is unavailable",
		);
		expect(mocks.executeLeverage).not.toHaveBeenCalled();
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

	it("fails closed when position data exceeds its exact age before switching to isolated", async () => {
		mocks.positionReceivedAt = Date.now() - 60_001;
		renderHook();

		await act(async () => {
			await expect(currentHook().switchMarginMode("isolated")).rejects.toThrow("Position data is unavailable");
			await expect(currentHook().applyMarginAndLeverage("isolated", 5)).rejects.toThrow("Position data is unavailable");
		});
		expect(mocks.executeLeverage).not.toHaveBeenCalled();
	});

	it("accepts position data at the exact age boundary", () => {
		const now = Date.now();
		vi.useFakeTimers();
		vi.setSystemTime(now);
		mocks.positionReceivedAt = now - 60_000;
		renderHook();

		expect(() => currentExecutionGuard()({ asset: 1, isCross: false, leverage: 5 })).not.toThrow();
		vi.useRealTimers();
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

	it("does not let the production apply path switch margin mode for a queued leverage-only update", async () => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		mocks.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		renderHook();

		let updatePromise!: Promise<void>;
		act(() => {
			updatePromise = currentHook().applyMarginAndLeverage("cross", 5);
		});
		await queueStarted.promise;

		setActiveAsset("ETH", "isolated");
		renderHook();
		releaseQueue.resolve();

		await act(async () => {
			await expect(updatePromise).rejects.toThrow("Margin mode changed before leverage update");
		});
		expect(mocks.executeLeverage).not.toHaveBeenCalled();
	});

	it("does not let a queued mode-only update overwrite newer leverage", async () => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		mocks.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		renderHook();

		let updatePromise!: Promise<void>;
		act(() => {
			updatePromise = currentHook().applyMarginAndLeverage("isolated", 10);
		});
		await queueStarted.promise;

		setActiveAsset("ETH", "cross", 15);
		renderHook();
		releaseQueue.resolve();

		await act(async () => {
			await expect(updatePromise).rejects.toThrow("Leverage changed before margin mode update");
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

	it("keeps the successful leverage and margin mode effective until the subscription confirms both", async () => {
		renderHook();

		await act(async () => {
			await currentHook().applyMarginAndLeverage("isolated", 20);
		});

		expect(currentHook().currentLeverage).toBe(10);
		expect(currentHook().committedLeverage).toBe(20);
		expect(currentHook().displayLeverage).toBe(20);
		expect(currentHook().marginMode).toBe("isolated");
		expect(currentHook().pendingLeverage).toBeNull();

		act(() => currentHook().resetPending());

		expect(currentHook().committedLeverage).toBe(20);
		expect(currentHook().displayLeverage).toBe(20);
		expect(currentHook().marginMode).toBe("isolated");

		renderHook();
		expect(currentHook().committedLeverage).toBe(20);
		expect(currentHook().displayLeverage).toBe(20);
		expect(currentHook().marginMode).toBe("isolated");

		setActiveAsset("ETH", "isolated", 20);
		renderHook();

		expect(currentHook().currentLeverage).toBe(20);
		expect(currentHook().committedLeverage).toBeNull();
		expect(currentHook().displayLeverage).toBe(20);
		expect(currentHook().marginMode).toBe("isolated");
	});

	it("hands authority to the first later successful snapshot even when it differs from the commit", async () => {
		renderHook();

		await act(async () => {
			await currentHook().applyMarginAndLeverage("isolated", 20);
		});

		expect(currentHook().committedLeverage).toBe(20);
		expect(currentHook().displayLeverage).toBe(20);
		expect(currentHook().marginMode).toBe("isolated");

		renderHook();
		expect(currentHook().committedLeverage).toBe(20);

		setActiveAsset("ETH", "cross", 12);
		renderHook();

		expect(currentHook().committedLeverage).toBeNull();
		expect(currentHook().currentLeverage).toBe(12);
		expect(currentHook().displayLeverage).toBe(12);
		expect(currentHook().marginMode).toBe("cross");
	});

	it("recognizes a successor snapshot by receipt time when the data reference is reused", async () => {
		renderHook();
		const observedSnapshot = mocks.activeAssetData;

		await act(async () => {
			await currentHook().applyMarginAndLeverage("isolated", 20);
		});
		expect(currentHook().committedLeverage).toBe(20);

		mocks.activeAssetReceivedAt += 1;
		renderHook();

		expect(mocks.activeAssetData).toBe(observedSnapshot);
		expect(currentHook().committedLeverage).toBeNull();
		expect(currentHook().displayLeverage).toBe(10);
		expect(currentHook().marginMode).toBe("cross");
	});

	it("does not revive the old snapshot when no successor arrives for 20 seconds", async () => {
		const now = Date.now();
		vi.useFakeTimers();
		vi.setSystemTime(now);
		mocks.activeAssetReceivedAt = now;
		renderHook();

		await act(async () => {
			await currentHook().applyMarginAndLeverage("isolated", 20);
		});
		expect(currentHook().committedLeverage).toBe(20);

		act(() => vi.advanceTimersByTime(19_999));
		expect(currentHook().committedLeverage).toBe(20);

		act(() => vi.advanceTimersByTime(1));
		renderHook();
		expect(currentHook().committedLeverage).toBe(20);
		expect(currentHook().displayLeverage).toBe(20);
		expect(currentHook().marginMode).toBe("isolated");
	});

	it("does not publish committed settings when the leverage request fails", async () => {
		mocks.executeLeverage.mockRejectedValueOnce(new Error("request failed"));
		renderHook();

		await act(async () => {
			await expect(currentHook().applyMarginAndLeverage("cross", 20)).rejects.toThrow("request failed");
		});
		renderHook();

		expect(currentHook().committedLeverage).toBeNull();
		expect(currentHook().displayLeverage).toBe(10);
		expect(currentHook().marginMode).toBe("cross");
		expect(currentHook().updateError?.message).toBe("request failed");
		expect(currentHook().switchModeError).toBeNull();
	});

	it("does not carry committed settings across market, account, or network boundaries", async () => {
		renderHook();

		await act(async () => {
			await currentHook().applyMarginAndLeverage("cross", 20);
		});
		expect(currentHook().committedLeverage).toBe(20);

		mocks.market = { ...corePerp(), name: "BTC", assetId: 0 };
		setActiveAsset("BTC", "cross", 5);
		renderHook();
		expect(currentHook().committedLeverage).toBeNull();
		expect(currentHook().displayLeverage).toBe(5);

		await act(async () => {
			await currentHook().applyMarginAndLeverage("cross", 15);
		});
		expect(currentHook().committedLeverage).toBe(15);

		mocks.accountAddress = "0x2222222222222222222222222222222222222222";
		setActiveAsset("BTC", "cross", 7);
		renderHook();
		expect(currentHook().committedLeverage).toBeNull();
		expect(currentHook().displayLeverage).toBe(7);

		await act(async () => {
			await currentHook().applyMarginAndLeverage("cross", 12);
		});
		expect(currentHook().committedLeverage).toBe(12);

		mocks.network = "testnet";
		renderHook();
		expect(currentHook().committedLeverage).toBeNull();
		expect(currentHook().displayLeverage).toBe(7);
	});

	it("exposes a stable full transaction identity for the leverage interaction boundary", () => {
		mocks.accountAddress = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
		setActiveAsset("ETH", "cross");
		const first = renderHook();

		expect(first.transactionIdentity).toBe("mainnet:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:perp:1:ETH");

		mocks.accountAddress = mocks.accountAddress.toLowerCase();
		setActiveAsset("ETH", "cross");
		const caseOnlyChange = renderHook();
		expect(caseOnlyChange.transactionIdentity).toBe(first.transactionIdentity);

		mocks.network = "testnet";
		const nextNetwork = renderHook();
		expect(nextNetwork.transactionIdentity).toBe("testnet:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:perp:1:ETH");
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

	it("persists a reduced maximum into pending and committed leverage state", async () => {
		renderHook();
		act(() => currentHook().setPendingLeverage(40));
		expect(currentHook().pendingLeverage).toBe(40);

		mocks.market = { ...corePerp(), maxLeverage: 20 };
		renderHook();
		expect(currentHook().pendingLeverage).toBe(20);

		mocks.market = { ...corePerp(), maxLeverage: 50 };
		renderHook();
		expect(currentHook().pendingLeverage).toBe(20);

		await act(async () => currentHook().applyMarginAndLeverage("cross", 40));
		expect(currentHook().committedLeverage).toBe(40);

		mocks.market = { ...corePerp(), maxLeverage: 20 };
		renderHook();
		expect(currentHook().committedLeverage).toBe(20);

		mocks.market = { ...corePerp(), maxLeverage: 50 };
		renderHook();
		expect(currentHook().committedLeverage).toBe(20);
	});

	it("keeps modal action references stable across unrelated subscription renders", () => {
		const first = renderHook();
		const firstSetPending = first.setPendingLeverage;
		const firstReset = first.resetPending;
		const firstApply = first.applyMarginAndLeverage;

		mocks.activeAssetData = {
			coin: "ETH",
			user: USER,
			leverage: { type: "cross", value: 10, rawUsd: "125" },
		};
		const second = renderHook();

		expect(second.setPendingLeverage).toBe(firstSetPending);
		expect(second.resetPending).toBe(firstReset);
		expect(second.applyMarginAndLeverage).toBe(firstApply);
	});

	it("keeps an in-flight leverage request observable and rejects duplicate execution", async () => {
		const deferred = createDeferred();
		mocks.executeLeverage.mockReturnValue(deferred.promise);
		renderHook();
		const resetCallsBeforeRequest = mocks.resetMutation.mock.calls.length;

		let firstRequest!: Promise<void>;
		act(() => {
			firstRequest = currentHook().applyMarginAndLeverage("cross", 5);
		});

		await expect(currentHook().applyMarginAndLeverage("cross", 5)).rejects.toThrow(
			"Another action for this market is already in progress.",
		);
		act(() => currentHook().resetPending());
		expect(mocks.resetMutation).toHaveBeenCalledTimes(resetCallsBeforeRequest);

		deferred.resolve();
		await act(async () => firstRequest);

		act(() => currentHook().resetPending());
		expect(mocks.resetMutation).toHaveBeenCalledTimes(resetCallsBeforeRequest + 1);
	});
});
