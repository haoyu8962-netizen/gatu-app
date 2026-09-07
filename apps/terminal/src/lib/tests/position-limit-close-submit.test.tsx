// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type PositionLimitCloseTarget,
	usePositionLimitCloseSubmit,
} from "@/hooks/trade/use-position-limit-close-submit";
import { createI18nRoot } from "./harness/react";

const USER = "0x1111111111111111111111111111111111111111";
const COIN = "xyz:CXMT";
const ASSET_ID = 120_031;
const RECONCILING_MESSAGE = "Order submitted. Confirming exchange status; do not retry.";
const RECONCILING_MESSAGE_AR = "تم إرسال الطلب. جارٍ تأكيد حالة البورصة؛ لا تُعد المحاولة.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(RECONCILING_MESSAGE)]: RECONCILING_MESSAGE_AR,
};

interface OrderParams {
	grouping: "na" | "normalTpsl" | "positionTpsl";
	orders: Array<{
		a: number;
		b: boolean;
		p: string;
		s: string;
		r: boolean;
		t: { limit: { tif: string } };
	}>;
}

interface LivePosition {
	coin: string;
	dex: string;
	szi: string;
	leverage: { type: "cross" | "isolated"; value: number };
}

const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	marketLoading: false,
	marketError: null as Error | null,
	marketAssetId: 120_031,
	marketCtxIndex: 31,
	marketDexIndex: 2,
	positionLoading: false,
	positionError: false,
	positionStale: false,
	livePosition: null as LivePosition | null,
	restPositionSize: "2.500",
	restMarginMode: "isolated" as "cross" | "isolated",
	clearinghouseState: vi.fn(),
	metaAndAssetCtxs: vi.fn(),
	submitOrder: vi.fn(),
	resetTrackedOrder: vi.fn(),
	executionGuard: undefined as ((params: OrderParams) => void) | undefined,
	hip3Accepted: true,
}));

vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: (options?: { executionGuard?: (params: OrderParams) => void }) => {
		mocks.executionGuard = options?.executionGuard;
		return {
			submitOrder: mocks.submitOrder,
			isPending: false,
			error: null,
			reset: mocks.resetTrackedOrder,
		};
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	parseAssetId: (assetId: number) => {
		if (assetId >= 100_000) {
			const adjusted = assetId - 100_000;
			return { kind: "builderPerp", dexIndex: Math.floor(adjusted / 10_000), index: adjusted % 10_000 };
		}
		if (assetId >= 10_000) return { kind: "spot", index: assetId - 10_000 };
		return { kind: "perp", index: assetId };
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
		getMarket: (coin: string) =>
			coin === COIN
				? {
						kind: "builderPerp",
						name: COIN,
						assetId: mocks.marketAssetId,
						szDecimals: 3,
						dex: "xyz",
						ctxIndex: mocks.marketCtxIndex,
						dexIndex: mocks.marketDexIndex,
					}
				: undefined,
	}),
	useUserPositions: () => ({
		isLoading: mocks.positionLoading,
		hasError: mocks.positionError,
		isStale: mocks.positionStale,
		getPosition: (coin: string, dex: string) =>
			mocks.livePosition?.coin === coin && mocks.livePosition.dex === dex ? mocks.livePosition : null,
	}),
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => mocks.hip3Accepted,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const target: PositionLimitCloseTarget = {
	owner: USER,
	env: "Mainnet",
	coin: COIN,
	dex: "xyz",
	assetId: ASSET_ID,
	szDecimals: 3,
	signedPositionSize: "2.500",
	marginMode: "isolated",
};

let hookValue: ReturnType<typeof usePositionLimitCloseSubmit> | null = null;

function Probe() {
	hookValue = usePositionLimitCloseSubmit(target);
	return null;
}

function currentHook(): ReturnType<typeof usePositionLimitCloseSubmit> {
	if (!hookValue) throw new Error("Expected limit close submit hook");
	return hookValue;
}

