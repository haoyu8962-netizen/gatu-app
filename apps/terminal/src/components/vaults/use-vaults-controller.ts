import { useMemo, useSyncExternalStore } from "react";
import { useDataReceivedSinceMount } from "@/hooks/portfolio/use-data-received-since-mount";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useActiveAgentOwner, useHyperliquid, useInfo, usePublicVaults } from "@/lib/hyperliquid";
import {
	combinePassiveQueryStates,
	getPassiveQueryState,
	isPassiveQueryShown,
	type PassiveQueryState,
} from "@/lib/passive-query-state";
import {
	createVaultAccountFacts,
	createVaultListItem,
	deriveVaultOwnerView,
	isVaultAddress,
	parseVaultDetailsSnapshot,
	parseVaultEquitiesSnapshot,
	selectVaultDiscoveryRows,
	type VaultAccountFactsState,
	type VaultDetail,
	type VaultListItem,
	type VaultOwnerViewState,
} from "./domain/vaults";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ACCOUNT_STALE_TIME_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

export type VaultsFeedState = "normal" | "loading" | "error" | "empty";

export interface VaultsController {
	state: VaultsFeedState;
	rows: readonly VaultListItem[];
	account: VaultAccountFactsState;
	/** False while `account` holds the snapshots kept after a failed refresh: shown, but no basis for an empty result. */
	accountCurrent: boolean;
	/** False while `rows` is the public list kept after a failed refresh: shown, but no basis for an empty result. */
	listCurrent: boolean;
	isRefreshing: boolean;
	fetchedAt: number | null;
	onRetry: () => void;
}

export type VaultDetailState = "normal" | "loading" | "error" | "notFound";

export interface VaultDetailController {
	state: VaultDetailState;
	detail: VaultDetail | null;
	/** The latest detail request succeeded; while false the page shows the detail it already received. */
	detailCurrent: boolean;
	owner: VaultOwnerViewState;
	/** What the action controller sees: an owner kept after a failed refresh counts as unverified. */
	actionOwner: VaultOwnerViewState;
	/** A source failed or is kept after a failed refresh: the page and an open action dialog offer a neutral retry. */
	needsRetry: boolean;
	onRetry: () => void;
}

