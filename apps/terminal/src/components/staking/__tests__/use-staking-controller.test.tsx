// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { useStakingController } from "../use-staking-controller";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const AGENT = "0x2222222222222222222222222222222222222222" as const;
const VALIDATOR = "0x3333333333333333333333333333333333333333" as const;
const SIGNER = "0x4444444444444444444444444444444444444444" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

interface QueryState {
	data: unknown;
	isError: boolean;
	isFetching: boolean;
	refetch: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
	activeOwner: null as null | { env: "Mainnet" | "Testnet"; address: `0x${string}` },
	env: "Mainnet" as "Mainnet" | "Testnet",
	queries: new Map<string, QueryState>(),
	queryCalls: [] as Array<{ method: string; params: unknown; options: { enabled?: boolean } }>,
	reconnectWallet: vi.fn(),
	wallet: {
		address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
		hasWalletAccess: true,
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
		walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	},
}));

vi.mock("@sairn/hl-react", () => ({ useActiveAgentOwner: () => mocks.activeOwner }));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({ reconnectWallet: mocks.reconnectWallet, isReconnecting: false }),
	useWalletSession: () => mocks.wallet,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: mocks.env }),
	useInfo: (method: string, params: unknown, options: { enabled?: boolean }) => {
		mocks.queryCalls.push({ method, params, options });
		const query = mocks.queries.get(method);
		if (!query) throw new Error(`Missing query fixture for ${method}`);
		return query;
	},
}));

let controller: ReturnType<typeof useStakingController> | null = null;

function Probe() {
	controller = useStakingController();
	return null;
}

function current() {
	if (!controller) throw new Error("Controller was not captured");
	return controller;
}

function query(data: unknown): QueryState {
	return { data, isError: false, isFetching: false, refetch: vi.fn() };
}

function validValidator() {
	return {
		validator: VALIDATOR,
		signer: SIGNER,
		name: "Verified Validator",
		description: "Fixture",
		nRecentBlocks: 10,
		stake: 100_000_000,
		isJailed: false,
		unjailableAfter: null,
		isActive: true,
		commission: "0.03",
		stats: [
			["day", { uptimeFraction: "1", predictedApr: "0.02", nSamples: 1 }],
			["week", { uptimeFraction: "1", predictedApr: "0.03", nSamples: 7 }],
			["month", { uptimeFraction: "1", predictedApr: "0.04", nSamples: 30 }],
		],
	};
}

function resetQueries() {
	mocks.queries = new Map([
		["validatorSummaries", query([validValidator()])],
		[
			"delegatorSummary",
			query({ delegated: "5", undelegated: "2", totalPendingWithdrawal: "1", nPendingWithdrawals: 1 }),
		],
		["delegations", query([{ validator: VALIDATOR, amount: "5", lockedUntilTimestamp: 1_700_000_000_000 }])],
		["delegatorRewards", query([{ time: 1_700_000_000_000, source: "delegation", totalAmount: "0.1" }])],
		["delegatorHistory", query([{ time: 1_700_000_000_000, hash: HASH, delta: { cDeposit: { amount: "7" } } }])],
		[
			"spotClearinghouseState",
			query({ balances: [{ coin: "HYPE", token: 150, total: "9", hold: "1", entryNtl: "0" }] }),
		],
		["userFees", query({ stakingLink: null })],
	]);
}

describe("useStakingController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.activeOwner = null;
		mocks.env = "Mainnet";
		mocks.queryCalls = [];
		mocks.reconnectWallet.mockReset();
		mocks.wallet = {
			address: OWNER,
			hasWalletAccess: true,
			sessionMode: "wallet",
			walletAddress: OWNER,
		};
		resetQueries();
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render() {
		act(() => root.render(<Probe />));
	}

	it("queries account data with the exact active master and derives the normal snapshot", () => {
		render();

		expect(current()).toMatchObject({
			pageState: "normal",
			publicState: "ready",
			accountState: "ready",
			ownerAddress: OWNER,
			hasExactMasterSigner: true,
			agentOnlySession: false,
			networkStakeApproximate: "1",
			weightedApr: "0.03",
		});
		expect(current().account).toMatchObject({ spotHypeAvailable: "8", summary: { delegated: "5" } });
		for (const call of mocks.queryCalls.filter((entry) => entry.method !== "validatorSummaries")) {
			expect(call.params).toEqual({ user: OWNER });
			expect(call.options.enabled).toBe(true);
		}
	});

	it("uses the persisted master owner for an Agent-only read session and never the Agent address", () => {
		mocks.wallet = {
			address: AGENT,
			hasWalletAccess: false,
			sessionMode: "agent-only",
			walletAddress: undefined,
		};
		mocks.activeOwner = { env: "Mainnet", address: OWNER };
		render();

		expect(current()).toMatchObject({
			pageState: "nonSigning",
			accountState: "ready",
			ownerAddress: OWNER,
			hasExactMasterSigner: false,
			agentOnlySession: true,
		});
		expect(
			mocks.queryCalls.some((entry) => entry.params !== undefined && JSON.stringify(entry.params).includes(AGENT)),
		).toBe(false);
	});

	it("fails closed when an Agent-only owner is missing or belongs to another environment", () => {
		mocks.wallet = {
			address: AGENT,
			hasWalletAccess: false,
			sessionMode: "agent-only",
			walletAddress: undefined,
		};
		mocks.activeOwner = { env: "Testnet", address: OWNER };
		render();

		expect(current()).toMatchObject({ pageState: "disconnected", accountState: "disconnected" });
		for (const call of mocks.queryCalls.filter((entry) => entry.method !== "validatorSummaries")) {
			expect(call.params).toEqual({ user: "" });
			expect(call.options.enabled).toBe(false);
		}
	});

	it("distinguishes loading, malformed error, disconnected, and non-signing states", () => {
		mocks.queries.set("validatorSummaries", query(undefined));
		render();
		expect(current().pageState).toBe("loading");

		mocks.queries.set("validatorSummaries", query([validValidator()]));
		mocks.queries.set("delegatorSummary", query({ delegated: "invalid" }));
		render();
		expect(current()).toMatchObject({ pageState: "error", accountState: "failed" });

		resetQueries();
		mocks.wallet = {
			address: undefined,
			hasWalletAccess: false,
			sessionMode: "disconnected",
			walletAddress: undefined,
		};
		render();
		expect(current().pageState).toBe("disconnected");

		mocks.wallet = {
			address: OWNER,
			hasWalletAccess: false,
			sessionMode: "wallet",
			walletAddress: OWNER,
		};
		render();
		expect(current().pageState).toBe("nonSigning");
	});

	it("exposes retries without signing or assembling an exchange request", () => {
		render();
		act(() => current().retryPublic());
		act(() => current().retryAccount());
		act(() => current().connectMasterWallet());

		expect(mocks.queries.get("validatorSummaries")?.refetch).toHaveBeenCalledOnce();
		for (const [method, state] of mocks.queries) {
			if (method !== "validatorSummaries") expect(state.refetch).toHaveBeenCalledOnce();
		}
		expect(mocks.reconnectWallet).toHaveBeenCalledOnce();
	});
});
