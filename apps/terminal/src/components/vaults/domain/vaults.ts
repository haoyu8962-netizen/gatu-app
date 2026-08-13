import Big from "big.js";

export const VAULT_PERIODS = ["day", "week", "month", "allTime"] as const;
export type VaultPeriod = (typeof VAULT_PERIODS)[number];

export const VAULT_FILTERS = ["all", "official", "user", "deposited", "leading"] as const;
export type VaultFilter = (typeof VAULT_FILTERS)[number];

export type VaultClassification = "official" | "user" | null;

export interface VaultListItem {
	vaultAddress: `0x${string}`;
	name: string;
	leader: `0x${string}`;
	tvl: string;
	apr: string;
	createdAt: number;
	isClosed: boolean;
	relationship: "normal" | "child" | "parent";
	pnlByPeriod: Readonly<Record<VaultPeriod, readonly string[]>>;
	/** Null means no reviewed classification is available. */
	classification: VaultClassification;
}

export interface VaultAccountFacts {
	depositsByAddress: ReadonlyMap<string, string>;
	leadingAddresses: ReadonlySet<string>;
}

export type VaultAccountFactsState =
	| { status: "disconnected" }
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; facts: VaultAccountFacts };

export interface VaultListSelectionInput {
	rows: readonly VaultListItem[];
	filter: VaultFilter;
	query: string;
	account: VaultAccountFactsState;
}

export type VaultListUnavailableReason = "classification" | "accountDisconnected" | "accountLoading" | "accountError";

export type VaultListSelection =
	| {
			status: "ready";
			rows: readonly VaultListItem[];
			isSearchNoResults: boolean;
			classificationAvailable: boolean;
	  }
	| { status: "unavailable"; reason: VaultListUnavailableReason };

export interface VaultListGroup {
	id: "official" | "user" | "unclassified";
	rows: readonly VaultListItem[];
}

export interface VaultHistoryPoint {
	timestamp: number;
	value: string;
}

export interface VaultPortfolioSnapshot {
	accountValueHistory: readonly VaultHistoryPoint[];
	pnlHistory: readonly VaultHistoryPoint[];
	volume: string;
}

export interface VaultFollower {
	user: `0x${string}` | "Leader";
	vaultEquity: string;
	pnl: string;
	allTimePnl: string;
	daysFollowing: number;
	vaultEntryTime: number;
	lockupUntil: number;
}

export interface VaultFollowerState extends VaultFollower {
	user: `0x${string}`;
}

export interface VaultDetail {
	name: string;
	vaultAddress: `0x${string}`;
	leader: `0x${string}`;
	description: string;
	portfolio: Readonly<Record<VaultPeriod, VaultPortfolioSnapshot>>;
	apr: string;
	followerState: VaultFollowerState | null;
	leaderFraction: string;
	leaderCommission: string;
	followers: readonly VaultFollower[];
	maxDistributable: string;
	maxWithdrawable: string;
	isClosed: boolean;
	relationship: "normal" | "child" | "parent";
	allowDeposits: boolean;
	alwaysCloseOnWithdraw: boolean;
}

export type VaultDetailParseResult =
	| { status: "valid"; detail: VaultDetail }
	| { status: "notFound" }
	| { status: "malformed" };

export interface VaultEquity {
	vaultAddress: `0x${string}`;
	equity: string;
	lockedUntilTimestamp: number;
}

export type VaultEquitiesParseResult = { status: "valid"; equities: readonly VaultEquity[] } | { status: "malformed" };

export interface VaultOwnerView {
	status: "ready";
	equity: string;
	pnl: string | null;
	allTimePnl: string | null;
	entryTime: number | null;
	lockedUntil: number | null;
	isLocked: boolean;
	lockProgress: string | null;
	maxWithdrawable: string;
	canWithdraw: boolean;
}

export type VaultOwnerViewState =
	| { status: "disconnected" }
	| { status: "loading" }
	| { status: "error" }
	| VaultOwnerView;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SIGNED_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function isVaultAddress(value: unknown): value is `0x${string}` {
	return typeof value === "string" && ADDRESS_PATTERN.test(value);
}

