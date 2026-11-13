// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PositionReverseTarget, usePositionReverseSubmit } from "@/hooks/trade/use-position-reverse-submit";
import { getNumberFormatters } from "@/lib/format";
import { getOrderNotificationCopy } from "@/lib/trade/order-notification-copy";
import {
	getOrderQueueItem,
	type OrderQueueItem,
	removeOrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import { getPendingOrderActions, hasPendingOrderForAssets } from "@/stores/use-pending-order-store";
import { getPendingTwapActions } from "@/stores/use-pending-twap-store";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111" as const;
const COIN = "xyz:CXMT";
const ASSET_ID = 120_031;
const BLOCKED_MESSAGE = "Another order for this market is still being confirmed.";
const BLOCKED_MESSAGE_AR = "لا يزال تأكيد طلب آخر لهذا السوق جارياً.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(BLOCKED_MESSAGE)]: BLOCKED_MESSAGE_AR,
};

interface LivePosition {
	coin: string;
	dex: string;
	szi: string;
	leverage: { type: "cross" | "isolated"; value: number };
}

interface OrderParams {
	grouping: "na" | "normalTpsl" | "positionTpsl";
	orders: Array<{
		a: number;
		b: boolean;
		p: string;
		s: string;
		r: boolean;
		t: { limit: { tif: string } };
		c?: string;
	}>;
}

const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	marketLoading: false,
	marketError: null as Error | null,
	marketKind: "builderPerp" as "perp" | "spot" | "builderPerp",
	marketAssetId: 120_031,
	marketCtxIndex: 31,
	marketDexIndex: 2,
	freshCtxIndex: 31,
	positionLoading: false,
	positionError: false,
	positionStale: false,
	positionReceivedAt: Date.now(),
	twapStatus: "active" as "active" | "connecting" | "error" | "idle",
	twapStale: false,
	twapReceivedAt: Date.now(),
	activeTwapCoins: [] as string[],
	livePosition: null as LivePosition | null,
	restPositionSize: "2.500",
	restMarginMode: "isolated" as "cross" | "isolated",
	restMarkPx: "100",
	restMidPx: null as string | null,
	clearinghouseState: vi.fn(),
	metaAndAssetCtxs: vi.fn(),
	mutateOrder: vi.fn(),
	executeOrder: vi.fn(),
	resetMutation: vi.fn(),
	executionGuard: undefined as ((params: OrderParams) => void) | undefined,
	betweenExecutionGuards: null as null | (() => Promise<void>),
	guardCalls: 0,
	lockRequest: vi.fn(),
	hip3Accepted: true,
	geo: { actionsBlocked: false, tradeRestricted: false },
	geoListeners: new Set<() => void>(),
}));

vi.mock("@/hooks/use-geo-restriction", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		useGeoRestriction: () =>
			useSyncExternalStore(
				(listener) => {
					mocks.geoListeners.add(listener);
					return () => mocks.geoListeners.delete(listener);
				},
				() => mocks.geo,
			),
	};
});

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/use-global-settings-store")>();
	return {
		...actual,
		useMarketOrderSlippageBpsString: () => "50",
	};
});

