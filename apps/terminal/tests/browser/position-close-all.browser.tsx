import { HttpRequestError } from "@nktkas/hyperliquid";
import { create } from "zustand";
import type { Position } from "@/lib/hyperliquid";

export const OWNER = "0x1111111111111111111111111111111111111111";
const markets = [
	{ kind: "perp", name: "HYPE", shortName: "HYPE", assetId: 0, ctxIndex: 0, szDecimals: 2 },
	{
		kind: "builderPerp",
		name: "xyz:TEST",
		shortName: "TEST",
		assetId: 100_000,
		ctxIndex: 0,
		szDecimals: 2,
		dex: "xyz",
		dexIndex: 0,
		quoteToken: { index: 1, name: "USDE", displayName: "USDE" },
	},
] as const;

function initialPositions(): Position[] {
	return markets.map((market, index) => ({
		coin: market.name,
		dex: index === 0 ? "" : "xyz",
		szi: index === 0 ? "1.25" : "-2.5",
		entryPx: "95",
		positionValue: index === 0 ? "125" : "250",
		unrealizedPnl: "5",
		returnOnEquity: "0.5",
		liquidationPx: "85",
		marginUsed: "12.5",
		maxLeverage: 20,
		leverage: { type: "cross", value: 10 },
		cumFunding: { allTime: "0", sinceOpen: "0", sinceChange: "0" },
	}));
}

interface Order {
	a: number;
	b: boolean;
	p: string;
	s: string;
	r: boolean;
	t: { limit: { tif: string } };
	c?: string;
}
interface OrderParams {
	orders: Order[];
	grouping?: string | { p: number };
}
interface FixtureState {
	connected: boolean;
	owner: string;
	clientKey: string;
	env: "Mainnet" | "Testnet";
	status: "ready" | "loading" | "stale" | "error";
	marketsReady: boolean;
	positions: Position[];
	hold: "preflight" | "exchange" | null;
	outcome: "filled" | "partial" | "ambiguous";
	orders: OrderParams[];
	settled: boolean;
	activeTwap: boolean;
	hip3Accepted: boolean;
}

export const useCloseAllFixture = create<FixtureState>(() => ({
	connected: true,
	owner: OWNER,
	clientKey: OWNER,
	env: "Mainnet",
	status: "ready",
	marketsReady: true,
	positions: initialPositions(),
	hold: null,
	outcome: "filled",
	orders: [],
	settled: false,
	activeTwap: false,
	hip3Accepted: true,
}));
export const setCloseAllFixture = useCloseAllFixture.setState;
let waiting: Array<() => void> = [];

async function waitAt(stage: "preflight" | "exchange") {
	if (useCloseAllFixture.getState().hold === stage) await new Promise<void>((resolve) => waiting.push(resolve));
}
export function releaseCloseAllFixture() {
	setCloseAllFixture({ hold: null });
	const resolvers = waiting;
	waiting = [];
	for (const resolve of resolvers) resolve();
}

const info = {
	async clearinghouseState({ dex }: { dex: string }) {
		await waitAt("preflight");
		const state = useCloseAllFixture.getState();
		return {
			assetPositions: state.positions
				.filter((position) => position.dex === dex)
				.map((position) => ({
					position: { ...position, szi: state.settled && state.outcome === "filled" ? "0" : position.szi },
				})),
		};
	},
	async metaAndAssetCtxs({ dex }: { dex: string }) {
		await waitAt("preflight");
		return [
			{ universe: [{ name: dex ? "xyz:TEST" : "HYPE", szDecimals: 2 }], collateralToken: dex ? 1 : 0 },
			[{ markPx: "100", midPx: "100" }],
		];
	},
};

export function useHyperliquid() {
	const { clientKey, env } = useCloseAllFixture();
	return { clientKey, env, info };
}
export function useWalletSession() {
	const { owner, connected } = useCloseAllFixture();
	return { address: connected ? owner : undefined, isConnected: connected };
}
export function useUserPositions() {
	const { positions, status } = useCloseAllFixture();
	return {
		positions,
		isLoading: status === "loading",
		hasError: status === "error",
		isStale: status === "stale",
		getPosition: (coin: string, dex = "") =>
			positions.find((position) => position.coin === coin && position.dex === dex) ?? null,
	};
}
export function useMarkets() {
	const { marketsReady } = useCloseAllFixture();
	return {
		isLoading: !marketsReady,
		error: null,
		getMarket: (coin: string) => (marketsReady ? markets.find((market) => market.name === coin) : undefined),
		getAssetId: (coin: string) => markets.find((market) => market.name === coin)?.assetId,
	};
}
export function useMarketsInfo() {
	return { getMarketInfo: () => ({ markPx: "100", markPriceStatus: "ready" }) };
}
export function useSelectedMarketInfo() {
	return { data: markets[0] };
}
export function useSubscription(method: string) {
	const { activeTwap } = useCloseAllFixture();
	return {
		status: "active",
		isStale: false,
		data: method === "twapStates" ? { states: activeTwap ? [[1, { coin: "HYPE" }]] : [] } : { orders: [] },
	};
}
export function useTradingGuard() {
	return {
		isReady: true,
		isEnabling: false,
		needsTrading: false,
		enableTrading: () => {},
		guardAction: (action: () => void) => action(),
		error: null,
	};
}
export function useExchange(_method: string, options?: { executionGuard?: (params: OrderParams) => void }) {
	return {
		isPending: false,
		error: null,
		reset: () => {},
		mutateAsync: async (params: OrderParams) => {
			options?.executionGuard?.(params);
			setCloseAllFixture((state) => ({ orders: [...state.orders, params] }));
			await waitAt("exchange");
			const { outcome } = useCloseAllFixture.getState();
			if (outcome === "ambiguous") throw new HttpRequestError({ detail: "Request timed out after 10000 ms" });
			setCloseAllFixture({ settled: true });
			return {
				status: "ok",
				response: {
					type: "order",
					data: {
						statuses: params.orders.map((order, index) =>
							outcome === "partial" && index === 1
								? { error: "Order could not immediately match against any resting orders." }
								: { filled: { totalSz: order.s, avgPx: order.p, oid: index + 1 } },
						),
					},
				},
			};
		},
	};
}
export function parseAssetId(assetId: number) {
	return assetId >= 100_000
		? { kind: "builderPerp", dexIndex: 0, index: assetId - 100_000 }
		: { kind: "perp", index: assetId };
}
export function useMarketNavigation() {
	return () => {};
}
export function usePositionMarketCloseAction() {
	return { open: () => {}, pendingAssetId: null };
}
export function hasAcceptedHip3Disclaimer() {
	return useCloseAllFixture.getState().hip3Accepted;
}
export function useHip3DisclaimerRequirement(target?: string | readonly string[] | null) {
	const accepted = useCloseAllFixture((state) => state.hip3Accepted);
	const names = typeof target === "string" ? [target] : (target ?? []);
	const builderMarket = markets.find((market) => market.kind === "builderPerp" && names.includes(market.name));
	const dex = builderMarket && "dex" in builderMarket ? builderMarket.dex : undefined;
	return { isRequired: !!dex && !accepted, dex, documentationUrl: undefined };
}
export function useHip3DisclaimerActions() {
	return { accept: () => setCloseAllFixture({ hip3Accepted: true }) };
}
export function PositionPnlShareModal() {
	return null;
}
export function PositionLimitCloseModal() {
	return null;
}
export function PositionReverseConfirmationController() {
	return null;
}
export function PositionTpSlModal() {
	return null;
}
export function PositionIsolatedMarginModal() {
	return null;
}