export function normalizeVaultAddress(value: string): string {
	return value.toLowerCase();
}

export function isUnsignedDecimal(value: unknown): value is string {
	return typeof value === "string" && UNSIGNED_DECIMAL_PATTERN.test(value);
}

export function isSignedDecimal(value: unknown): value is string {
	return typeof value === "string" && SIGNED_DECIMAL_PATTERN.test(value);
}

export function selectVaultRows({ rows, filter, query, account }: VaultListSelectionInput): VaultListSelection {
	const classificationAvailable = rows.every((row) => row.classification !== null);
	if ((filter === "official" || filter === "user") && !classificationAvailable) {
		return { status: "unavailable", reason: "classification" };
	}
	if (filter === "deposited" || filter === "leading") {
		if (account.status === "disconnected") return { status: "unavailable", reason: "accountDisconnected" };
		if (account.status === "loading") return { status: "unavailable", reason: "accountLoading" };
		if (account.status === "error") return { status: "unavailable", reason: "accountError" };
	}

	const normalizedQuery = query.trim().toLowerCase();
	const filtered = rows.filter((row) => {
		if (filter === "official" || filter === "user") {
			if (row.classification !== filter) return false;
		} else if (filter === "deposited") {
			if (account.status !== "ready" || !account.facts.depositsByAddress.has(normalizeVaultAddress(row.vaultAddress))) {
				return false;
			}
		} else if (filter === "leading") {
			if (account.status !== "ready" || !account.facts.leadingAddresses.has(normalizeVaultAddress(row.vaultAddress))) {
				return false;
			}
		}

		return (
			!normalizedQuery ||
			row.name.toLowerCase().includes(normalizedQuery) ||
			row.vaultAddress.toLowerCase().includes(normalizedQuery) ||
			row.leader.toLowerCase().includes(normalizedQuery)
		);
	});

	return {
		status: "ready",
		rows: filtered,
		isSearchNoResults: normalizedQuery.length > 0 && filtered.length === 0,
		classificationAvailable,
	};
}

export function groupVaultRows(
	rows: readonly VaultListItem[],
	classificationAvailable: boolean,
): readonly VaultListGroup[] {
	if (!classificationAvailable) {
		return rows.length ? [{ id: "unclassified", rows }] : [];
	}

	const official = rows.filter((row) => row.classification === "official");
	const user = rows.filter((row) => row.classification === "user");
	return [
		...(official.length ? ([{ id: "official", rows: official }] as const) : []),
		...(user.length ? ([{ id: "user", rows: user }] as const) : []),
	];
}

export function getVaultDeposit(account: VaultAccountFactsState, vaultAddress: string): string | null {
	if (account.status !== "ready") return null;
	return account.facts.depositsByAddress.get(normalizeVaultAddress(vaultAddress)) ?? "0";
}

export function isLeadingVault(account: VaultAccountFactsState, vaultAddress: string): boolean | null {
	if (account.status !== "ready") return null;
	return account.facts.leadingAddresses.has(normalizeVaultAddress(vaultAddress));
}

export function sumVaultTvl(rows: readonly VaultListItem[]): string | null {
	let total = Big(0);
	for (const row of rows) {
		const value = toBig(row.tvl, false);
		if (!value) return null;
		total = total.plus(value);
	}
	return total.toString();
}

export function getVaultAgeDays(createdAt: number, now: number): number | null {
	if (!Number.isSafeInteger(createdAt) || !Number.isSafeInteger(now) || createdAt < 0 || now < createdAt) return null;
	return Math.floor((now - createdAt) / 86_400_000);
}

export function getVaultPeriodSeries(row: VaultListItem, period: VaultPeriod): readonly string[] {
	return row.pnlByPeriod[period];
}

export function createVaultListItem(value: {
	vaultAddress: `0x${string}`;
	name: string;
	leader: `0x${string}`;
	tvl: string;
	apr: number;
	createTimeMillis: number;
	isClosed: boolean;
	relationship: { type: "normal" | "child" } | { type: "parent"; childAddresses: readonly `0x${string}`[] };
	pnlHistory: Readonly<Record<VaultPeriod, readonly string[]>>;
}): VaultListItem {
	return {
		vaultAddress: value.vaultAddress,
		name: value.name,
		leader: value.leader,
		tvl: value.tvl,
		apr: Big(String(value.apr)).toString(),
		createdAt: value.createTimeMillis,
		isClosed: value.isClosed,
		relationship: value.relationship.type,
		pnlByPeriod: value.pnlHistory,
		classification: null,
	};
}

