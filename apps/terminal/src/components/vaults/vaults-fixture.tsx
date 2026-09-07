import { useLingui } from "@lingui/react/macro";
import type {
	VaultAccountFactsState,
	VaultActionsAvailability,
	VaultDetail,
	VaultListItem,
	VaultOwnerViewState,
	VaultPortfolioSnapshot,
} from "./domain/vaults";
import { selectVaultDiscoveryRows } from "./domain/vaults";
import { VaultDetailView } from "./vault-detail-view";
import { VaultsList } from "./vaults-list";

const FIXTURE_STATES = ["normal", "loading", "error", "empty"] as const;
export type VaultsFixtureState = (typeof FIXTURE_STATES)[number];
export type VaultDetailFixtureState = "normal";

const VAULT_ALPHA = "0x0000000000000000000000000000000000000101" as const;
const VAULT_BETA = "0x0000000000000000000000000000000000000102" as const;
const VAULT_GAMMA = "0x0000000000000000000000000000000000000103" as const;
const LEADER_ALPHA = "0x0000000000000000000000000000000000000201" as const;
const LEADER_BETA = "0x0000000000000000000000000000000000000202" as const;
const LEADER_GAMMA = "0x0000000000000000000000000000000000000203" as const;
const FOLLOWER = "0x0000000000000000000000000000000000000301" as const;
const FIXTURE_UPDATED_AT = Date.UTC(2026, 0, 15, 12, 0, 0);
const AVAILABLE_ACTIONS = {
	deposit: { available: true, reason: null },
	withdraw: { available: true, reason: null },
} satisfies VaultActionsAvailability;

export function getVaultsFixtureFromLocation(): VaultsFixtureState | null {
	return resolveVaultsFixture(typeof window === "undefined" ? "" : window.location.search, import.meta.env.DEV);
}

export function resolveVaultsFixture(search: string, isDevelopment: boolean): VaultsFixtureState | null {
	if (!isDevelopment) return null;
	const fixture = new URLSearchParams(search).get("fixture");
	return FIXTURE_STATES.find((state) => state === fixture) ?? null;
}

export function getVaultDetailFixtureFromLocation(): VaultDetailFixtureState | null {
	return resolveVaultDetailFixture(typeof window === "undefined" ? "" : window.location.search, import.meta.env.DEV);
}

export function resolveVaultDetailFixture(search: string, isDevelopment: boolean): VaultDetailFixtureState | null {
	if (!isDevelopment) return null;
	return new URLSearchParams(search).get("fixture") === "normal" ? "normal" : null;
}

export function VaultsFixture({ fixture }: { fixture: VaultsFixtureState }) {
	const { t } = useLingui();
	const rows =
		fixture === "normal"
			? selectVaultDiscoveryRows(
					createVaultRows({
						alpha: t`Sample Core Vault`,
						beta: t`Sample Growth Vault`,
						gamma: t`Sample Neutral Vault`,
					}),
				)
			: [];

	return (
		<VaultsList
			state={fixture}
			rows={rows}
			account={fixture === "normal" ? createAccountFacts() : { status: "disconnected" }}
			fetchedAt={fixture === "normal" ? FIXTURE_UPDATED_AT : null}
			onRetry={() => undefined}
		/>
	);
}

export function VaultDetailFixture() {
	const { t } = useLingui();
	return (
		<VaultDetailView
			detail={createVaultDetail({
				name: t`Sample Core Vault`,
				description: t`Placeholder Vault data for visual review.`,
			})}
			owner={createVaultOwner()}
			actionAvailability={AVAILABLE_ACTIONS}
			isTestnet={false}
			onRequestAction={() => undefined}
		/>
	);
}

