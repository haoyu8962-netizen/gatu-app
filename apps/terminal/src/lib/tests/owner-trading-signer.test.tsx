// @vitest-environment jsdom

import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { useHyperliquidClients } from "@sairn/hl-react/hooks/useClients";
import { useExchange } from "@sairn/hl-react/hooks/useExchange";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOwnerSignerClient } from "../../../../../packages/hl-react/src/signing/owner-signer-client";
import {
	type HyperliquidOwnerSigner,
	HyperliquidOwnerSignerProvider,
	useHyperliquidOwnerSigner,
} from "../../../../../packages/hl-react/src/signing/owner-signer-provider";

const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const OWNER = account.address;
const OTHER = "0x2222222222222222222222222222222222222222";
const state = vi.hoisted(() => ({
	clientKey: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
	agentClient: { kind: "agent" },
	getTradingClient: vi.fn(),
	httpRequest: vi.fn(),
	exchangeLifecycle: { id: Symbol("owner-trading-test"), active: true },
	externalClient: { account: { address: "0x2222222222222222222222222222222222222222" }, signTypedData: vi.fn() },
	connectionChainId: 42161 as number,
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		clientKey: state.clientKey,
		env: "Mainnet",
		isTestnet: false,
		sessionMode: "wallet",
		exchangeLifecycle: state.exchangeLifecycle,
		info: {},
		subscription: {},
	}),
}));
vi.mock("@sairn/hl-react/clients", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/hl-react/clients")>()),
	getTradingClient: state.getTradingClient,
	getHttpTransport: () => ({ isTestnet: false, request: state.httpRequest }),
}));
vi.mock("../../../../../packages/hl-react/src/signing/use-agent-wallet", () => ({
	useAgentWallet: () => ({ signer: { address: OTHER }, address: OTHER, isReady: true }),
}));
vi.mock("wagmi", () => ({
	useConnection: () => ({ chainId: state.connectionChainId }),
	useWalletClient: (parameters?: { chainId?: number }) => ({
		data: parameters?.chainId === state.connectionChainId ? state.externalClient : undefined,
	}),
}));

function wallet() {
	return {
		getAddresses: vi.fn(async () => [OWNER]),
		getChainId: vi.fn(async () => 42161),
		signTypedData: vi.fn(async (typedData) => account.signTypedData(typedData)),
	} satisfies AbstractViemJsonRpcAccount;
}

function transport() {
	const requestMock = vi.fn();
	return {
		isTestnet: false,
		request<T>(endpoint: "info" | "exchange", payload: unknown, signal?: AbortSignal): Promise<T> {
			requestMock(endpoint, payload, signal);
			return Promise.resolve({ status: "ok", response: { type: "default" } } as T);
		},
		requestMock,
	};
}

