import type { AllDexsClearinghouseStateWsEvent, SpotStateWsEvent, WebData3WsEvent } from "@nktkas/hyperliquid";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getPositionDex } from "@/domain/market";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { getAccountLedgerRefreshKey, useHyperliquid, useInfo, useSubscription } from "@/lib/hyperliquid";
import { useSelectedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";

type RawClearinghouseState = AllDexsClearinghouseStateWsEvent["clearinghouseStates"][number][1];
type RawSpotState = SpotStateWsEvent["spotState"] & {
	tokenToAvailableAfterMaintenance?: Array<[number | string, string]>;
};

export type MarginSummary = RawClearinghouseState["marginSummary"];
export type PerpSummary = RawClearinghouseState["crossMarginSummary"];
export type PerpPosition = RawClearinghouseState["assetPositions"][number];
export type SpotBalance = NonNullable<SpotStateWsEvent["spotState"]["balances"]>[number];
export type SpotAvailableAfterMaintenance = NonNullable<RawSpotState["tokenToAvailableAfterMaintenance"]>;
export type AccountAbstraction =
	| NonNullable<WebData3WsEvent["userState"]["abstraction"]>
	| "unifiedAccount"
	| "portfolioMargin"
	| "disabled"
	| null;

export interface AccountBalances {
	dex: string;
	marginSummary: MarginSummary | null;
	perpSummary: PerpSummary | null;
	perpPositions: PerpPosition[];
	spotBalances: SpotBalance[];
	spotAvailableAfterMaintenance: SpotAvailableAfterMaintenance;
	accountAbstraction: AccountAbstraction;
	withdrawable: string;
	crossMaintenanceMarginUsed: string;
	isLoading: boolean;
	hasError: boolean;
}

const EMPTY_SPOT_BALANCES: SpotBalance[] = [];
const EMPTY_PERP_POSITIONS: PerpPosition[] = [];
const EMPTY_SPOT_AVAILABLE_AFTER_MAINTENANCE: SpotAvailableAfterMaintenance = [];
const MAINNET_INFO_URL = "https://api.hyperliquid.xyz/info";
const TESTNET_INFO_URL = "https://api.hyperliquid-testnet.xyz/info";

function normalizeDex(dex: string | null | undefined): string {
	return dex ?? "";
}

function normalizeAccountAbstraction(value: unknown): AccountAbstraction {
	if (value && typeof value === "object" && "abstraction" in value) {
		return normalizeAccountAbstraction((value as { abstraction?: unknown }).abstraction);
	}

	if (value === "unifiedAccount" || value === "u") return "unifiedAccount";
	if (value === "portfolioMargin" || value === "p") return "portfolioMargin";
	if (value === "disabled" || value === "default" || value === "i") return "disabled";
	if (value === "dexAbstraction") return "dexAbstraction";
	return null;
}

async function fetchUserAbstraction(
	user: string,
	isTestnet: boolean,
	signal: AbortSignal,
): Promise<AccountAbstraction> {
	const response = await fetch(isTestnet ? TESTNET_INFO_URL : MAINNET_INFO_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ type: "userAbstraction", user }),
		signal,
	});

	if (!response.ok) {
		throw new Error(`Failed to load user abstraction: ${response.status}`);
	}

	return normalizeAccountAbstraction(await response.json());
}

function useUserAbstraction(user: string | undefined, enabled: boolean, refreshKey: string | undefined) {
	const { isTestnet } = useHyperliquid();

	return useQuery({
		queryKey: ["hl", "userAbstraction", isTestnet, user, refreshKey],
		queryFn: ({ signal }) => fetchUserAbstraction(user as string, isTestnet, signal),
		enabled: enabled && !!user,
		staleTime: 30_000,
		retry: 1,
	});
}

export interface AllDexsAccountState {
	clearinghouseStates: AllDexsClearinghouseStateWsEvent["clearinghouseStates"];
	spotBalances: SpotBalance[];
	spotAvailableAfterMaintenance: SpotAvailableAfterMaintenance;
	accountAbstraction: AccountAbstraction;
	isLoading: boolean;
	hasError: boolean;
}