export function useVaultsController(): VaultsController {
	const accountAddress = useVaultReadOwner();
	const { env } = useHyperliquid();
	const owner = accountAddress?.toLowerCase() ?? null;
	const publicVaults = usePublicVaults({
		gcTime: 0,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
	});
	const equities = useInfo(
		"userVaultEquities",
		{ user: accountAddress ?? EMPTY_ADDRESS },
		{
			enabled: Boolean(accountAddress),
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);
	const leading = useInfo(
		"leadingVaults",
		{ user: accountAddress ?? EMPTY_ADDRESS },
		{
			enabled: Boolean(accountAddress),
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);
	const publicReceived = useDataReceivedSinceMount(JSON.stringify([env, "vaults"]), publicVaults.dataUpdatedAt);
	const equitiesReceived = useDataReceivedSinceMount(
		JSON.stringify([env, "userVaultEquities", owner]),
		equities.dataUpdatedAt,
	);
	const leadingReceived = useDataReceivedSinceMount(
		JSON.stringify([env, "leadingVaults", owner]),
		leading.dataUpdatedAt,
	);

	const rows = useMemo(
		() => selectVaultDiscoveryRows(publicVaults.data?.map(createVaultListItem) ?? []),
		[publicVaults.data],
	);
	const facts = createVaultAccountFacts(equities.data, leading.data);
	const accountSource = combinePassiveQueryStates([
		getPassiveQueryState({
			hasData: equities.data !== undefined,
			failed: equities.isError,
			receivedSinceMount: equitiesReceived,
		}),
		getPassiveQueryState({
			hasData: leading.data !== undefined,
			failed: leading.isError,
			receivedSinceMount: leadingReceived,
		}),
	]);
	const publicSource = getPassiveQueryState({
		hasData: publicVaults.data !== undefined,
		failed: publicVaults.isError,
		receivedSinceMount: publicReceived,
	});

	return {
		state: getVaultsFeedState(publicSource, rows.length),
		rows: isPassiveQueryShown(publicSource) ? rows : [],
		account: getAccountFactsState(accountAddress, accountSource, facts),
		accountCurrent: accountSource === "ready" && facts !== null,
		listCurrent: publicSource === "ready",
		isRefreshing: publicVaults.isFetching && publicVaults.data !== undefined,
		fetchedAt: publicVaults.dataUpdatedAt || null,
		onRetry: () => {
			void publicVaults.refetch();
			if (accountAddress) {
				void equities.refetch();
				void leading.refetch();
			}
		},
	};
}

export function useVaultDetailController(vaultAddress: string): VaultDetailController {
	const accountAddress = useVaultReadOwner();
	const { env } = useHyperliquid();
	const owner = accountAddress?.toLowerCase() ?? null;
	const validAddress = isVaultAddress(vaultAddress);
	const detailQuery = useInfo(
		"vaultDetails",
		accountAddress
			? { vaultAddress: validAddress ? vaultAddress : EMPTY_ADDRESS, user: accountAddress }
			: { vaultAddress: validAddress ? vaultAddress : EMPTY_ADDRESS },
		{
			enabled: validAddress,
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);
	const equitiesQuery = useInfo(
		"userVaultEquities",
		{ user: accountAddress ?? EMPTY_ADDRESS },
		{
			enabled: Boolean(accountAddress),
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);
	const detailReceived = useDataReceivedSinceMount(
		JSON.stringify([env, "vaultDetails", vaultAddress.toLowerCase(), owner]),
		detailQuery.dataUpdatedAt,
	);
	const equitiesReceived = useDataReceivedSinceMount(
		JSON.stringify([env, "userVaultEquities", owner]),
		equitiesQuery.dataUpdatedAt,
	);

	const parsed = validAddress
		? parseVaultDetailsSnapshot(detailQuery.data as unknown)
		: { status: "notFound" as const };
	const detail = parsed.status === "valid" ? parsed.detail : null;
	const detailSource = getPassiveQueryState({
		hasData: detail !== null,
		failed: detailQuery.isError || (detailQuery.data !== undefined && parsed.status === "malformed"),
		receivedSinceMount: detailReceived,
	});
	const parsedEquities =
		accountAddress && equitiesQuery.data !== undefined ? parseVaultEquitiesSnapshot(equitiesQuery.data) : null;
	const equitiesSource = getPassiveQueryState({
		hasData: parsedEquities?.status === "valid",
		failed: equitiesQuery.isError || parsedEquities?.status === "malformed",
		receivedSinceMount: equitiesReceived,
	});
	const lockBoundary =
		detail && parsedEquities?.status === "valid"
			? (parsedEquities.equities.find((item) => item.vaultAddress.toLowerCase() === detail.vaultAddress.toLowerCase())
					?.lockedUntilTimestamp ?? detail.followerState?.lockupUntil)
			: detail?.followerState?.lockupUntil;
	const now = useNowAtBoundary(lockBoundary);
	let state: VaultDetailState;
	if (!validAddress || (parsed.status === "notFound" && !detailQuery.isError)) state = "notFound";
	else if (detailSource === "loading") state = "loading";
	else if (detailSource === "failed") state = "error";
	else state = "normal";

	let ownerView: VaultOwnerViewState = { status: "disconnected" };
	if (detail && accountAddress) {
		if (equitiesSource === "loading") ownerView = { status: "loading" };
		else if (equitiesSource === "failed" || parsedEquities?.status !== "valid") ownerView = { status: "error" };
		else {
			ownerView = deriveVaultOwnerView({
				detail,
				account: { status: "ready", equities: parsedEquities.equities },
				now,
			});
		}
	}
	const ownerRetained = ownerView.status === "ready" && equitiesSource === "retained";

	return {
		state,
		detail,
		detailCurrent: detailSource === "ready",
		owner: ownerView,
		actionOwner: ownerRetained ? { status: "error" } : ownerView,
		needsRetry:
			isFailedOrRetained(detailSource) || (accountAddress !== undefined && isFailedOrRetained(equitiesSource)),
		onRetry: () => {
			void detailQuery.refetch();
			if (accountAddress) void equitiesQuery.refetch();
		},
	};
}

function isFailedOrRetained(state: PassiveQueryState): boolean {
	return state === "failed" || state === "retained";
}

function getVaultsFeedState(source: PassiveQueryState, rowCount: number): VaultsFeedState {
	if (source === "loading") return "loading";
	if (source === "failed") return "error";
	if (rowCount) return "normal";
	return source === "ready" ? "empty" : "error";
}

function getAccountFactsState(
	accountAddress: `0x${string}` | undefined,
	source: PassiveQueryState,
	facts: ReturnType<typeof createVaultAccountFacts>,
): VaultAccountFactsState {
	if (!accountAddress) return { status: "disconnected" };
	if (source === "loading") return { status: "loading" };
	if (source === "failed" || !facts) return { status: "error" };
	return { status: "ready", facts };
}

function useNowAtBoundary(boundary: number | null | undefined): number {
	const clock = useMemo(() => createBoundaryClock(boundary), [boundary]);
	return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}

function createBoundaryClock(boundary: number | null | undefined) {
	let snapshot = Date.now();
	return {
		getSnapshot: () => snapshot,
		subscribe: (onBoundaryReached: () => void) => {
			if (typeof boundary !== "number" || !Number.isSafeInteger(boundary) || boundary <= snapshot) return () => {};
			let timeout: ReturnType<typeof setTimeout> | undefined;
			const checkBoundary = () => {
				const remaining = boundary - Date.now();
				if (remaining > 0) {
					timeout = setTimeout(checkBoundary, Math.min(remaining + 50, 2_147_483_647));
					return;
				}
				snapshot = Date.now();
				onBoundaryReached();
			};
			timeout = setTimeout(checkBoundary, Math.min(boundary - snapshot + 50, 2_147_483_647));
			return () => {
				if (timeout !== undefined) clearTimeout(timeout);
			};
		},
	};
}

function useVaultReadOwner(): `0x${string}` | undefined {
	const wallet = useWalletSession();
	const { env } = useHyperliquid();
	const activeAgentOwner = useActiveAgentOwner();
	if (wallet.sessionMode === "agent-only") {
		return activeAgentOwner?.env === env ? activeAgentOwner.address : undefined;
	}
	return wallet.address;
}
