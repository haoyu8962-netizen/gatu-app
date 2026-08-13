import { describe, expect, it } from "vitest";
import {
	createVaultAccountFacts,
	createVaultListItem,
	deriveLockProgress,
	deriveVaultOwnerView,
	formatVaultCompactUsd,
	formatVaultRatio,
	formatVaultUsd,
	groupVaultRows,
	parseVaultDetailsSnapshot,
	parseVaultEquitiesSnapshot,
	selectVaultRows,
	sumVaultTvl,
	type VaultAccountFactsState,
	type VaultDetail,
	type VaultListItem,
} from "@/components/vaults/domain/vaults";

const VAULT_A = "0x0000000000000000000000000000000000000001" as const;
const VAULT_B = "0x0000000000000000000000000000000000000002" as const;
const LEADER = "0x0000000000000000000000000000000000000003" as const;
const USER = "0x0000000000000000000000000000000000000004" as const;
const NOW = 1_786_579_200_000;

const EMPTY_ACCOUNT: VaultAccountFactsState = { status: "disconnected" };

const BASE_ROWS: readonly VaultListItem[] = [
	createListItem({ vaultAddress: VAULT_A, name: "Alpha", tvl: "9007199254740993.01", classification: "official" }),
	createListItem({ vaultAddress: VAULT_B, name: "Beta", tvl: "6.99", classification: "user" }),
];

describe("Vault list domain", () => {
	it("maps normalized public rows without inventing an Official/User classification", () => {
		const item = createVaultListItem({
			vaultAddress: VAULT_A,
			leader: LEADER,
			name: "Alpha",
			tvl: "10.5",
			apr: 0.125,
			isClosed: false,
			createTimeMillis: NOW,
			relationship: { type: "normal" },
			pnlHistory: { day: ["1"], week: ["2"], month: ["3"], allTime: ["4"] },
		});

		expect(item).toMatchObject({ apr: "0.125", classification: null, relationship: "normal" });
	});

	it("fails Official and User filters closed when any classification is unavailable", () => {
		const rows = [{ ...BASE_ROWS[0], classification: null }, BASE_ROWS[1]];
		expect(selectVaultRows({ rows, filter: "official", query: "", account: EMPTY_ACCOUNT })).toEqual({
			status: "unavailable",
			reason: "classification",
		});
		expect(selectVaultRows({ rows, filter: "user", query: "", account: EMPTY_ACCOUNT })).toEqual({
			status: "unavailable",
			reason: "classification",
		});
		expect(groupVaultRows(rows, false)).toEqual([{ id: "unclassified", rows }]);
	});

	it("filters only exact reviewed classifications", () => {
		const result = selectVaultRows({ rows: BASE_ROWS, filter: "official", query: "", account: EMPTY_ACCOUNT });
		expect(result.status).toBe("ready");
		if (result.status === "ready") expect(result.rows.map((row) => row.vaultAddress)).toEqual([VAULT_A]);
	});

	it.each([
		[{ status: "disconnected" }, "accountDisconnected"],
		[{ status: "loading" }, "accountLoading"],
		[{ status: "error" }, "accountError"],
	] as const)("fails account filters closed for %s", (account, reason) => {
		expect(selectVaultRows({ rows: BASE_ROWS, filter: "deposited", query: "", account })).toEqual({
			status: "unavailable",
			reason,
		});
		expect(selectVaultRows({ rows: BASE_ROWS, filter: "leading", query: "", account })).toEqual({
			status: "unavailable",
			reason,
		});
	});

	it("uses exact case-insensitive address membership for Deposited and Leading", () => {
		const facts = createVaultAccountFacts(
			[{ vaultAddress: VAULT_A.toUpperCase().replace("0X", "0x"), equity: "25.5", lockedUntilTimestamp: NOW }],
			[{ address: VAULT_B, name: "Beta" }],
		);
		expect(facts).not.toBeNull();
		if (!facts) return;
		const account = { status: "ready", facts } as const;
		const deposited = selectVaultRows({ rows: BASE_ROWS, filter: "deposited", query: "", account });
		const leading = selectVaultRows({ rows: BASE_ROWS, filter: "leading", query: "", account });
		expect(deposited.status === "ready" ? deposited.rows.map((row) => row.vaultAddress) : []).toEqual([VAULT_A]);
		expect(leading.status === "ready" ? leading.rows.map((row) => row.vaultAddress) : []).toEqual([VAULT_B]);
	});

	it("searches name, Vault address, and leader without turning a no-result search into feed empty", () => {
		const byName = selectVaultRows({ rows: BASE_ROWS, filter: "all", query: "alpha", account: EMPTY_ACCOUNT });
		const noResult = selectVaultRows({ rows: BASE_ROWS, filter: "all", query: "missing", account: EMPTY_ACCOUNT });
		expect(byName.status === "ready" ? byName.rows.map((row) => row.name) : []).toEqual(["Alpha"]);
		expect(noResult).toMatchObject({ status: "ready", rows: [], isSearchNoResults: true });
	});

	it("sums and formats financial strings with Big.js beyond JavaScript precision", () => {
		expect(sumVaultTvl(BASE_ROWS)).toBe("9007199254741000");
		expect(formatVaultUsd("9007199254740993.01")).toBe("$9,007,199,254,740,993.01");
		expect(formatVaultCompactUsd("125000000.25")).toBe("$125M");
		expect(formatVaultRatio("0.098", 1, true)).toBe("+9.8%");
		expect(formatVaultUsd("not-a-number")).toBe("—");
	});
});

