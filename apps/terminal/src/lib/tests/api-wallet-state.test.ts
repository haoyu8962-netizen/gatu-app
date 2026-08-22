import { describe, expect, it } from "vitest";
import {
	API_WALLET_EXPIRY_DAYS,
	API_WALLET_ZERO_ADDRESS,
	type ApiWalletPageStateInput,
	createApiWalletApproval,
	createApiWalletRemoval,
	deriveApiWalletAgentStatus,
	deriveApiWalletPageState,
	type ExtraAgent,
	hasMatchingApiWalletIdentity,
	isApiWalletExtraAgentSnapshot,
	isApiWalletPageOperable,
	isApiWalletRemovalReconciled,
	matchesApiWalletApproval,
	validateApiWalletName,
} from "@/components/api-wallet/api-wallet-state";

const NOW_MS = 1_786_579_200_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACCOUNT = "0x49B600000000000000000000000000000000E685";
const AGENT_ADDRESS = "0x2De29E088FDde87E2F25B39Cd1eeC09B18f2b1F3";
const AGENT: ExtraAgent = {
	name: "grid-bot",
	address: AGENT_ADDRESS,
	validUntil: NOW_MS + 30 * DAY_MS,
};

const READY_INPUT: ApiWalletPageStateInput = {
	isConnected: true,
	accountAddress: ACCOUNT,
	signingAddress: ACCOUNT.toLowerCase(),
	isLoading: false,
	isError: false,
	agents: [AGENT],
};

describe("API wallet page state", () => {
	it.each([
		["normal", READY_INPUT],
		["empty", { ...READY_INPUT, agents: [] }],
		["loading", { ...READY_INPUT, isLoading: true, agents: undefined }],
		["error", { ...READY_INPUT, isError: true, agents: undefined }],
		["disconnected", { ...READY_INPUT, isConnected: false }],
		["nonMaster", { ...READY_INPUT, signingAddress: "0xbb410000000000000000000000000000000077c2" }],
	] as const)("derives the %s state", (expected, input) => {
		expect(deriveApiWalletPageState(input)).toBe(expected);
	});

	it("fails closed when identity or a settled snapshot is missing", () => {
		expect(deriveApiWalletPageState({ ...READY_INPUT, accountAddress: undefined })).toBe("nonMaster");
		expect(deriveApiWalletPageState({ ...READY_INPUT, signingAddress: undefined })).toBe("nonMaster");
		expect(deriveApiWalletPageState({ ...READY_INPUT, agents: undefined })).toBe("error");
	});

	it("treats only case as insignificant when matching the signer", () => {
		expect(hasMatchingApiWalletIdentity(ACCOUNT, ACCOUNT.toLowerCase())).toBe(true);
		expect(hasMatchingApiWalletIdentity(ACCOUNT, ` ${ACCOUNT}`)).toBe(false);
		expect(hasMatchingApiWalletIdentity("", "")).toBe(false);
		expect(hasMatchingApiWalletIdentity(null, ACCOUNT)).toBe(false);
	});

	it.each([
		["normal", true],
		["empty", true],
		["loading", false],
		["error", false],
		["disconnected", false],
		["nonMaster", false],
	] as const)("marks %s operability as %s", (state, expected) => {
		expect(isApiWalletPageOperable(state)).toBe(expected);
	});
});

describe("API wallet snapshot validation", () => {
	it("accepts protocol tuples without applying create-form name restrictions", () => {
		expect(
			isApiWalletExtraAgentSnapshot([
				{ ...AGENT, name: "Legacy Name" },
				{ ...AGENT, name: "", validUntil: null },
			]),
		).toBe(true);
	});

	it.each([
		null,
		{},
		[{ ...AGENT, address: "not-an-address" }],
		[{ ...AGENT, name: null }],
		[{ ...AGENT, validUntil: Number.NaN }],
		[{ ...AGENT, validUntil: Number.MAX_SAFE_INTEGER }],
	])("rejects a malformed extraAgents snapshot %#", (snapshot) => {
		expect(isApiWalletExtraAgentSnapshot(snapshot)).toBe(false);
	});
});

describe("API wallet name validation", () => {
	it("normalizes surrounding whitespace and accepts the product character set", () => {
		expect(validateApiWalletName("  grid-bot_2  ")).toEqual({
			valid: true,
			name: "grid-bot_2",
			error: null,
		});
		expect(validateApiWalletName("ab").valid).toBe(true);
		expect(validateApiWalletName("abcdefghijklmnop").valid).toBe(true);
	});

	it.each([
		["", "required"],
		[" ", "required"],
		["a", "format"],
		["abcdefghijklmnopq", "format"],
		["grid bot", "format"],
		["grid.bot", "format"],
		["机器人", "format"],
	] as const)("rejects %j with %s", (name, error) => {
		expect(validateApiWalletName(name)).toMatchObject({ valid: false, error });
	});

	it("blocks duplicate base names case-insensitively", () => {
		expect(validateApiWalletName("GRID-BOT", [AGENT])).toEqual({
			valid: false,
			name: "GRID-BOT",
			error: "duplicate",
		});
	});
});