export function parseVaultDetailsSnapshot(value: unknown): VaultDetailParseResult {
	if (value === null) return { status: "notFound" };
	if (!isRecord(value)) return { status: "malformed" };
	if (
		typeof value.name !== "string" ||
		!isVaultAddress(value.vaultAddress) ||
		!isVaultAddress(value.leader) ||
		typeof value.description !== "string" ||
		!isFiniteNumber(value.apr) ||
		!isFiniteNonNegativeNumber(value.leaderFraction) ||
		!isFiniteNonNegativeNumber(value.leaderCommission) ||
		!isFiniteNonNegativeNumber(value.maxDistributable) ||
		!isFiniteNonNegativeNumber(value.maxWithdrawable) ||
		typeof value.isClosed !== "boolean" ||
		typeof value.allowDeposits !== "boolean" ||
		typeof value.alwaysCloseOnWithdraw !== "boolean"
	) {
		return { status: "malformed" };
	}

	const portfolio = parsePortfolio(value.portfolio);
	const followerState = value.followerState === null ? null : parseFollower(value.followerState, false);
	const followers = Array.isArray(value.followers) ? value.followers.map((item) => parseFollower(item, true)) : null;
	const relationship = parseRelationship(value.relationship);
	if (
		!portfolio ||
		followerState === undefined ||
		!followers ||
		followers.some((item) => item === undefined) ||
		!relationship
	) {
		return { status: "malformed" };
	}

	return {
		status: "valid",
		detail: {
			name: value.name,
			vaultAddress: value.vaultAddress,
			leader: value.leader,
			description: value.description,
			portfolio,
			apr: Big(String(value.apr)).toString(),
			followerState: followerState as VaultFollowerState | null,
			leaderFraction: Big(String(value.leaderFraction)).toString(),
			leaderCommission: Big(String(value.leaderCommission)).toString(),
			followers: followers as VaultFollower[],
			maxDistributable: quantizeUsdNumber(value.maxDistributable),
			maxWithdrawable: quantizeUsdNumber(value.maxWithdrawable),
			isClosed: value.isClosed,
			relationship,
			allowDeposits: value.allowDeposits,
			alwaysCloseOnWithdraw: value.alwaysCloseOnWithdraw,
		},
	};
}

export function parseVaultEquitiesSnapshot(value: unknown): VaultEquitiesParseResult {
	if (!Array.isArray(value)) return { status: "malformed" };
	const equities: VaultEquity[] = [];
	for (const item of value) {
		if (
			!isRecord(item) ||
			!isVaultAddress(item.vaultAddress) ||
			!isUnsignedDecimal(item.equity) ||
			!isTimestamp(item.lockedUntilTimestamp)
		) {
			return { status: "malformed" };
		}
		equities.push({
			vaultAddress: item.vaultAddress,
			equity: item.equity,
			lockedUntilTimestamp: item.lockedUntilTimestamp,
		});
	}
	return { status: "valid", equities };
}

export function createVaultAccountFacts(equitiesValue: unknown, leadingValue: unknown): VaultAccountFacts | null {
	const equities = parseVaultEquitiesSnapshot(equitiesValue);
	if (equities.status !== "valid" || !Array.isArray(leadingValue)) return null;

	const leadingAddresses = new Set<string>();
	for (const item of leadingValue) {
		if (!isRecord(item) || !isVaultAddress(item.address) || typeof item.name !== "string") return null;
		leadingAddresses.add(normalizeVaultAddress(item.address));
	}

	return {
		depositsByAddress: new Map(
			equities.equities.map((item) => [normalizeVaultAddress(item.vaultAddress), item.equity] as const),
		),
		leadingAddresses,
	};
}