vi.mock("@/lib/hyperliquid", () => ({
	parseAssetId: (assetId: number) => {
		if (assetId >= 100_000) {
			const adjusted = assetId - 100_000;
			return { kind: "builderPerp", dexIndex: Math.floor(adjusted / 10_000), index: adjusted % 10_000 };
		}
		if (assetId >= 10_000) return { kind: "spot", index: assetId - 10_000 };
		return { kind: "perp", index: assetId };
	},
	useExchange: (
		_method: string,
		options?: {
			executionGuard?: (params: OrderParams) => void;
		},
	) => {
		mocks.executionGuard = options?.executionGuard;
		return {
			mutateAsync: mocks.mutateOrder,
			isPending: false,
			error: null,
			reset: mocks.resetMutation,
		};
	},
	useHyperliquid: () => ({
		clientKey: mocks.clientKey,
		env: mocks.env,
		info: {
			clearinghouseState: mocks.clearinghouseState,
			metaAndAssetCtxs: mocks.metaAndAssetCtxs,
		},
	}),
	useMarkets: () => ({
		isLoading: mocks.marketLoading,
		error: mocks.marketError,
		getMarket: (coin: string) => {
			if (coin !== COIN) return undefined;
			if (mocks.marketKind === "spot") {
				return {
					kind: "spot",
					name: COIN,
					assetId: mocks.marketAssetId,
					szDecimals: 3,
					ctxIndex: mocks.marketCtxIndex,
				};
			}
			if (mocks.marketKind === "perp") {
				return {
					kind: "perp",
					name: COIN,
					assetId: mocks.marketAssetId,
					szDecimals: 3,
					ctxIndex: mocks.marketCtxIndex,
				};
			}
			return {
				kind: "builderPerp",
				name: COIN,
				assetId: mocks.marketAssetId,
				szDecimals: 3,
				dex: "xyz",
				ctxIndex: mocks.marketCtxIndex,
				dexIndex: mocks.marketDexIndex,
			};
		},
	}),
	useSubscription: () => ({
		status: mocks.twapStatus,
		isStale: mocks.twapStale,
		lastMessageAt: mocks.twapReceivedAt,
		data:
			mocks.twapStatus === "active"
				? {
						states: mocks.activeTwapCoins.map((coin, index) => [
							index + 1,
							{ coin, side: "B", sz: "1", minutes: 30, reduceOnly: false, randomize: true },
						]),
					}
				: undefined,
	}),
	useUserPositions: () => ({
		isLoading: mocks.positionLoading,
		hasError: mocks.positionError,
		isStale: mocks.positionStale,
		receivedAt: mocks.positionReceivedAt,
		getPosition: (coin: string, dex: string) =>
			mocks.livePosition?.coin === coin && mocks.livePosition.dex === dex ? mocks.livePosition : undefined,
	}),
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => mocks.hip3Accepted,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let currentTarget: PositionReverseTarget = createTarget();
let hookValue: ReturnType<typeof usePositionReverseSubmit> | null = null;

let queueItems: OrderQueueItem[] = [];

function Probe() {
	queueItems = useOrderQueue();
	hookValue = usePositionReverseSubmit(currentTarget);
	return null;
}

function createTarget(overrides: Partial<PositionReverseTarget> = {}): PositionReverseTarget {
	return {
		owner: USER,
		env: "Mainnet",
		coin: COIN,
		dex: "xyz",
		assetId: ASSET_ID,
		szDecimals: 3,
		signedPositionSize: "2.500",
		marginMode: "isolated",
		...overrides,
	};
}

function createLivePosition(szi = "2.500", marginMode: "cross" | "isolated" = "isolated"): LivePosition {
	return {
		coin: COIN,
		dex: "xyz",
		szi,
		leverage: { type: marginMode, value: 10 },
	};
}

function createConfirmedResponse(totalSize = "5") {
	return {
		status: "ok",
		response: {
			type: "order",
			data: { statuses: [{ filled: { totalSz: totalSize, avgPx: "99.5", oid: 1 } }] },
		},
	};
}

function createAccountState() {
	return {
		assetPositions: [
			{
				position: {
					coin: COIN,
					szi: mocks.restPositionSize,
					leverage: { type: mocks.restMarginMode, value: 10 },
				},
			},
		],
	};
}

function createMarketState() {
	const universe = Array.from({ length: mocks.freshCtxIndex + 1 }, (_, index) => ({
		name: index === mocks.freshCtxIndex ? COIN : `OTHER-${index}`,
		szDecimals: 3,
	}));
	const contexts = universe.map((_, index) => ({
		markPx: index === mocks.freshCtxIndex ? mocks.restMarkPx : "1",
		midPx: index === mocks.freshCtxIndex ? mocks.restMidPx : null,
	}));
	return [{ universe }, contexts] as const;
}

function currentHook(): ReturnType<typeof usePositionReverseSubmit> {
	if (!hookValue) throw new Error("Expected reverse submit hook");
	return hookValue;
}

describe("usePositionReverseSubmit", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		currentTarget = createTarget();
		mocks.clientKey = USER;
		mocks.env = "Mainnet";
		mocks.marketLoading = false;
		mocks.marketError = null;
		mocks.marketKind = "builderPerp";
		mocks.marketAssetId = ASSET_ID;
		mocks.marketCtxIndex = 31;
		mocks.marketDexIndex = 2;
		mocks.freshCtxIndex = 31;
		mocks.positionLoading = false;
		mocks.positionError = false;
		mocks.positionStale = false;
		mocks.positionReceivedAt = Date.now();
		mocks.twapStatus = "active";
		mocks.twapStale = false;
		mocks.twapReceivedAt = Date.now();
		mocks.activeTwapCoins = [];
		mocks.livePosition = createLivePosition();
		mocks.restPositionSize = "2.500";
		mocks.restMarginMode = "isolated";
		mocks.restMarkPx = "100";
		mocks.restMidPx = null;
		mocks.guardCalls = 0;
		mocks.lockRequest
			.mockReset()
			.mockImplementation(
				async (name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
					callback({ name, mode: "exclusive" } as Lock),
			);
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: { request: mocks.lockRequest } as unknown as LockManager,
		});
		mocks.hip3Accepted = true;
		mocks.geo = { actionsBlocked: false, tradeRestricted: false };
		mocks.betweenExecutionGuards = null;
		mocks.executionGuard = undefined;
		mocks.clearinghouseState.mockReset().mockImplementation(async () => createAccountState());
		mocks.metaAndAssetCtxs.mockReset().mockImplementation(async () => createMarketState());
		mocks.executeOrder.mockReset().mockResolvedValue(createConfirmedResponse());
		mocks.mutateOrder.mockReset().mockImplementation(async (params: OrderParams) => {
			mocks.guardCalls += 1;
			mocks.executionGuard?.(params);
			await mocks.betweenExecutionGuards?.();
			mocks.guardCalls += 1;
			mocks.executionGuard?.(params);
			return mocks.executeOrder(params);
		});
		mocks.resetMutation.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		act(() => {
			for (const item of queueItems) removeOrderQueueItem(item.id);
		});
		act(() => root.unmount());
		container.remove();
		hookValue = null;
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
	});

	it.each(["filled", "ambiguous"] as const)(
		"keeps the actual %s exchange outcome after its dialog owner unmounts",
		async (outcome) => {
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			mocks.executeOrder.mockImplementationOnce(async () => {
				await gate;
				if (outcome === "ambiguous") throw new HttpRequestError({ detail: "Request timed out after 10000 ms" });
				return createConfirmedResponse();
			});
			let submission!: ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]>;
			await act(async () => {
				submission = currentHook().submit();
			});
			expect(mocks.executeOrder).toHaveBeenCalledOnce();
			const queueId = queueItems[0]?.id;
			act(() => root.render(null));
			await act(async () => {
				release();
				await expect(submission).resolves.toMatchObject({
					state: outcome === "filled" ? "confirmed" : "reconciling",
				});
			});
			expect(getOrderQueueItem(queueId)).toMatchObject({
				owner: USER,
				env: "Mainnet",
				status: outcome === "filled" ? "success" : "confirming",
				children: [{ status: outcome === "filled" ? "filled" : "unknown" }],
			});
			expect(hasPendingOrderForAssets("Mainnet", USER, [ASSET_ID])).toBe(outcome === "ambiguous");
			expect(mocks.executeOrder).toHaveBeenCalledOnce();
		},
	);

	it("builds an exclusive non-reduce-only FrontendMarket order from fresh string data", async () => {
		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome?.state).toBe("confirmed");
		expect(queueItems).toHaveLength(1);
		expect(queueItems[0]).toMatchObject({
			owner: USER,
			env: "Mainnet",
			status: "success",
			size: "5",
			countMode: "filled",
			acceptedCount: 1,
			totalCount: 1,
			children: [{ assetId: ASSET_ID, status: "filled", filledSize: "5" }],
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledWith({ user: USER, dex: "xyz" });
		expect(mocks.metaAndAssetCtxs).toHaveBeenCalledWith({ dex: "xyz" });
		expect(mocks.lockRequest).toHaveBeenCalledWith(
			`sairn-order-asset-v1:mainnet:${USER}:${ASSET_ID}`,
			{ mode: "exclusive", ifAvailable: true },
			expect.any(Function),
		);
		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted).toMatchObject({
			grouping: "na",
			orders: [
				{
					a: ASSET_ID,
					b: false,
					p: "99.5",
					s: "5",
					r: false,
					t: { limit: { tif: "FrontendMarket" } },
				},
			],
		});
		expect(currentHook()).toMatchObject({ phase: "idle", isReconciling: false, error: null });
		expect(hasPendingOrderForAssets("Mainnet", USER, [ASSET_ID])).toBe(false);
	});

	it("prefers the fresh REST mid price over the mark price", async () => {
		mocks.restMidPx = "110";
		await act(async () => {
			await currentHook().submit();
		});

		const submitted = mocks.executeOrder.mock.calls[0]?.[0] as OrderParams;
		expect(submitted.orders[0]?.p).toBe("109.45");
	});

	it("rejects a reverse when the position snapshot expires while the market snapshot is pending", async () => {
		let resolveMarket: ((value: ReturnType<typeof createMarketState>) => void) | undefined;
		mocks.metaAndAssetCtxs.mockImplementationOnce(
			() =>
				new Promise<ReturnType<typeof createMarketState>>((resolve) => {
					resolveMarket = resolve;
				}),
		);
		const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(1_000);

		let pending: ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]> | undefined;
		await act(async () => {
			pending = currentHook().submit();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledOnce();
		monotonicNow.mockReturnValue(11_001);
		if (!pending) throw new Error("Expected pending reverse submission");
		let caught: unknown;
		await act(async () => {
			resolveMarket?.(createMarketState());
			try {
				await pending;
			} catch (cause) {
				caught = cause;
			}
		});
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain("Trading data changed");
		expect(mocks.executeOrder).not.toHaveBeenCalled();
	});

	it("rejects a reverse when the market snapshot expires while the position snapshot is pending", async () => {
		let resolveAccount: ((value: ReturnType<typeof createAccountState>) => void) | undefined;
		mocks.clearinghouseState.mockImplementationOnce(
			() =>
				new Promise<ReturnType<typeof createAccountState>>((resolve) => {
					resolveAccount = resolve;
				}),
		);
		const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(1_000);

		let pending: ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]> | undefined;
		await act(async () => {
			pending = currentHook().submit();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(mocks.metaAndAssetCtxs).toHaveBeenCalledOnce();
		monotonicNow.mockReturnValue(11_001);
		if (!pending) throw new Error("Expected pending reverse submission");
		let caught: unknown;
		await act(async () => {
			resolveAccount?.(createAccountState());
			try {
				await pending;
			} catch (cause) {
				caught = cause;
			}
		});
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain("Trading data changed");
		expect(mocks.executeOrder).not.toHaveBeenCalled();
	});

	it.each([
		["restricted", { actionsBlocked: true, tradeRestricted: true }, "Trading is not available in your region"],
		[
			"not yet verified",
			{ actionsBlocked: true, tradeRestricted: false },
			"Unable to verify regional availability. Trading is temporarily unavailable.",
		],
	])("submits no reverse order while trading is %s in the region", async (_case, geo, message) => {
		mocks.geo = geo;
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow(message);
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.executeOrder).not.toHaveBeenCalled();
		const queueId = queueItems.at(-1)?.id;
		await vi.waitFor(() => expect(getOrderQueueItem(queueId)).toMatchObject({ status: "failed" }));
	});

	it.each([
		["restricted", { actionsBlocked: true, tradeRestricted: true }, "Trading is not available in your region"],
		[
			"not yet verified",
			{ actionsBlocked: true, tradeRestricted: false },
			"Unable to verify regional availability. Trading is temporarily unavailable.",
		],
	])(
		"refuses at the SDK boundary when the region turns %s after the last locked check",
		async (_case, geo, message) => {
			mocks.betweenExecutionGuards = async () => {
				await act(async () => {
					mocks.geo = geo;
					for (const listener of mocks.geoListeners) listener();
				});
			};

			let sdkCaught: unknown;
			try {
				await act(async () => {
					await currentHook().submit();
				});
			} catch (cause) {
				sdkCaught = cause;
			}
			expect((sdkCaught as Error).message).toContain(message);
			expect(mocks.guardCalls).toBe(2);
			expect(mocks.executeOrder).not.toHaveBeenCalled();
		},
	);

	it("blocks an active TWAP before the REST refresh", async () => {
		mocks.activeTwapCoins = [COIN];
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Another order for this market is still being confirmed.");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("fails closed when the retained live position receipt has expired before the watchdog runs", async () => {
		mocks.positionReceivedAt = Date.now() - 60_001;
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Failed to load positions");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("fails closed when the retained TWAP receipt has expired before the watchdog runs", async () => {
		mocks.twapReceivedAt = Date.now() - 60_001;
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Trading data changed");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("accepts live position and TWAP receipts at the exact freshness boundary", async () => {
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now);
		mocks.positionReceivedAt = now - 60_000;
		mocks.twapReceivedAt = now - 60_000;
		act(() => root.render(createElement(Probe)));

		await act(async () => {
			await currentHook().submit();
		});
		expect(mocks.executeOrder).toHaveBeenCalledOnce();
	});

	it("blocks a persisted pending TWAP before the REST refresh", async () => {
		getPendingTwapActions().add({
			env: "Mainnet",
			user: USER,
			intent: {
				assetId: ASSET_ID,
				coin: COIN,
				side: "B",
				size: "1",
				minutes: 30,
				reduceOnly: false,
				randomize: true,
			},
			activeBaseline: { ready: true, knownIds: [] },
			historyBaseline: { ready: true, knownIds: [] },
		});

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Another order for this market is still being confirmed.");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("blocks a persisted pending order before the REST refresh", async () => {
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "existing-order",
			children: [{ assetId: ASSET_ID, cloid: "0x00000000000000000000000000000001" }],
		});

		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Another order for this market is still being confirmed.");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("fails closed before REST when the active owner changes", async () => {
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(createElement(Probe)));
		let caught: unknown;
		try {
			await act(async () => {
				await currentHook().submit();
			});
		} catch (cause) {
			caught = cause;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain("Trading data changed");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("fails closed before REST when the HIP-3 disclaimer is not accepted", async () => {
		mocks.hip3Accepted = false;
		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Accept the HIP-3 deployer disclaimer");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("fails closed when the fresh REST position changes direction", async () => {
		mocks.restPositionSize = "-2.500";
		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Trading data changed");
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("requires the fresh REST size to equal the quantity shown for confirmation", async () => {
		mocks.restPositionSize = "3.000";
		await expect(
			act(async () => {
				await currentHook().submit();
			}),
		).rejects.toThrow("Trading data changed");
		expect(mocks.clearinghouseState).toHaveBeenCalledOnce();
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("invalidates an in-flight validation when the dialog unmounts", async () => {
		let resolveAccountState: ((value: { assetPositions: unknown[] }) => void) | undefined;
		mocks.clearinghouseState.mockImplementationOnce(
			() =>
				new Promise<{ assetPositions: unknown[] }>((resolve) => {
					resolveAccountState = resolve;
				}),
		);
		let pending: ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]> | undefined;
		await act(async () => {
			pending = currentHook().submit();
			await Promise.resolve();
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledOnce();

		act(() => root.render(null));
		resolveAccountState?.({
			assetPositions: [{ position: { coin: COIN, szi: "2.500", leverage: { type: "isolated", value: 10 } } }],
		});
		if (!pending) throw new Error("Expected pending reverse submission");
		await expect(pending).rejects.toThrow("Trading data changed");
		expect(mocks.mutateOrder).not.toHaveBeenCalled();
	});

	it("revalidates the exact live size at the SDK execution boundary", async () => {
		mocks.betweenExecutionGuards = async () => {
			mocks.livePosition = createLivePosition("2.400");
		};

		let sdkCaught: unknown;
		try {
			await act(async () => {
				await currentHook().submit();
			});
		} catch (cause) {
			sdkCaught = cause;
		}
		expect(sdkCaught).toBeInstanceOf(Error);
		expect((sdkCaught as Error).message).toContain("Trading data changed");
		expect(mocks.guardCalls).toBe(2);
		expect(mocks.mutateOrder).toHaveBeenCalledOnce();
		expect(mocks.executeOrder).not.toHaveBeenCalled();
	});

	it("keeps a non-filled response in reconciliation and blocks retries", async () => {
		mocks.executeOrder.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ resting: { oid: 5 } }] } },
		});
		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome?.state).toBe("reconciling");
		expect(currentHook()).toMatchObject({
			phase: "reconciling",
			isReconciling: true,
			error: "Order submitted. Confirming exchange status; do not retry.",
		});
		expect(hasPendingOrderForAssets("Mainnet", USER, [ASSET_ID])).toBe(true);
		expect(queueItems).toHaveLength(1);
		expect(queueItems[0]).toMatchObject({ owner: USER, env: "Mainnet", status: "confirming", countMode: "filled" });
		const restCalls = mocks.clearinghouseState.mock.calls.length;
		await act(async () => {
			expect(await currentHook().submit()).toEqual({ state: "blocked" });
		});
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(restCalls);
	});

	it("reports the blocked outcome when another tab holds the asset lock", async () => {
		mocks.lockRequest.mockImplementationOnce(
			async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
				callback(null),
		);
		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit();
		});

		expect(outcome).toEqual({ state: "blocked" });
		expect(currentHook()).toMatchObject({
			phase: "idle",
			error: "Another order for this market is still being confirmed.",
		});
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	it("retranslates an existing coordinated block when the locale changes", async () => {
		mocks.lockRequest.mockImplementationOnce(
			async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
				callback(null),
		);

		await act(async () => {
			await currentHook().submit();
		});
		expect(currentHook().error).toBe(BLOCKED_MESSAGE);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(currentHook().error).toBe(BLOCKED_MESSAGE_AR);
		expect(currentHook().phase).toBe("idle");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
	});

	describe("when the fresh snapshot returns long after the confirmation click", () => {
		const NOT_SENT = "The checks before this request took too long. Nothing was signed or sent. Try again.";
		let snapshotDelayMs = 0;
		let heldLocks = new Set<string>();

		async function waitForSnapshot(): Promise<void> {
			if (snapshotDelayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, snapshotDelayMs));
		}

		beforeEach(() => {
			vi.useFakeTimers();
			snapshotDelayMs = 0;
			heldLocks = new Set();
			mocks.lockRequest.mockImplementation(
				async (
					name: string,
					_options: LockOptions,
					callback: (lock: Lock | null) => unknown | PromiseLike<unknown>,
				) => {
					heldLocks.add(name);
					try {
						return await callback({ name, mode: "exclusive" } as Lock);
					} finally {
						heldLocks.delete(name);
					}
				},
			);
			mocks.clearinghouseState.mockImplementation(async () => {
				await waitForSnapshot();
				return createAccountState();
			});
			mocks.metaAndAssetCtxs.mockImplementation(async () => {
				await waitForSnapshot();
				return createMarketState();
			});
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("sends no reverse order and reports a definite failure when it takes 16 seconds", async () => {
			snapshotDelayMs = 16_000;
			let submission!: Promise<unknown>;
			await act(async () => {
				submission = currentHook()
					.submit()
					.catch((error: unknown) => error);
			});
			expect(queueItems[0]).toMatchObject({ status: "pending" });
			expect(heldLocks.size).toBe(1);

			let failure: unknown;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(16_000);
				failure = await submission;
			});

			expect(failure).toMatchObject({ name: "ExchangeActionDeadlineError" });
			expect(mocks.mutateOrder).not.toHaveBeenCalled();
			expect(mocks.executeOrder).not.toHaveBeenCalled();
			expect(heldLocks.size).toBe(0);
			expect(hasPendingOrderForAssets("Mainnet", USER, [ASSET_ID])).toBe(false);
			expect(queueItems).toHaveLength(1);
			const failed = queueItems[0];
			if (!failed) throw new Error("Expected the reverse notification");
			expect(failed).toMatchObject({
				status: "failed",
				acceptedCount: 0,
				totalCount: 1,
				children: [{ assetId: ASSET_ID, status: "rejected" }],
			});
			expect(getOrderNotificationCopy(failed, (descriptor) => i18n._(descriptor), getNumberFormatters())).toMatchObject(
				{ summary: `Reverse Position · ${COIN} · Failed`, error: NOT_SENT },
			);
			expect(currentHook()).toMatchObject({ phase: "idle", isReconciling: false, error: NOT_SENT });

			snapshotDelayMs = 0;
			let retry: Awaited<ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]>> | undefined;
			await act(async () => {
				retry = await currentHook().submit();
			});
			expect(retry?.state).toBe("confirmed");
			expect(mocks.executeOrder).toHaveBeenCalledOnce();
		});

		it("still submits the reverse order once when it takes 14 seconds", async () => {
			snapshotDelayMs = 14_000;
			let submission!: ReturnType<ReturnType<typeof usePositionReverseSubmit>["submit"]>;
			await act(async () => {
				submission = currentHook().submit();
			});
			expect(mocks.mutateOrder).not.toHaveBeenCalled();

			let outcome: Awaited<typeof submission> | undefined;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(14_000);
				outcome = await submission;
			});

			expect(outcome?.state).toBe("confirmed");
			expect(mocks.executeOrder).toHaveBeenCalledOnce();
			expect(heldLocks.size).toBe(0);
			expect(queueItems).toHaveLength(1);
			expect(queueItems[0]).toMatchObject({ status: "success", acceptedCount: 1, totalCount: 1 });
			expect(currentHook()).toMatchObject({ phase: "idle", error: null });
		});
	});
});
