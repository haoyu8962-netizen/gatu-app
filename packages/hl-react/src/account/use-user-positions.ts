import type { AllDexsClearinghouseStateWsEvent } from "@nktkas/hyperliquid";
import { useSubscription } from "../hooks/useSubscription";
import { useHyperliquid } from "../provider";
import { getAccountLedgerRefreshKey } from "./ledger-refresh";

type RawClearinghouseState = AllDexsClearinghouseStateWsEvent["clearinghouseStates"][number][1];
type RawPosition = RawClearinghouseState["assetPositions"][number];
const SIGNED_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export interface Position {
	dex: string;
	coin: string;
	szi: string;
	entryPx: string;
	positionValue: string;
	unrealizedPnl: string;
	returnOnEquity: string;
	liquidationPx: string | null;
	marginUsed: string;
	maxLeverage: number;
	leverage: RawPosition["position"]["leverage"];
	cumFunding: RawPosition["position"]["cumFunding"];
}

export interface UserPositions {
	positions: Position[];
	getPosition: (coin: string, dex?: string) => Position | null;
	hasPosition: (coin: string, dex?: string) => boolean;
	withdrawable: string;
	isLoading: boolean;
	hasError: boolean;
	isStale: boolean;
	receivedAt: number | undefined;
}

function normalizePositions(event: AllDexsClearinghouseStateWsEvent | undefined): Position[] {
	const clearinghouseStates = event?.clearinghouseStates;
	if (!clearinghouseStates?.length) return [];

	const positions: Position[] = [];
	for (const entry of clearinghouseStates) {
		const dex = entry[0];
		const state = entry[1];
		const assetPositions = state?.assetPositions;
		if (!assetPositions?.length) continue;

		for (const assetPosition of assetPositions) {
			const position = assetPosition?.position;
			if (!position) continue;

			if (!isNonZeroPositionSize(position.szi)) continue;

			positions.push({
				dex,
				coin: position.coin,
				szi: position.szi,
				entryPx: position.entryPx,
				positionValue: position.positionValue,
				unrealizedPnl: position.unrealizedPnl,
				returnOnEquity: position.returnOnEquity,
				liquidationPx: position.liquidationPx,
				marginUsed: position.marginUsed,
				maxLeverage: position.maxLeverage,
				leverage: position.leverage,
				cumFunding: position.cumFunding,
			});
		}
	}
	return positions;
}

/** @internal Exact string gate used before preserving protocol position values. */
export function isNonZeroPositionSize(value: string): boolean {
	const normalized = value.trim();
	return SIGNED_DECIMAL_PATTERN.test(normalized) && /[1-9]/.test(normalized);
}

function getWithdrawable(event: AllDexsClearinghouseStateWsEvent | undefined): string {
	if (!event?.clearinghouseStates) return "0";
	const mainDex = event.clearinghouseStates.find(([dex]) => dex === "");
	return mainDex?.[1]?.withdrawable ?? "0";
}

function isValidPositionSnapshot(event: AllDexsClearinghouseStateWsEvent, address: string | undefined): boolean {
	if (
		!event ||
		!address ||
		typeof event.user !== "string" ||
		event.user.toLowerCase() !== address.toLowerCase() ||
		!Array.isArray(event.clearinghouseStates)
	)
		return false;
	const identities = new Set<string>();
	const dexIdentities = new Set<string>();
	return event.clearinghouseStates.every((entry) => {
		if (!Array.isArray(entry) || entry.length !== 2) return false;
		const [dex, state] = entry;
		if (typeof dex !== "string" || dexIdentities.has(dex) || !Array.isArray(state?.assetPositions)) return false;
		dexIdentities.add(dex);
		return state.assetPositions.every((assetPosition) => {
			const position = assetPosition?.position;
			if (
				!position ||
				typeof position.coin !== "string" ||
				typeof position.szi !== "string" ||
				!SIGNED_DECIMAL_PATTERN.test(position.szi)
			)
				return false;
			const identity = `${dex}:${position.coin}`;
			if (identities.has(identity)) return false;
			identities.add(identity);
			return true;
		});
	});
}

const EMPTY: UserPositions = {
	positions: [],
	getPosition: () => null,
	hasPosition: () => false,
	withdrawable: "0",
	isLoading: false,
	hasError: false,
	isStale: false,
	receivedAt: undefined,
};

export function useUserPositions(): UserPositions {
	const { clientKey } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const enabled = !!address;

	const { data: ledgerEvent } = useSubscription("userNonFundingLedgerUpdates", { user: address ?? "" }, { enabled });
	const ledgerRefreshKey = getAccountLedgerRefreshKey(ledgerEvent);
	const { data, status, isStale, lastMessageAt } = useSubscription(
		"allDexsClearinghouseState",
		{ user: address ?? "" },
		{ enabled, refreshKey: ledgerRefreshKey },
	);

	const isLoading = enabled && (status === "subscribing" || status === "idle" || data === undefined);
	// Never turn another owner or a malformed position into a confirmed empty account.
	const snapshotInvalid = data !== undefined && !isValidPositionSnapshot(data, address);
	const hasError = status === "error" || snapshotInvalid;

	if (!enabled) return EMPTY;

	const positions = normalizePositions(snapshotInvalid ? undefined : data);
	const withdrawable = getWithdrawable(snapshotInvalid ? undefined : data);

	return {
		positions,
		withdrawable,
		isLoading,
		hasError,
		isStale,
		receivedAt: lastMessageAt,

		getPosition(coin: string, dex?: string) {
			if (dex !== undefined) {
				return positions.find((p) => p.coin === coin && p.dex === dex) ?? null;
			}
			return positions.find((p) => p.coin === coin) ?? null;
		},

		hasPosition(coin: string, dex?: string) {
			return this.getPosition(coin, dex) !== null;
		},
	};
}
