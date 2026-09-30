import { describe, expect, it } from "vitest";
import {
	createVaultAccountFacts,
	createVaultListItem,
	deriveLockProgress,
	deriveVaultActionsAvailability,
	deriveVaultOwnerView,
	formatVaultCompactUsd,
	formatVaultRatio,
	formatVaultSignedUsd,
	formatVaultUsd,
	getVaultMark,
	getVaultRequestAvailability,
	groupVaultRows,
	parseVaultDetailsSnapshot,
	parseVaultEquitiesSnapshot,
	selectVaultDiscoveryRows,
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
const VAULT_C = "0x0000000000000000000000000000000000000005" as const;
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

	it("orders positive account equity first, then TVL descending, with stable ties", () => {
		const rows = [
			createListItem({ vaultAddress: VAULT_A, name: "First equal", tvl: "100", classification: null }),
			createListItem({ vaultAddress: VAULT_B, name: "Deposited", tvl: "1", classification: null }),
			createListItem({ vaultAddress: VAULT_C, name: "Second equal", tvl: "100.0", classification: null }),
		];
		const facts = createVaultAccountFacts(
			[
				{ vaultAddress: VAULT_B, equity: "0.00000001", lockedUntilTimestamp: NOW },
				{ vaultAddress: VAULT_C, equity: "0", lockedUntilTimestamp: NOW },
			],
			[],
		);
		expect(facts).not.toBeNull();
		if (!facts) return;
		const account = { status: "ready", facts } as const;
		const all = selectVaultRows({ rows, filter: "all", query: "", account });
		expect(all.status === "ready" ? all.rows.map((row) => row.name) : []).toEqual([
			"Deposited",
			"First equal",
			"Second equal",
		]);
		const deposited = selectVaultRows({ rows, filter: "deposited", query: "", account });
		expect(deposited.status === "ready" ? deposited.rows.map((row) => row.name) : []).toEqual(["Deposited"]);
	});

	it("searches name, Vault address, and leader without turning a no-result search into feed empty", () => {
		const byName = selectVaultRows({ rows: BASE_ROWS, filter: "all", query: "alpha", account: EMPTY_ACCOUNT });
		const noResult = selectVaultRows({ rows: BASE_ROWS, filter: "all", query: "missing", account: EMPTY_ACCOUNT });
		expect(byName.status === "ready" ? byName.rows.map((row) => row.name) : []).toEqual(["Alpha"]);
		expect(noResult).toMatchObject({ status: "ready", rows: [], isSearchNoResults: true });
	});

	it("sums and formats financial strings with Big.js beyond JavaScript precision", () => {
		expect(sumVaultTvl(BASE_ROWS)).toBe("9007199254741000");
		const child = { ...BASE_ROWS[1], vaultAddress: USER, relationship: "child" as const, tvl: "100" };
		const closed = { ...BASE_ROWS[1], vaultAddress: VAULT_C, isClosed: true };
		const openZero = { ...BASE_ROWS[1], tvl: "0" };
		expect(sumVaultTvl([...BASE_ROWS, child])).toBe("9007199254741000");
		expect(selectVaultDiscoveryRows([...BASE_ROWS, child, closed, openZero])).toEqual([...BASE_ROWS, closed, openZero]);
		const visible = selectVaultRows({
			rows: selectVaultDiscoveryRows([...BASE_ROWS, child, closed, openZero]),
			filter: "all",
			query: "",
			account: EMPTY_ACCOUNT,
		});
		expect(visible.status === "ready" ? visible.rows.some((row) => row.isClosed) : true).toBe(false);
		expect(formatVaultUsd("9007199254740993.01")).toBe("$9,007,199,254,740,993.01");
		expect(formatVaultSignedUsd("1250.75")).toBe("+$1,250.75");
		expect(formatVaultSignedUsd("-1250.75")).toBe("-$1,250.75");
		expect(formatVaultSignedUsd("0")).toBe("$0.00");
		expect(formatVaultCompactUsd("125000000.25")).toBe("$125M");
		expect(formatVaultRatio("0.098", 1, true)).toBe("+9.8%");
		expect(formatVaultUsd("not-a-number")).toBe("—");
	});

	it("marks a Vault with its first two letters or digits, skipping punctuation and emoji", () => {
		expect(getVaultMark("Hyperliquidity Provider (HLP)")).toBe("HY");
		expect(getVaultMark("[ Systemic Strategies ] ♾️ HyperGrowth ♾️")).toBe("SY");
		expect(getVaultMark("♾️ 42 Fund")).toBe("42");
		expect(getVaultMark("x🚀y")).toBe("XY");
		expect(getVaultMark("示例核心金库")).toBe("示例");
		expect(getVaultMark("éclair")).toBe("ÉC");
		expect(getVaultMark("हिंदी वॉल्ट")).toBe("हिंदी");
		expect(getVaultMark("🚀 ♾️")).toBe("V");
		expect(getVaultMark("")).toBe("V");
	});
});

describe("Vault detail runtime validation", () => {
	it("returns structured fail-closed action reasons without blocking a reconnectable deposit", () => {
		const geoChecking = getVaultRequestAvailability({
			country: null,
			isError: false,
			isResolving: true,
			isResolved: false,
			proxy: false,
			tradeRestricted: false,
		});
		expect(geoChecking).toEqual({ available: false, reason: "geo-checking" });
		expect(
			getVaultRequestAvailability({
				country: "US",
				isError: false,
				isResolving: false,
				isResolved: true,
				proxy: true,
				tradeRestricted: false,
			}),
		).toEqual({ available: false, reason: "geo-restricted" });
		expect(
			getVaultRequestAvailability({
				country: null,
				isError: false,
				isResolving: false,
				isResolved: true,
				proxy: false,
				tradeRestricted: false,
			}),
		).toEqual({ available: false, reason: "geo-unavailable" });

		const parsed = parseVaultDetailsSnapshot(createRawDetail());
		expect(parsed.status).toBe("valid");
		if (parsed.status !== "valid") return;
		const request = { available: true, reason: null } as const;
		expect(
			deriveVaultActionsAvailability({ detail: parsed.detail, owner: { status: "disconnected" }, request }),
		).toEqual({
			deposit: { available: true, reason: null },
			withdraw: { available: false, reason: "owner-disconnected" },
		});
		expect(
			deriveVaultActionsAvailability({
				detail: { ...parsed.detail, isClosed: true },
				owner: { status: "loading" },
				request,
			}),
		).toEqual({
			deposit: { available: false, reason: "vault-closed" },
			withdraw: { available: false, reason: "owner-loading" },
		});
		expect(
			deriveVaultActionsAvailability({ detail: parsed.detail, owner: { status: "error" }, request: geoChecking }),
		).toEqual({
			deposit: { available: false, reason: "geo-checking" },
			withdraw: { available: false, reason: "geo-checking" },
		});
	});

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