function createLivePosition(szi = "2.500", marginMode: "cross" | "isolated" = "isolated"): LivePosition {
	return {
		coin: COIN,
		dex: "xyz",
		szi,
		leverage: { type: marginMode, value: 10 },
	};
}

function createConfirmedRestingResponse() {
	return {
		state: "confirmed" as const,
		result: {
			status: "ok",
			response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } },
		},
	};
}

describe("usePositionLimitCloseSubmit", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.clientKey = USER;
		mocks.env = "Mainnet";
		mocks.marketLoading = false;
		mocks.marketError = null;
		mocks.marketAssetId = ASSET_ID;
		mocks.marketCtxIndex = 31;
		mocks.marketDexIndex = 2;
		mocks.positionLoading = false;
		mocks.positionError = false;
		mocks.positionStale = false;
		mocks.livePosition = createLivePosition();
		mocks.restPositionSize = "2.500";
		mocks.restMarginMode = "isolated";
		mocks.hip3Accepted = true;
		mocks.executionGuard = undefined;
		mocks.clearinghouseState.mockReset().mockImplementation(async () => ({
			assetPositions: [
				{
					position: {
						coin: COIN,
						szi: mocks.restPositionSize,
						leverage: { type: mocks.restMarginMode, value: 10 },
					},
				},
			],
		}));
		mocks.metaAndAssetCtxs.mockReset().mockImplementation(async () => {
			const universe = Array.from({ length: 32 }, (_, index) => ({
				name: index === 31 ? COIN : `OTHER-${index}`,
				szDecimals: 3,
			}));
			return [{ universe }, universe.map(() => ({ markPx: "100" }))];
		});
		mocks.submitOrder.mockReset().mockImplementation(async (params: OrderParams) => {
			mocks.executionGuard?.(params);
			return createConfirmedRestingResponse();
		});
		mocks.resetTrackedOrder.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	it("submits an exact-string reduce-only GTC order after refreshing the position", async () => {
		let outcome: Awaited<ReturnType<ReturnType<typeof usePositionLimitCloseSubmit>["submit"]>> | undefined;
		await act(async () => {
			outcome = await currentHook().submit({ price: "123.45", size: "1.234" });
		});

		expect(outcome?.state).toBe("confirmed");
		expect(mocks.clearinghouseState).toHaveBeenCalledWith({ user: USER, dex: "xyz" });
		expect(mocks.metaAndAssetCtxs).toHaveBeenCalledWith({ dex: "xyz" });
		expect(mocks.submitOrder).toHaveBeenCalledWith(
			{
				grouping: "na",
				orders: [
					{
						a: ASSET_ID,
						b: false,
						p: "123.45",
						s: "1.234",
						r: true,
						t: { limit: { tif: "Gtc" } },
					},
				],
			},
			{
				confirmationMode: "accepted",
				exclusiveAssetLock: false,
				riskContext: { marketKind: "perp", marginMode: "isolated" },
			},
		);
		expect(currentHook().phase).toBe("idle");
		expect(currentHook().error).toBeNull();
	});

	it("fails closed before REST or Exchange when the active owner changes", async () => {
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		act(() => root.render(createElement(Probe)));

		await expect(
			act(async () => {
				await currentHook().submit({ price: "100", size: "1" });
			}),
		).rejects.toThrow("Trading data changed");
		expect(mocks.clearinghouseState).not.toHaveBeenCalled();
		expect(mocks.submitOrder).not.toHaveBeenCalled();
	});

	it("maps domain validation failures to an existing localized UI message", async () => {
		await expect(
			act(async () => {
				await currentHook().submit({ price: "0.0001", size: "1" });
			}),
		).rejects.toThrow("Enter limit price");
		expect(mocks.submitOrder).not.toHaveBeenCalled();
	});

	it("rejects a size larger than either the live or freshly refreshed position", async () => {
		mocks.restPositionSize = "0.750";

		await expect(
			act(async () => {
				await currentHook().submit({ price: "100", size: "1.000" });
			}),
		).rejects.toThrow("Trading data changed");
		expect(mocks.submitOrder).not.toHaveBeenCalled();
		expect(currentHook().phase).toBe("idle");
	});

	it("rejects when the freshly refreshed position has changed direction", async () => {
		mocks.restPositionSize = "-2.500";

		await expect(
			act(async () => {
				await currentHook().submit({ price: "100", size: "1" });
			}),
		).rejects.toThrow("No active positions");
		expect(mocks.submitOrder).not.toHaveBeenCalled();
	});

	it("blocks a duplicate invocation while the first submit is validating", async () => {
		let releaseFreshPosition!: () => void;
		const freshPositionGate = new Promise<void>((resolve) => {
			releaseFreshPosition = resolve;
		});
		mocks.clearinghouseState.mockImplementationOnce(async () => {
			await freshPositionGate;
			return {
				assetPositions: [
					{
						position: {
							coin: COIN,
							szi: "2.500",
							leverage: { type: "isolated", value: 10 },
						},
					},
				],
			};
		});

		let firstSubmit!: ReturnType<ReturnType<typeof usePositionLimitCloseSubmit>["submit"]>;
		await act(async () => {
			firstSubmit = currentHook().submit({ price: "100", size: "1" });
			await Promise.resolve();
		});
		let duplicateState: string | undefined;
		await act(async () => {
			duplicateState = (await currentHook().submit({ price: "100", size: "1" })).state;
		});
		expect(duplicateState).toBe("blocked");
		expect(mocks.clearinghouseState).toHaveBeenCalledTimes(1);

		releaseFreshPosition();
		await act(async () => {
			await firstSubmit;
		});
		expect(mocks.submitOrder).toHaveBeenCalledTimes(1);
	});

	it("keeps reconciliation terminal and prevents retrying the ambiguous submit", async () => {
		mocks.submitOrder.mockResolvedValueOnce({ state: "reconciling", submissionId: "submission-1" });

		await act(async () => {
			const outcome = await currentHook().submit({ price: "100", size: "1" });
			expect(outcome.state).toBe("reconciling");
		});
		expect(currentHook().phase).toBe("reconciling");
		expect(currentHook().isReconciling).toBe(true);
		expect(currentHook().error).toContain("do not retry");

		let retryState: string | undefined;
		await act(async () => {
			retryState = (await currentHook().submit({ price: "100", size: "1" })).state;
		});
		expect(retryState).toBe("blocked");
		expect(mocks.submitOrder).toHaveBeenCalledTimes(1);
	});

	it("retranslates an existing reconciliation state when the locale changes", async () => {
		mocks.submitOrder.mockResolvedValueOnce({ state: "reconciling", submissionId: "submission-1" });

		await act(async () => {
			await currentHook().submit({ price: "100", size: "1" });
		});
		expect(currentHook().error).toBe(RECONCILING_MESSAGE);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(currentHook().error).toBe(RECONCILING_MESSAGE_AR);
		expect(currentHook().phase).toBe("reconciling");
		expect(mocks.submitOrder).toHaveBeenCalledOnce();
	});

	it("surfaces a coordinated blocked result without leaving the hook pending", async () => {
		mocks.submitOrder.mockResolvedValueOnce({ state: "blocked" });

		let outcomeState: string | undefined;
		await act(async () => {
			outcomeState = (await currentHook().submit({ price: "100", size: "1" })).state;
		});

		expect(outcomeState).toBe("blocked");
		expect(currentHook().phase).toBe("idle");
		expect(currentHook().error).toContain("Another order");
	});

	it("rejects a mutated order at the final execution guard", async () => {
		mocks.submitOrder.mockImplementationOnce(async (params: OrderParams) => {
			mocks.executionGuard?.({
				...params,
				orders: params.orders.map((order) => ({ ...order, r: false })),
			});
			return createConfirmedRestingResponse();
		});

		await expect(
			act(async () => {
				await currentHook().submit({ price: "100", size: "1" });
			}),
		).rejects.toThrow("Trading data changed");
		expect(currentHook().phase).toBe("idle");
	});
});