describe("Vault detail runtime validation", () => {
	it("distinguishes valid, not-found, and malformed responses", () => {
		const valid = parseVaultDetailsSnapshot(createRawDetail());
		expect(valid.status).toBe("valid");
		expect(parseVaultDetailsSnapshot(null)).toEqual({ status: "notFound" });
		expect(parseVaultDetailsSnapshot({ ...createRawDetail(), maxWithdrawable: Number.NaN })).toEqual({
			status: "malformed",
		});
		expect(parseVaultDetailsSnapshot({ ...createRawDetail(), portfolio: [] })).toEqual({ status: "malformed" });
	});

	it("validates account equities as a whole rather than dropping malformed entries", () => {
		expect(
			parseVaultEquitiesSnapshot([{ vaultAddress: VAULT_A, equity: "10.5", lockedUntilTimestamp: NOW }]),
		).toMatchObject({ status: "valid" });
		expect(parseVaultEquitiesSnapshot([{ vaultAddress: VAULT_A, equity: "bad", lockedUntilTimestamp: NOW }])).toEqual({
			status: "malformed",
		});
	});

	it("uses returned account lock timestamps and fails withdrawal closed while locked", () => {
		const parsed = parseVaultDetailsSnapshot(createRawDetail());
		expect(parsed.status).toBe("valid");
		if (parsed.status !== "valid") return;
		const lockedUntilTimestamp = NOW + 86_400_000;
		const owner = deriveVaultOwnerView({
			detail: parsed.detail,
			account: {
				status: "ready",
				equities: [{ vaultAddress: VAULT_A, equity: "125", lockedUntilTimestamp }],
			},
			now: NOW,
		});
		expect(owner).toMatchObject({
			status: "ready",
			lockedUntil: lockedUntilTimestamp,
			isLocked: true,
			maxWithdrawable: "0",
			canWithdraw: false,
		});
	});

	it("derives time progress only from valid returned timestamps", () => {
		expect(deriveLockProgress(NOW, NOW + 1000, NOW + 500)).toBe("0.5");
		expect(deriveLockProgress(null, NOW + 1000, NOW)).toBeNull();
		expect(deriveLockProgress(NOW, NOW, NOW)).toBeNull();
	});
});

function createListItem({
	vaultAddress,
	name,
	tvl,
	classification,
}: {
	vaultAddress: `0x${string}`;
	name: string;
	tvl: string;
	classification: VaultListItem["classification"];
}): VaultListItem {
	return {
		vaultAddress,
		name,
		leader: LEADER,
		tvl,
		apr: "0.1",
		createdAt: NOW - 86_400_000,
		isClosed: false,
		relationship: "normal",
		pnlByPeriod: { day: ["0", "1"], week: ["0", "2"], month: ["0", "3"], allTime: ["0", "4"] },
		classification,
	};
}

function createRawDetail(): Record<string, unknown> {
	const portfolioSnapshot = {
		accountValueHistory: [
			[NOW - 1000, "100"],
			[NOW, "125"],
		],
		pnlHistory: [
			[NOW - 1000, "0"],
			[NOW, "25"],
		],
		vlm: "1000",
	};
	return {
		name: "Alpha",
		vaultAddress: VAULT_A,
		leader: LEADER,
		description: "Market-making Vault",
		portfolio: [
			["day", portfolioSnapshot],
			["week", portfolioSnapshot],
			["month", portfolioSnapshot],
			["allTime", portfolioSnapshot],
		],
		apr: 0.098,
		followerState: {
			user: USER,
			vaultEquity: "125",
			pnl: "5",
			allTimePnl: "25",
			daysFollowing: 12,
			vaultEntryTime: NOW - 86_400_000,
			lockupUntil: NOW + 3 * 86_400_000,
		},
		leaderFraction: 0.1,
		leaderCommission: 0.1,
		followers: [],
		maxDistributable: 10,
		maxWithdrawable: 124.123456789,
		isClosed: false,
		relationship: { type: "normal" },
		allowDeposits: true,
		alwaysCloseOnWithdraw: false,
	} satisfies Record<keyof VaultDetail | "followerState", unknown>;
}