export function deriveVaultOwnerView({
	detail,
	account,
	now,
}: {
	detail: VaultDetail;
	account: { status: "disconnected" | "loading" | "error" } | { status: "ready"; equities: readonly VaultEquity[] };
	now: number;
}): VaultOwnerViewState {
	if (account.status !== "ready") return account;

	const equity = account.equities.find(
		(item) => normalizeVaultAddress(item.vaultAddress) === normalizeVaultAddress(detail.vaultAddress),
	);
	const amount = equity?.equity ?? "0";
	const lockedUntil = equity?.lockedUntilTimestamp ?? detail.followerState?.lockupUntil ?? null;
	const entryTime = detail.followerState?.vaultEntryTime ?? null;
	const hasEquity = Big(amount).gt(0);
	const isLocked = hasEquity && lockedUntil !== null && lockedUntil > now;
	const maxWithdrawable = isLocked ? "0" : detail.maxWithdrawable;

	return {
		status: "ready",
		equity: amount,
		pnl: detail.followerState?.pnl ?? null,
		allTimePnl: detail.followerState?.allTimePnl ?? null,
		entryTime,
		lockedUntil,
		isLocked,
		lockProgress: deriveLockProgress(entryTime, lockedUntil, now),
		maxWithdrawable,
		canWithdraw: hasEquity && !isLocked && Big(maxWithdrawable).gt(0),
	};
}

export function deriveLockProgress(entryTime: number | null, lockedUntil: number | null, now: number): string | null {
	if (
		entryTime === null ||
		lockedUntil === null ||
		!isTimestamp(entryTime) ||
		!isTimestamp(lockedUntil) ||
		!isTimestamp(now) ||
		lockedUntil <= entryTime
	) {
		return null;
	}
	if (now <= entryTime) return "0";
	if (now >= lockedUntil) return "1";
	return Big(now - entryTime)
		.div(lockedUntil - entryTime)
		.toString();
}

export function getLatestVaultHistoryValue(
	snapshot: VaultPortfolioSnapshot,
	kind: "accountValue" | "pnl",
): string | null {
	const history = kind === "accountValue" ? snapshot.accountValueHistory : snapshot.pnlHistory;
	return history.at(-1)?.value ?? null;
}

export function formatVaultUsd(value: string | null | undefined, decimals = 2): string {
	const parsed = toBig(value, true);
	if (!parsed) return "—";
	return `${parsed.lt(0) ? "-" : ""}$${groupDecimal(parsed.abs().toFixed(decimals))}`;
}

export function formatVaultCompactUsd(value: string | null | undefined): string {
	const parsed = toBig(value, true);
	if (!parsed) return "—";
	const absolute = parsed.abs();
	const units = [
		{ threshold: Big("1000000000"), divisor: Big("1000000000"), suffix: "B" },
		{ threshold: Big("1000000"), divisor: Big("1000000"), suffix: "M" },
		{ threshold: Big("1000"), divisor: Big("1000"), suffix: "K" },
	] as const;
	const unit = units.find(({ threshold }) => absolute.gte(threshold));
	if (!unit) return formatVaultUsd(parsed.toString(), 2);
	const scaled = absolute.div(unit.divisor);
	const decimals = scaled.gte(100) ? 0 : scaled.gte(10) ? 1 : 2;
	return `${parsed.lt(0) ? "-" : ""}$${trimDecimal(scaled.toFixed(decimals))}${unit.suffix}`;
}

export function formatVaultRatio(value: string | null | undefined, decimals = 2, signed = false): string {
	const parsed = toBig(value, true);
	if (!parsed) return "—";
	const percent = parsed.times(100);
	const prefix = signed && percent.gt(0) ? "+" : "";
	return `${prefix}${groupDecimal(percent.toFixed(decimals))}%`;
}

export function getVaultValueTone(value: string | null | undefined): "positive" | "negative" | "neutral" {
	const parsed = toBig(value, true);
	if (!parsed || parsed.eq(0)) return "neutral";
	return parsed.gt(0) ? "positive" : "negative";
}