export function useAllDexsAccountState(): AllDexsAccountState {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;

	const { data: ledgerEvent } = useSubscription("userNonFundingLedgerUpdates", { user: address ?? "" }, { enabled });
	const ledgerRefreshKey = getAccountLedgerRefreshKey(ledgerEvent);

	const { data: clearinghouseEvent, status: perpStatus } = useSubscription(
		"allDexsClearinghouseState",
		{ user: address ?? "" },
		{ enabled, refreshKey: ledgerRefreshKey },
	);

	const { data: spotEvent, status: spotStatus } = useSubscription(
		"spotState",
		{ user: address ?? "0x0" },
		{ enabled, refreshKey: ledgerRefreshKey },
	);
	const { data: webData3Event, status: webData3Status } = useSubscription(
		"webData3",
		{ user: address ?? "0x0" },
		{ enabled, refreshKey: ledgerRefreshKey },
	);
	const { data: infoAccountAbstraction, status: accountAbstractionStatus } = useUserAbstraction(
		address,
		enabled,
		ledgerRefreshKey,
	);

	const spotState = spotEvent?.spotState as RawSpotState | undefined;
	const spotAvailableAfterMaintenance = useMemo(
		() => spotState?.tokenToAvailableAfterMaintenance ?? EMPTY_SPOT_AVAILABLE_AFTER_MAINTENANCE,
		[spotState?.tokenToAvailableAfterMaintenance],
	);

	if (!enabled) {
		return {
			clearinghouseStates: [],
			spotBalances: EMPTY_SPOT_BALANCES,
			spotAvailableAfterMaintenance: EMPTY_SPOT_AVAILABLE_AFTER_MAINTENANCE,
			accountAbstraction: null,
			isLoading: false,
			hasError: false,
		};
	}

	const clearinghouseStates = clearinghouseEvent?.clearinghouseStates ?? [];
	const spotBalances = spotState?.balances ?? EMPTY_SPOT_BALANCES;
	const accountAbstraction =
		infoAccountAbstraction ?? normalizeAccountAbstraction(webData3Event?.userState.abstraction) ?? null;
	const accountAbstractionLoading =
		accountAbstraction === null &&
		(accountAbstractionStatus === "pending" || webData3Status === "subscribing" || webData3Status === "idle");

	const isLoading =
		perpStatus === "subscribing" ||
		perpStatus === "idle" ||
		spotStatus === "subscribing" ||
		spotStatus === "idle" ||
		accountAbstractionLoading;
	const hasError = perpStatus === "error" || spotStatus === "error";

	return {
		clearinghouseStates,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		isLoading,
		hasError,
	};
}

export function useDexBalances(dex: string | null | undefined): AccountBalances {
	const { clearinghouseStates, spotBalances, spotAvailableAfterMaintenance, accountAbstraction, isLoading, hasError } =
		useAllDexsAccountState();
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;

	const selectedDex = normalizeDex(dex);
	const clearinghouseParams = selectedDex ? { user: address ?? "", dex: selectedDex } : { user: address ?? "" };
	const { data: infoDexState, status: infoDexStatus } = useInfo("clearinghouseState", clearinghouseParams, {
		enabled,
		staleTime: 10_000,
		retry: 1,
	});
	const wsDexState = clearinghouseStates.find(([entryDex]) => entryDex === selectedDex)?.[1];
	const dexState = wsDexState ?? infoDexState;
	const marginSummary = dexState?.marginSummary ?? null;
	const perpSummary = dexState?.crossMarginSummary ?? null;
	const perpPositions = dexState?.assetPositions ?? EMPTY_PERP_POSITIONS;
	const withdrawable = dexState?.withdrawable ?? "0";
	const crossMaintenanceMarginUsed = dexState?.crossMaintenanceMarginUsed ?? "0";

	return {
		dex: selectedDex,
		marginSummary,
		perpSummary,
		perpPositions,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		withdrawable,
		crossMaintenanceMarginUsed,
		isLoading: enabled && !dexState ? isLoading || infoDexStatus === "pending" : isLoading,
		hasError: hasError || (!dexState && infoDexStatus === "error"),
	};
}

export function useDefaultDexBalances(): AccountBalances {
	return useDexBalances("");
}

export function useSelectedDexBalances(): AccountBalances {
	const { data: market } = useSelectedMarketInfo();
	return useDexBalances(market ? getPositionDex(market) : "");
}

export { useDefaultDexBalances as useAccountBalances };
