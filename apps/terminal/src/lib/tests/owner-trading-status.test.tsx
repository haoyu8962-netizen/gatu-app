// @vitest-environment jsdom

import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { useTradingAuthorization } from "@sairn/hl-react/signing/use-trading-authorization";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type HyperliquidOwnerSigner,
	HyperliquidOwnerSignerProvider,
} from "../../../../../packages/hl-react/src/signing/owner-signer-provider";
import { useTradingStatus } from "../../../../../packages/hl-react/src/signing/use-trading-status";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";
const BUILDER = "0x3333333333333333333333333333333333333333";
const state = vi.hoisted(() => ({
	fee: 0,
	agents: undefined as Array<{ address: string; name: string; validUntil: number | null }> | undefined,
	queryCalls: [] as Array<{ method: string; enabled: boolean }>,
	refetchAgent: vi.fn(),
	refetchFee: vi.fn(),
	approveFee: vi.fn(),
	registerAgent: vi.fn(),
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		sessionMode: "wallet",
		clientKey: OWNER,
		agentName: "sairn-dev",
		builderConfig: { b: BUILDER, f: 10 },
	}),
}));
vi.mock("@sairn/hl-react/hooks/useInfo", () => ({
	useInfo: (method: string, _params: unknown, options: { enabled: boolean }) => {
		state.queryCalls.push({ method, enabled: options.enabled });
		if (method === "extraAgents")
			return {
				data: state.agents,
				error: state.agents ? null : new Error("Unavailable Agent endpoint"),
				isLoading: !state.agents,
				isFetching: false,
				dataUpdatedAt: 0,
				refetch: state.refetchAgent,
			};
		return {
			data: state.fee,
			error: null,
			isLoading: false,
			isFetching: false,
			dataUpdatedAt: 1,
			refetch: state.refetchFee,
		};
	},
}));
vi.mock("@sairn/hl-react/signing/agent-storage", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/hl-react/signing/agent-storage")>()),
	useAgentWalletStorage: () => ({ publicKey: AGENT, privateKey: "0x01", source: "local-registration" }),
	useInvalidAgentStorageRecord: () => false,
	readAgentFromStorage: () => ({ publicKey: AGENT, privateKey: "0x01", source: "local-registration" }),
}));
vi.mock("@sairn/hl-react/signing/use-agent-registration", () => ({
	useAgentRegistration: () => ({ register: state.registerAgent, status: "idle", error: null }),
}));
vi.mock("@sairn/hl-react/signing/use-builder-fee-approval", () => ({
	useBuilderFeeApproval: () => ({ approve: state.approveFee, status: "idle", error: null }),
}));

const wallet: AbstractViemJsonRpcAccount = {
	getAddresses: async () => [OWNER],
	getChainId: async () => 42161,
	signTypedData: vi.fn(),
};

describe("owner and Agent trading readiness", () => {
	let root: Root;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let observed: ReturnType<typeof useTradingStatus>;
	let authorization: ReturnType<typeof useTradingAuthorization>;

	function Probe({ requiresBuilderFee }: { requiresBuilderFee: boolean }) {
		observed = useTradingStatus();
		authorization = useTradingAuthorization({ requiresBuilderFee });
		return null;
	}

	function render(value: HyperliquidOwnerSigner | null, requiresBuilderFee = true) {
		act(() =>
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(HyperliquidOwnerSignerProvider, { value }, createElement(Probe, { requiresBuilderFee })),
				),
			),
		);
	}

	beforeEach(() => {
		container = document.createElement("div");
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		state.fee = 0;
		state.agents = undefined;
		state.queryCalls = [];
		state.refetchAgent.mockReset().mockImplementation(async () => ({ data: state.agents, error: null }));
		state.refetchFee.mockReset().mockImplementation(async () => ({ data: state.fee, error: null }));
		state.registerAgent.mockReset();
		state.approveFee.mockReset().mockImplementation(async () => {
			state.fee = 10;
		});
	});
	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
	});

	it("is ready without an Agent once the exact owner and builder permission are ready", () => {
		state.fee = 10;
		const assertCurrent = vi.fn();
		render({ ownerAddress: OWNER, wallet, assertCurrent });
		expect(observed).toMatchObject({
			signerMode: "owner",
			isSignerReady: true,
			needsAgent: false,
			isReady: true,
			signerAddress: OWNER,
		});
		expect(state.queryCalls.filter(({ method }) => method === "extraAgents").every(({ enabled }) => !enabled)).toBe(
			true,
		);
		expect(assertCurrent).not.toHaveBeenCalled();
	});

	it("requires the builder fee on the relevant action without ever registering an Agent", async () => {
		render({ ownerAddress: OWNER, wallet, assertCurrent: vi.fn() });
		expect(observed.isReady).toBe(false);
		await act(async () => {
			await expect(authorization.authorize()).resolves.toBe(OWNER);
		});
		expect(state.approveFee).toHaveBeenCalledOnce();
		expect(state.registerAgent).not.toHaveBeenCalled();
		expect(state.refetchAgent).not.toHaveBeenCalled();
	});

	it("keeps TWAP independent from Agent and builder-fee queries", async () => {
		render({ ownerAddress: OWNER, wallet, assertCurrent: vi.fn() }, false);
		await act(async () => {
			await expect(authorization.authorize()).resolves.toBe(OWNER);
		});
		expect(state.refetchAgent).not.toHaveBeenCalled();
		expect(state.refetchFee).not.toHaveBeenCalled();
		expect(state.approveFee).not.toHaveBeenCalled();
	});

	it("does not treat a stored Agent as fallback for an unavailable or mismatched owner", async () => {
		render({ ownerAddress: OWNER, wallet: null, assertCurrent: vi.fn() }, false);
		expect(observed).toMatchObject({ signerMode: "owner", isSignerReady: false, needsAgent: false, isReady: false });
		await expect(observed.refetchSigner()).rejects.toThrow("signing identity changed");
		render({ ownerAddress: AGENT, wallet, assertCurrent: vi.fn() }, false);
		expect(observed.isSignerReady).toBe(false);
		expect(state.registerAgent).not.toHaveBeenCalled();
	});

	it("rechecks the live owner after a builder status request", async () => {
		let current = true;
		render({
			ownerAddress: OWNER,
			wallet,
			assertCurrent() {
				if (!current) throw new Error("Owner changed");
			},
		});
		state.refetchFee.mockImplementation(async () => {
			current = false;
			return { data: 10, error: null };
		});
		await expect(observed.refetchBuilderFee()).rejects.toThrow("Owner changed");
	});

	it("keeps external trading dependent on an actual approved Agent", () => {
		render(null);
		expect(observed).toMatchObject({ signerMode: "agent", isSignerReady: false, isReady: false });
		state.fee = 10;
		state.agents = [{ address: AGENT, name: "sairn-dev", validUntil: null }];
		render(null);
		expect(observed).toMatchObject({ signerMode: "agent", isSignerReady: true, isReady: true, signerAddress: AGENT });
		expect(state.queryCalls.some(({ method, enabled }) => method === "extraAgents" && enabled)).toBe(true);
	});
});
