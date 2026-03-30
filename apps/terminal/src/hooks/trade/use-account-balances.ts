import type { AllDexsClearinghouseStateWsEvent, SpotStateWsEvent } from "@nktkas/hyperliquid";
import { useConnection } from "wagmi";
import { useSubscription } from "@/lib/hyperliquid";

type RawClearinghouseState = AllDexsClearinghouseStateWsEvent["clearinghouseStates"][number][1];

export type MarginSummary = RawClearinghouseState["marginSummary"];
export type PerpSummary = RawClearinghouseState["crossMarginSummary"];
export type PerpPosition = RawClearinghouseState["assetPositions"][number];
export type SpotBalance = NonNullable<SpotStateWsEvent["spotState"]["balances"]>[number];

export interface AccountBalances {
	marginSummary: MarginSummary | null;
	perpSummary: PerpSummary | null;
	perpPositions: PerpPosition[];
	spotBalances: SpotBalance[];
	withdrawable: string;
	crossMaintenanceMarginUsed: string;
	isLoading: boolean;
	hasError: boolean;
}

const EMPTY_SPOT_BALANCES: SpotBalance[] = [];
const EMPTY_PERP_POSITIONS: PerpPosition[] = [];

export function useAccountBalances(): AccountBalances {
	const { address, isConnected } = useConnection();
	const enabled = isConnected && !!address;

	const { data: clearinghouseEvent, status: perpStatus } = useSubscription(
		"allDexsClearinghouseState",
		{ user: address ?? "" },
		{ enabled },
	);

	const { data: spotEvent, status: spotStatus } = useSubscription("spotState", { user: address ?? "0x0" }, { enabled });

	const mainDex = clearinghouseEvent?.clearinghouseStates?.find(([dex]) => dex === "")?.[1];
	const marginSummary = mainDex?.marginSummary ?? null;
	const perpSummary = mainDex?.crossMarginSummary ?? null;
	const perpPositions = mainDex?.assetPositions ?? EMPTY_PERP_POSITIONS;
	const spotBalances = spotEvent?.spotState?.balances ?? EMPTY_SPOT_BALANCES;
	const withdrawable = mainDex?.withdrawable ?? "0";
	const crossMaintenanceMarginUsed = mainDex?.crossMaintenanceMarginUsed ?? "0";

	const isLoading =
		perpStatus === "subscribing" || perpStatus === "idle" || spotStatus === "subscribing" || spotStatus === "idle";
	const hasError = perpStatus === "error" || spotStatus === "error";

	return {
		marginSummary,
		perpSummary,
		perpPositions,
		spotBalances,
		withdrawable,
		crossMaintenanceMarginUsed,
		isLoading,
		hasError,
	};
}