describe("API wallet approval mapping", () => {
	it.each(API_WALLET_EXPIRY_DAYS)("encodes a finite %i-day expiry in the approveAgent name", (expiryDays) => {
		const approval = createApiWalletApproval(" grid-bot ", AGENT_ADDRESS, expiryDays, NOW_MS);
		const validUntil = NOW_MS + expiryDays * DAY_MS;

		expect(approval).toEqual({
			baseName: "grid-bot",
			address: AGENT_ADDRESS,
			validUntil,
			approveAgent: {
				agentAddress: AGENT_ADDRESS,
				agentName: `grid-bot valid_until ${validUntil}`,
			},
		});
	});

	it("rejects names, expiries, addresses, and timestamps outside the mapping contract", () => {
		expect(() => createApiWalletApproval("a", AGENT_ADDRESS, 30, NOW_MS)).toThrow();
		expect(() => createApiWalletApproval("grid-bot", "", 30, NOW_MS)).toThrow();
		expect(() => createApiWalletApproval("grid-bot", AGENT_ADDRESS, 365 as 30, NOW_MS)).toThrow();
		expect(() => createApiWalletApproval("grid-bot", AGENT_ADDRESS, 30, Number.NaN)).toThrow();
	});

	it("reconciles only an exact base name, address, and validUntil tuple", () => {
		const approval = createApiWalletApproval("grid-bot", AGENT_ADDRESS, 30, NOW_MS);
		const exactAgent = {
			name: approval.baseName,
			address: approval.address.toLowerCase(),
			validUntil: approval.validUntil,
		};

		expect(matchesApiWalletApproval(exactAgent, approval)).toBe(true);
		expect(matchesApiWalletApproval({ ...exactAgent, name: "GRID-BOT" }, approval)).toBe(false);
		expect(matchesApiWalletApproval({ ...exactAgent, address: `${approval.address}0` }, approval)).toBe(false);
		expect(matchesApiWalletApproval({ ...exactAgent, validUntil: approval.validUntil + 1 }, approval)).toBe(false);
	});
});

describe("API wallet removal mapping", () => {
	it("keeps the exact returned tuple and sends the zero address with the exact returned name", () => {
		const removal = createApiWalletRemoval(AGENT);

		expect(removal).toEqual({
			target: AGENT,
			approveAgent: {
				agentAddress: API_WALLET_ZERO_ADDRESS,
				agentName: AGENT.name,
			},
		});
	});

	it("succeeds only after both the old address and exact name are absent from a definitive snapshot", () => {
		const removal = createApiWalletRemoval(AGENT);

		expect(isApiWalletRemovalReconciled(undefined, removal)).toBe(false);
		expect(isApiWalletRemovalReconciled([{ ...AGENT, address: AGENT.address.toUpperCase() }], removal)).toBe(false);
		expect(isApiWalletRemovalReconciled([{ ...AGENT, validUntil: (AGENT.validUntil ?? 0) + 1 }], removal)).toBe(false);
		expect(isApiWalletRemovalReconciled([{ ...AGENT, name: "replacement", validUntil: null }], removal)).toBe(false);
		expect(
			isApiWalletRemovalReconciled([{ ...AGENT, name: AGENT.name, address: API_WALLET_ZERO_ADDRESS }], removal),
		).toBe(false);
		expect(
			isApiWalletRemovalReconciled([{ ...AGENT, name: "replacement", address: API_WALLET_ZERO_ADDRESS }], removal),
		).toBe(true);
		expect(
			isApiWalletRemovalReconciled(
				[{ ...AGENT, name: AGENT.name.toUpperCase(), address: API_WALLET_ZERO_ADDRESS }],
				removal,
			),
		).toBe(true);
		expect(isApiWalletRemovalReconciled([], removal)).toBe(true);
	});
});

describe("API wallet validity status", () => {
	it.each([
		[null, "noExpiry"],
		[Number.POSITIVE_INFINITY, "expired"],
		[NOW_MS - 1, "expired"],
		[NOW_MS, "expired"],
		[NOW_MS + DAY_MS - 1, "today"],
		[NOW_MS + DAY_MS, "expiring"],
		[NOW_MS + 7 * DAY_MS + (DAY_MS - 1), "expiring"],
		[NOW_MS + 8 * DAY_MS, "active"],
	] as const)("classifies %s as %s", (validUntil, expected) => {
		expect(deriveApiWalletAgentStatus(validUntil, NOW_MS)).toBe(expected);
	});
});
