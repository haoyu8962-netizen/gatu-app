/** @vitest-environment jsdom */

import { act, StrictMode, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	MobileMarketBarProvider,
	useMobileMarketBarSnapshot,
} from "@/components/trade/mobile/mobile-market-bar-provider";

const NOW = 1_000_000;
const FRESH_RECEIVED_AT = NOW - 100;

const mocks = vi.hoisted(() => ({
	allMidsPrice: "100.25" as string | undefined,
	allMidsReceivedAt: 999_900 as number | undefined,
	allMidsMaxStaleMs: undefined as number | undefined,
	allMidsStale: false,
	allMidsStatus: "active" as "active" | "idle" | "subscribing" | "error",
	bboMidPx: "100.25" as string | undefined,
	bboSnapshot: { revision: 0 } as object | undefined,
	bboSubscriptions: 0,
	bboUnsubscriptions: 0,
	ctxSubscriptions: 0,
	ctxUnsubscriptions: 0,
	env: "Mainnet",
	reconnectListener: undefined as (() => void) | undefined,
	market: {
		kind: "perp",
		name: "BTC",
		pairName: "BTC-USDC",
		markPx: "100.0",
		midPx: "100.25",
		oraclePx: "99.9",
		prevDayPx: "99.0",
		dayNtlVlm: "1000000",
		openInterest: "100",
		funding: "0.0001",
		szDecimals: 5,
		markPriceStatus: "success",
		markPriceReceivedAt: 999_900,
	},
	perpReceipt: undefined as { key: string; event: { coin: string; ctx: Record<string, unknown> } } | undefined,
	perpCtxCoin: "BTC",
	perpCtxIsStale: false,
	perpCtxReceivedAt: 999_900 as number | undefined,
	perpCtxStatus: "active" as "active" | "idle" | "subscribing" | "error",
	perpCtx: {
		markPx: "100.0",
		midPx: "100.25" as string | null,
		oraclePx: "99.9",
		prevDayPx: "99.0",
		dayNtlVlm: "1000000",
		openInterest: "100",
		funding: "0.0001",
	},
	spotCtxCoin: "@1",
	spotCtxIsStale: false,
	spotCtxReceivedAt: 999_900 as number | undefined,
	spotCtxStatus: "active" as "active" | "idle" | "subscribing" | "error",
	spotCtx: {
		markPx: "0.14",
		midPx: "0.209265" as string | null,
		prevDayPx: "0.20",
		dayNtlVlm: "1000000",
		circulatingSupply: "10000000",
	},
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: (coin: string | undefined) => {
		useEffect(() => {
			if (!coin) return;
			mocks.bboSubscriptions += 1;
			return () => {
				mocks.bboUnsubscriptions += 1;
			};
		}, [coin]);
		return {
			midPx: coin ? mocks.bboMidPx : undefined,
			isStale: false,
			snapshot: coin ? mocks.bboSnapshot : undefined,
			status: coin ? "active" : "idle",
		};
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	subscribeWsReconnect: (listener: () => void) => {
		mocks.reconnectListener = listener;
		return () => {
			if (mocks.reconnectListener === listener) mocks.reconnectListener = undefined;
		};
	},
	useHyperliquid: () => ({ env: mocks.env, isTestnet: mocks.env === "Testnet" }),
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	useSubscription: (method: string, _params: unknown, options: { enabled?: boolean; maxStaleMs?: number } = {}) => {
		useEffect(() => {
			if (!options.enabled || !["activeAssetCtx", "activeSpotAssetCtx"].includes(method)) return;
			mocks.ctxSubscriptions += 1;
			return () => {
				mocks.ctxUnsubscriptions += 1;
			};
		}, [method, options.enabled]);
		if (options.enabled === false) {
			return { data: undefined, isStale: false, lastMessageAt: undefined, status: "idle" };
		}
		if (method === "allMids") {
			mocks.allMidsMaxStaleMs = options.maxStaleMs;
			return {
				data: { mids: { [mocks.market.name]: mocks.allMidsPrice } },
				isStale: mocks.allMidsStale,
				lastMessageAt: mocks.allMidsReceivedAt,
				status: mocks.allMidsStatus,
			};
		}
		if (method === "activeAssetCtx") {
			const key = JSON.stringify([mocks.perpCtxCoin, mocks.perpCtx]);
			if (mocks.perpReceipt?.key !== key)
				mocks.perpReceipt = { key, event: { coin: mocks.perpCtxCoin, ctx: { ...mocks.perpCtx } } };
			return {
				data: mocks.perpReceipt.event,
				isStale: mocks.perpCtxIsStale,
				lastMessageAt: mocks.perpCtxReceivedAt,
				status: mocks.perpCtxStatus,
			};
		}
		if (method === "activeSpotAssetCtx") {
			return {
				data: { coin: mocks.spotCtxCoin, ctx: mocks.spotCtx },
				isStale: mocks.spotCtxIsStale,
				lastMessageAt: mocks.spotCtxReceivedAt,
				status: mocks.spotCtxStatus,
			};
		}
		return { data: undefined, isStale: false, lastMessageAt: undefined, status: "idle" };
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function PriceProbe({ pane }: { pane: string }) {
	const { displayPrice, priceFlash, priceSource, marketMarkPx, dayNtlVlm } = useMobileMarketBarSnapshot();
	const initialSequenceRef = useRef(priceFlash.sequence);
	const visibleDirection = priceFlash.sequence > initialSequenceRef.current ? priceFlash.direction : null;
	return (
		<output
			data-pane={pane}
			data-source={priceSource ?? "none"}
			data-direction={visibleDirection ?? "none"}
			data-mark={marketMarkPx ?? "none"}
			data-volume={dayNtlVlm ?? "none"}
		>
			{displayPrice ?? "—"}
		</output>
	);
}

type MobilePane = "markets" | "trade" | "account";

function Harness({ pane, revision }: { pane: MobilePane; revision: number }) {
	return (
		<MobileMarketBarProvider enabled={pane !== "account"}>
			{pane !== "account" && <PriceProbe key={pane} pane={pane} />}
			<span data-revision={revision} hidden />
		</MobileMarketBarProvider>
	);
}

describe("MobileMarketBarProvider", () => {
	let container: HTMLDivElement;
	let renderRevision: number;
	let root: Root;

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		mocks.allMidsPrice = "100.25";
		mocks.allMidsReceivedAt = FRESH_RECEIVED_AT;
		mocks.allMidsMaxStaleMs = undefined;
		mocks.allMidsStale = false;
		mocks.allMidsStatus = "active";
		mocks.perpCtx.midPx = "100.25";
		mocks.bboSubscriptions = 0;
		mocks.bboUnsubscriptions = 0;
		mocks.ctxSubscriptions = 0;
		mocks.ctxUnsubscriptions = 0;
		mocks.env = "Mainnet";
		mocks.reconnectListener = undefined;
		mocks.perpCtxCoin = "BTC";
		mocks.perpCtxIsStale = false;
		mocks.perpCtxReceivedAt = FRESH_RECEIVED_AT;
		mocks.perpCtxStatus = "active";
		mocks.spotCtxCoin = "@1";
		mocks.spotCtxIsStale = false;
		mocks.spotCtxReceivedAt = FRESH_RECEIVED_AT;
		mocks.spotCtxStatus = "active";
		renderRevision = 0;
		Object.assign(mocks.market, {
			kind: "perp",
			name: "BTC",
			pairName: "BTC-USDC",
			markPx: "100.0",
			midPx: "100.25",
			oraclePx: "99.9",
			prevDayPx: "99.0",
			dayNtlVlm: "1000000",
			openInterest: "100",
			funding: "0.0001",
			markPriceStatus: "success",
			markPriceReceivedAt: FRESH_RECEIVED_AT,
		});
		Object.assign(mocks.perpCtx, {
			markPx: "100.0",
			midPx: "100.25",
			oraclePx: "99.9",
			prevDayPx: "99.0",
			dayNtlVlm: "1000000",
			openInterest: "100",
			funding: "0.0001",
		});
		Object.assign(mocks.spotCtx, {
			markPx: "0.14",
			midPx: "0.209265",
			prevDayPx: "0.20",
			dayNtlVlm: "1000000",
			circulatingSupply: "10000000",
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	function render(pane: MobilePane) {
		renderRevision += 1;
		act(() => root.render(<Harness pane={pane} revision={renderRevision} />));
		return container.querySelector<HTMLOutputElement>("output");
	}

	it("keeps the context price across tab handoff without BBO or allMids subscriptions", () => {
		let price = render("markets");
		expect(price?.textContent).toBe("100.25");
		expect(price?.dataset.source).toBe("assetCtxMid");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(0);
		expect(mocks.bboUnsubscriptions).toBe(0);
		expect(mocks.allMidsMaxStaleMs).toBeUndefined();

		price = render("trade");
		expect(price?.textContent).toBe("100.25");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(0);
		expect(mocks.bboUnsubscriptions).toBe(0);
	});

	it("releases market streams on Account and establishes a fresh no-flash baseline on return", () => {
		let price = render("markets");
		expect(price?.textContent).toBe("100.25");
		expect(mocks.bboSubscriptions).toBe(0);
		expect(mocks.bboUnsubscriptions).toBe(0);

		price = render("account");
		expect(price).toBeNull();
		expect(mocks.bboSubscriptions).toBe(0);
		expect(mocks.bboUnsubscriptions).toBe(0);
		expect(mocks.reconnectListener).toBeUndefined();

		mocks.perpCtx.midPx = "101.0";
		price = render("trade");
		expect(price?.textContent).toBe("101.0");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(0);
		expect(mocks.bboUnsubscriptions).toBe(0);
		expect(mocks.reconnectListener).toBeTypeOf("function");
	});

	it("balances the stable subscription lifecycle under Strict Mode", () => {
		act(() =>
			root.render(
				<StrictMode>
					<Harness pane="markets" revision={1} />
				</StrictMode>,
			),
		);
		expect(mocks.bboSubscriptions).toBe(0);
		expect(mocks.ctxSubscriptions).toBeGreaterThan(0);
		expect(mocks.ctxUnsubscriptions).toBe(mocks.ctxSubscriptions - 1);

		act(() => root.unmount());
		expect(mocks.ctxUnsubscriptions).toBe(mocks.ctxSubscriptions);
		root = createRoot(container);
	});

	it("animates only consecutive ticks from the same identity and source", () => {
		let price = render("markets");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtx.midPx = "101.0";
		price = render("markets");
		expect(price?.dataset.direction).toBe("up");

		mocks.perpCtx.midPx = null;
		mocks.perpCtx.markPx = "101.5";
		price = render("markets");
		expect(price?.dataset.source).toBe("assetCtxMark");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtx.markPx = "101.25";
		price = render("markets");
		expect(price?.dataset.direction).toBe("down");

		mocks.perpCtx.midPx = "2000";
		mocks.market.name = "ETH";
		mocks.perpCtxCoin = "ETH";
		price = render("markets");
		expect(price?.textContent).toBe("2000");
		expect(price?.dataset.direction).toBe("none");

		mocks.env = "Testnet";
		mocks.perpCtx.midPx = "2001";
		price = render("markets");
		expect(price?.dataset.direction).toBe("none");
	});

	it("does not animate when only the decimal representation changes", () => {
		mocks.perpCtx.midPx = "101.0";
		let price = render("markets");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtx.midPx = "101.00";
		price = render("markets");
		expect(price?.textContent).toBe("101.00");
		expect(price?.dataset.direction).toBe("none");
	});

	it("starts a new animation baseline after a websocket reconnect", () => {
		let price = render("markets");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtx.midPx = "101.0";
		price = render("markets");
		expect(price?.dataset.direction).toBe("up");

		act(() => mocks.reconnectListener?.());
		price = container.querySelector<HTMLOutputElement>("output");
		expect(price?.textContent).toBe("101.0");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtx.midPx = "101.5";
		price = render("markets");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtx.midPx = "102.0";
		price = render("markets");
		expect(price?.dataset.direction).toBe("up");
	});

	it("does not use stale allMids data ahead of a fresh asset context mid", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = "101.0";
		mocks.allMidsStale = true;
		mocks.perpCtx.midPx = "100.25";

		const price = render("markets");
		expect(price?.textContent).toBe("100.25");
		expect(price?.dataset.source).toBe("assetCtxMid");
		expect(price?.dataset.direction).toBe("none");
	});

	it.each([
		{ reason: "wrong coin", coin: "ETH", status: "active", isStale: false, receivedAt: FRESH_RECEIVED_AT },
		{ reason: "stale state", coin: "BTC", status: "active", isStale: true, receivedAt: FRESH_RECEIVED_AT },
		{ reason: "warming state", coin: "BTC", status: "subscribing", isStale: false, receivedAt: FRESH_RECEIVED_AT },
		{ reason: "missing receipt", coin: "BTC", status: "active", isStale: false, receivedAt: undefined },
		{ reason: "expired receipt", coin: "BTC", status: "active", isStale: false, receivedAt: NOW - 10_001 },
	] as const)("rejects a retained asset context with $reason", ({ coin, status, isStale, receivedAt }) => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = undefined;
		mocks.perpCtxCoin = coin;
		mocks.perpCtxStatus = status;
		mocks.perpCtxIsStale = isStale;
		mocks.perpCtxReceivedAt = receivedAt;
		mocks.perpCtx.midPx = "999";
		mocks.perpCtx.dayNtlVlm = "999";

		const price = render("markets");
		expect(price?.textContent).toBe("—");
		expect(price?.dataset.source).toBe("none");
		expect(price?.dataset.mark).toBe("100.0");
		expect(price?.dataset.volume).toBe("none");
		expect(price?.dataset.direction).toBe("none");
	});

	it("keeps an old market context out until the exact new receipt establishes a no-flash baseline", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = undefined;
		let price = render("markets");
		expect(price?.textContent).toBe("100.25");
		expect(price?.dataset.volume).toBe("1000000");

		Object.assign(mocks.market, {
			name: "ETH",
			pairName: "ETH-USDC",
			markPx: "2000",
			markPriceReceivedAt: FRESH_RECEIVED_AT,
		});
		price = render("markets");
		expect(price?.textContent).toBe("—");
		expect(price?.dataset.mark).toBe("2000");
		expect(price?.dataset.volume).toBe("none");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtxCoin = "ETH";
		Object.assign(mocks.perpCtx, {
			markPx: "2001",
			midPx: "2001",
			dayNtlVlm: "2000000",
		});
		price = render("markets");
		expect(price?.textContent).toBe("2001");
		expect(price?.dataset.volume).toBe("2000000");
		expect(price?.dataset.direction).toBe("none");

		mocks.perpCtx.midPx = "2002";
		price = render("markets");
		expect(price?.dataset.direction).toBe("up");
	});

	it("uses the same current context mark when the midpoint is null", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = undefined;
		mocks.perpCtx.midPx = null;
		mocks.perpCtx.markPx = "177.06";
		mocks.market.markPx = "177.06";

		const price = render("markets");
		expect(price?.textContent).toBe("177.06");
		expect(price?.dataset.source).toBe("assetCtxMark");
		expect(price?.dataset.direction).toBe("none");
	});

	it("uses the spot context midpoint with an explicit mark fallback", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = undefined;
		Object.assign(mocks.market, {
			kind: "spot",
			name: "@1",
			pairName: "PURR-USDC",
			markPx: "0.14",
			midPx: "0.209265",
		});
		mocks.spotCtx.midPx = "0.209265";
		mocks.spotCtx.markPx = "0.14";

		let price = render("markets");
		expect(price?.textContent).toBe("0.209265");
		expect(price?.dataset.source).toBe("assetCtxMid");
		expect(price?.dataset.direction).toBe("none");

		mocks.spotCtx.midPx = null;
		price = render("markets");
		expect(price?.textContent).toBe("0.14");
		expect(price?.dataset.source).toBe("assetCtxMark");
		expect(price?.dataset.direction).toBe("none");
	});

	it("rejects a retained spot context from another market", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = undefined;
		Object.assign(mocks.market, {
			kind: "spot",
			name: "@1",
			pairName: "PURR-USDC",
			markPx: "0.14",
			midPx: "0.209265",
		});
		mocks.spotCtxCoin = "@2";
		mocks.spotCtx.midPx = "999";
		mocks.spotCtx.dayNtlVlm = "999";

		const price = render("markets");
		expect(price?.textContent).toBe("—");
		expect(price?.dataset.source).toBe("none");
		expect(price?.dataset.mark).toBe("0.14");
		expect(price?.dataset.volume).toBe("none");
		expect(price?.dataset.direction).toBe("none");
	});
});