function parsePortfolio(value: unknown): Readonly<Record<VaultPeriod, VaultPortfolioSnapshot>> | null {
	if (!Array.isArray(value)) return null;
	const byPeriod = new Map<VaultPeriod, VaultPortfolioSnapshot>();
	for (const item of value) {
		if (!Array.isArray(item) || item.length !== 2 || !VAULT_PERIODS.includes(item[0] as VaultPeriod)) continue;
		const snapshot = parsePortfolioSnapshot(item[1]);
		if (!snapshot || byPeriod.has(item[0] as VaultPeriod)) return null;
		byPeriod.set(item[0] as VaultPeriod, snapshot);
	}
	if (VAULT_PERIODS.some((period) => !byPeriod.has(period))) return null;
	const result = {} as Record<VaultPeriod, VaultPortfolioSnapshot>;
	for (const period of VAULT_PERIODS) {
		const snapshot = byPeriod.get(period);
		if (!snapshot) return null;
		result[period] = snapshot;
	}
	return result;
}

function parsePortfolioSnapshot(value: unknown): VaultPortfolioSnapshot | null {
	if (!isRecord(value) || !isUnsignedDecimal(value.vlm)) return null;
	const accountValueHistory = parseHistory(value.accountValueHistory, false);
	const pnlHistory = parseHistory(value.pnlHistory, true);
	if (!accountValueHistory || !pnlHistory) return null;
	return { accountValueHistory, pnlHistory, volume: value.vlm };
}

function parseHistory(value: unknown, signed: boolean): VaultHistoryPoint[] | null {
	if (!Array.isArray(value)) return null;
	const history: VaultHistoryPoint[] = [];
	let lastTimestamp = -1;
	for (const item of value) {
		if (
			!Array.isArray(item) ||
			item.length !== 2 ||
			!isTimestamp(item[0]) ||
			(signed ? !isSignedDecimal(item[1]) : !isUnsignedDecimal(item[1])) ||
			item[0] < lastTimestamp
		) {
			return null;
		}
		lastTimestamp = item[0];
		history.push({ timestamp: item[0], value: item[1] });
	}
	return history;
}

function parseFollower(value: unknown, allowLeader: boolean): VaultFollower | VaultFollowerState | undefined {
	if (
		!isRecord(value) ||
		!(isVaultAddress(value.user) || (allowLeader && value.user === "Leader")) ||
		!isUnsignedDecimal(value.vaultEquity) ||
		!isSignedDecimal(value.pnl) ||
		!isSignedDecimal(value.allTimePnl) ||
		!Number.isSafeInteger(value.daysFollowing) ||
		(value.daysFollowing as number) < 0 ||
		!isTimestamp(value.vaultEntryTime) ||
		!isTimestamp(value.lockupUntil)
	) {
		return undefined;
	}
	return {
		user: value.user as `0x${string}` | "Leader",
		vaultEquity: value.vaultEquity,
		pnl: value.pnl,
		allTimePnl: value.allTimePnl,
		daysFollowing: value.daysFollowing as number,
		vaultEntryTime: value.vaultEntryTime,
		lockupUntil: value.lockupUntil,
	};
}

function parseRelationship(value: unknown): VaultDetail["relationship"] | null {
	if (!isRecord(value) || (value.type !== "normal" && value.type !== "child" && value.type !== "parent")) return null;
	if (value.type !== "parent") return value.type;
	if (
		!isRecord(value.data) ||
		!Array.isArray(value.data.childAddresses) ||
		!value.data.childAddresses.every(isVaultAddress)
	) {
		return null;
	}
	return "parent";
}

function quantizeUsdNumber(value: number): string {
	return trimDecimal(Big(String(value)).round(6, Big.roundDown).toFixed(6));
}

function toBig(value: string | null | undefined, signed: boolean): Big | null {
	if (typeof value !== "string" || !(signed ? SIGNED_DECIMAL_PATTERN : UNSIGNED_DECIMAL_PATTERN).test(value)) {
		return null;
	}
	try {
		return Big(value);
	} catch {
		return null;
	}
}

function groupDecimal(value: string): string {
	const [integer, fraction] = value.split(".");
	const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

function trimDecimal(value: string): string {
	if (!value.includes(".")) return value;
	return value.replace(/0+$/, "").replace(/\.$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
