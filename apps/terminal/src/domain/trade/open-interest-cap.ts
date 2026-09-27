import type { OrderParameters } from "@nktkas/hyperliquid";
import { toBig } from "@/lib/trade/numbers";

export type OpenInterestCapStatus = "capped" | "clear" | "unknown";

interface OpenInterestCapSnapshotInput {
	enabled: boolean;
	user: string | undefined;
	event: unknown;
	status: "idle" | "subscribing" | "active" | "error";
	isStale: boolean;
}

interface OpenInterestCapMarket {
	kind: "perp" | "spot" | "builderPerp";
	name: string;
}

const PROTOCOL_DECIMAL_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getSnapshotUser(event: Record<string, unknown>): string | null {
	const userState = event.userState;
	if (!isRecord(userState) || typeof userState.user !== "string") return null;
	return userState.user;
}

export function getOpenInterestCappedCoins({
	enabled,
	user,
	event,
	status,
	isStale,
}: OpenInterestCapSnapshotInput): readonly string[] | null {
	if (!enabled || !user || status !== "active" || isStale || !isRecord(event)) return null;
	const snapshotUser = getSnapshotUser(event);
	if (snapshotUser === null || snapshotUser.toLowerCase() !== user.toLowerCase()) return null;
	const dexStates = event.perpDexStates;
	if (!Array.isArray(dexStates)) return null;

	const coins = new Set<string>();
	for (const dexState of dexStates) {
		if (!isRecord(dexState) || !Array.isArray(dexState.perpsAtOpenInterestCap)) continue;
		for (const coin of dexState.perpsAtOpenInterestCap) {
			if (typeof coin === "string" && coin !== "") coins.add(coin);
		}
	}
	return [...coins];
}

export function getMarketOpenInterestCapStatus(
	cappedCoins: readonly string[] | null | undefined,
	market: OpenInterestCapMarket | null | undefined,
): OpenInterestCapStatus {
	if (!market) return "unknown";
	if (market.kind === "spot") return "clear";
	if (!Array.isArray(cappedCoins)) return "unknown";
	return cappedCoins.includes(market.name) ? "capped" : "clear";
}

export function isOpenInterestCapRestrictedOrderRequest(params: OrderParameters): boolean {
	if (params.grouping === "positionTpsl") return false;
	const primaryOrders = params.grouping === "normalTpsl" ? params.orders.slice(0, 1) : params.orders;
	if (primaryOrders.length !== 1) return false;
	const order = primaryOrders[0];
	if ("limit" in order.t) return order.t.limit.tif !== "FrontendMarket";
	return order.t.trigger.isMarket === false;
}

export function getPerpDexCoinOpenInterestCap(limits: unknown, coin: string): string | null {
	if (!coin || !isRecord(limits) || !Array.isArray(limits.coinToOiCap)) return null;
	for (const entry of limits.coinToOiCap) {
		if (!Array.isArray(entry) || entry.length !== 2 || entry[0] !== coin) continue;
		const cap = entry[1];
		if (typeof cap !== "string" || !PROTOCOL_DECIMAL_PATTERN.test(cap)) return null;
		return toBig(cap)?.gt(0) ? cap : null;
	}
	return null;
}