function createVaultRows(names: { alpha: string; beta: string; gamma: string }): readonly VaultListItem[] {
	return [
		{
			vaultAddress: VAULT_ALPHA,
			leader: LEADER_ALPHA,
			name: names.alpha,
			tvl: "24500000",
			apr: "0.184",
			createdAt: Date.UTC(2025, 5, 12),
			isClosed: false,
			relationship: "normal",
			pnlByPeriod: {
				day: ["0", "42000"],
				week: ["0", "187500"],
				month: ["0", "640000"],
				allTime: ["0", "2180000"],
			},
			classification: null,
		},
		{
			vaultAddress: VAULT_BETA,
			leader: LEADER_BETA,
			name: names.beta,
			tvl: "8750000",
			apr: "0.112",
			createdAt: Date.UTC(2025, 8, 3),
			isClosed: false,
			relationship: "normal",
			pnlByPeriod: {
				day: ["0", "-8500"],
				week: ["0", "68000"],
				month: ["0", "214000"],
				allTime: ["0", "735000"],
			},
			classification: null,
		},
		{
			vaultAddress: VAULT_GAMMA,
			leader: LEADER_GAMMA,
			name: names.gamma,
			tvl: "3900000",
			apr: "0.076",
			createdAt: Date.UTC(2025, 10, 21),
			isClosed: false,
			relationship: "normal",
			pnlByPeriod: {
				day: ["0", "3100"],
				week: ["0", "22500"],
				month: ["0", "97000"],
				allTime: ["0", "282000"],
			},
			classification: null,
		},
	];
}

function createAccountFacts(): VaultAccountFactsState {
	return {
		status: "ready",
		facts: {
			depositsByAddress: new Map([[VAULT_ALPHA.toLowerCase(), "18750.25"]]),
			leadingAddresses: new Set([VAULT_BETA.toLowerCase()]),
		},
	};
}

function createVaultDetail(copy: { name: string; description: string }): VaultDetail {
	return {
		name: copy.name,
		vaultAddress: VAULT_ALPHA,
		leader: LEADER_ALPHA,
		description: copy.description,
		portfolio: {
			day: createPortfolio("24500000", "42000", "3100000", Date.UTC(2026, 0, 14)),
			week: createPortfolio("24250000", "187500", "15400000", Date.UTC(2026, 0, 8)),
			month: createPortfolio("23100000", "640000", "62800000", Date.UTC(2025, 11, 16)),
			allTime: createPortfolio("16800000", "2180000", "412000000", Date.UTC(2025, 5, 12)),
		},
		apr: "0.184",
		followerState: null,
		leaderFraction: "0.1",
		leaderCommission: "0.1",
		followers: [
			{
				user: "Leader",
				vaultEquity: "2450000",
				pnl: "420000",
				allTimePnl: "720000",
				daysFollowing: 217,
				vaultEntryTime: Date.UTC(2025, 5, 12),
				lockupUntil: Date.UTC(2025, 5, 16),
			},
			{
				user: FOLLOWER,
				vaultEquity: "18750.25",
				pnl: "1250.75",
				allTimePnl: "2450.5",
				daysFollowing: 43,
				vaultEntryTime: Date.UTC(2025, 11, 3),
				lockupUntil: Date.UTC(2025, 11, 7),
			},
		],
		maxDistributable: "1200000",
		maxWithdrawable: "18750.25",
		isClosed: false,
		relationship: "normal",
		allowDeposits: true,
		alwaysCloseOnWithdraw: false,
	};
}

function createPortfolio(
	accountValue: string,
	pnl: string,
	volume: string,
	startTimestamp: number,
): VaultPortfolioSnapshot {
	return {
		accountValueHistory: [
			{ timestamp: startTimestamp, value: "20000000" },
			{ timestamp: FIXTURE_UPDATED_AT, value: accountValue },
		],
		pnlHistory: [
			{ timestamp: startTimestamp, value: "0" },
			{ timestamp: FIXTURE_UPDATED_AT, value: pnl },
		],
		volume,
	};
}

function createVaultOwner(): VaultOwnerViewState {
	return {
		status: "ready",
		equity: "18750.25",
		pnl: "1250.75",
		allTimePnl: "2450.5",
		entryTime: Date.UTC(2025, 11, 3),
		lockedUntil: Date.UTC(2025, 11, 7),
		isLocked: false,
		lockProgress: "1",
		maxWithdrawable: "18750.25",
		canWithdraw: true,
	};
}