describe("embedded owner trading signer", () => {
	let root: Root;
	let container: HTMLDivElement;
	let observed: ReturnType<typeof useHyperliquidClients>;
	let binding: HyperliquidOwnerSigner | null;
	let queryClient: QueryClient;
	let cancellation: { mutateAsync: (params: { cancels: Array<{ a: number; o: number }> }) => Promise<unknown> };

	function Probe() {
		observed = useHyperliquidClients();
		binding = useHyperliquidOwnerSigner();
		cancellation = useExchange("cancel");
		return null;
	}

	function render(value: HyperliquidOwnerSigner | null) {
		act(() =>
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(HyperliquidOwnerSignerProvider, { value }, createElement(Probe)),
				),
			),
		);
	}

	beforeEach(() => {
		vi.stubGlobal("navigator", {
			...navigator,
			locks: { request: async (_name: string, _options: unknown, callback: () => unknown) => callback() },
		});
		localStorage.clear();
		localStorage.setItem(
			`hyperliquid_agent_registration_session_Mainnet_${OWNER.toLowerCase()}`,
			JSON.stringify({ version: 1, epoch: "11111111-1111-4111-8111-111111111111", state: "active" }),
		);
		container = document.createElement("div");
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		state.clientKey = OWNER;
		state.getTradingClient.mockReset().mockReturnValue(state.agentClient);
		state.httpRequest.mockReset().mockResolvedValue({ status: "ok", response: { type: "default" } });
	});
	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		vi.unstubAllGlobals();
	});

	it("selects the exact owner for trading and user actions, ignoring an old Agent and an unrelated external wallet", () => {
		render({ ownerAddress: OWNER, wallet: wallet(), assertCurrent: vi.fn() });
		expect(observed.trading).toBe(observed.user);
		expect(observed.trading).not.toBeNull();
		expect(observed.agentPublicKey).toBeNull();
		expect(state.getTradingClient).not.toHaveBeenCalled();
	});

	it("keeps an unready owner path closed without falling back", () => {
		render({ ownerAddress: OWNER, wallet: null, assertCurrent: vi.fn() });
		expect(observed.trading).toBeNull();
		expect(observed.user).toBeNull();
		expect(state.getTradingClient).not.toHaveBeenCalled();
	});

	it("keeps external sessions on the Agent path", () => {
		render(null);
		expect(observed.trading).toBe(state.agentClient);
		expect(observed.agentPublicKey).toBe(OTHER);
		expect(state.getTradingClient).toHaveBeenCalled();
	});

	it("builds the external user client from the connection's own chain, configured or not", () => {
		const previousClient = state.externalClient;
		state.connectionChainId = 999_999;
		state.externalClient = { account: { address: OWNER }, signTypedData: vi.fn() };
		try {
			render(null);
			expect(observed.user).not.toBeNull();
			expect(observed.userWalletMismatch).toBe(false);
		} finally {
			state.connectionChainId = 42161;
			state.externalClient = previousClient;
		}
	});

	it("executes a real SDK trading action through the owner session lease without a local Agent key", async () => {
		const signer = wallet();
		render({ ownerAddress: OWNER, wallet: signer, assertCurrent: vi.fn() });
		expect(localStorage.getItem(`hyperliquid_agent_Mainnet_${OWNER.toLowerCase()}`)).toBeNull();
		await act(async () => {
			await cancellation.mutateAsync({ cancels: [{ a: 0, o: 1 }] });
		});
		expect(signer.signTypedData).toHaveBeenCalledOnce();
		expect(state.httpRequest).toHaveBeenCalledOnce();
		expect(state.getTradingClient).not.toHaveBeenCalled();
	});

	it("shares one owner client across ordinary rerenders and replaces it for a new signing session", () => {
		const value = { ownerAddress: OWNER, wallet: wallet(), assertCurrent: vi.fn() };
		render(value);
		const client = observed.trading;
		render(value);
		expect(observed.trading).toBe(client);
		render({ ...value, assertCurrent: vi.fn() });
		expect(observed.trading).not.toBe(client);
	});

	it("invalidates old same-address bindings when the signing session or mode changes", () => {
		const value = { ownerAddress: OWNER, wallet: wallet(), assertCurrent: vi.fn() };
		render(value);
		const oldBinding = binding;
		render({ ...value, assertCurrent: vi.fn() });
		expect(() => oldBinding?.assertCurrent()).toThrow("signing identity changed");
		const nextBinding = binding;
		render(null);
		expect(() => nextBinding?.assertCurrent()).toThrow("signing identity changed");
	});

	it("uses the real SDK L1 signing path for orders, cancels and leverage and the user-signed path for builder approval", async () => {
		const signer = wallet();
		const http = transport();
		const assertCurrent = vi.fn();
		const client = createOwnerSignerClient({ ownerAddress: OWNER, wallet: signer, assertCurrent }, false, http);
		if (!client) throw new Error("Missing owner client");
		await client.order({
			orders: [{ a: 0, b: true, p: "1", s: "1", r: false, t: { limit: { tif: "Gtc" } } }],
			grouping: "na",
		});
		await client.cancel({ cancels: [{ a: 0, o: 1 }] });
		await client.updateLeverage({ asset: 0, isCross: true, leverage: 2 });
		await client.approveBuilderFee({ builder: OTHER, maxFeeRate: "0.01%" });
		expect(signer.signTypedData.mock.calls.map(([data]) => data.primaryType)).toEqual([
			"Agent",
			"Agent",
			"Agent",
			"HyperliquidTransaction:ApproveBuilderFee",
		]);
		expect(http.requestMock).toHaveBeenCalledTimes(4);
		expect(assertCurrent).toHaveBeenCalled();
	});

	it("rejects a wallet whose actual signing address differs before producing a signature", async () => {
		const signer = wallet();
		signer.getAddresses.mockResolvedValue([OTHER]);
		const http = transport();
		const client = createOwnerSignerClient(
			{ ownerAddress: OWNER, wallet: signer, assertCurrent: vi.fn() },
			false,
			http,
		);
		await expect(client?.cancel({ cancels: [{ a: 0, o: 1 }] })).rejects.toThrow();
		expect(signer.signTypedData).not.toHaveBeenCalled();
		expect(http.requestMock).not.toHaveBeenCalled();
	});

	it("rejects a session changed during signing before sending any exchange request", async () => {
		const signer = wallet();
		let current = true;
		signer.signTypedData.mockImplementation(async (data) => {
			const signature = await account.signTypedData(data);
			current = false;
			return signature;
		});
		const http = transport();
		const client = createOwnerSignerClient(
			{
				ownerAddress: OWNER,
				wallet: signer,
				assertCurrent() {
					if (!current) throw new Error("Owner session changed");
				},
			},
			false,
			http,
		);
		await expect(client?.cancel({ cancels: [{ a: 0, o: 1 }] })).rejects.toThrow();
		expect(signer.signTypedData).toHaveBeenCalledOnce();
		expect(http.requestMock).not.toHaveBeenCalled();
	});
});
