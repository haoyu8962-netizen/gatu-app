// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UseDepositResult, useDeposit } from "@/lib/hyperliquid/use-deposit";

const WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const PERMIT_SIGNATURE = `0x${"0".repeat(128)}1b` as const;

const testState = vi.hoisted(() => {
	const providerRequest = vi.fn();
	return {
		createWalletClient: vi.fn(),
		fetchRouting: vi.fn(),
		getClientForChain: vi.fn(),
		permitSign: vi.fn(),
		providerRequest,
		publicClient: {
			estimateContractGas: vi.fn(),
			getBalance: vi.fn(),
			getGasPrice: vi.fn(),
			getTransactionCount: vi.fn(),
			readContract: vi.fn(),
		},
		routingError: null as Error | null,
		routingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
		smartSendTransaction: vi.fn(),
		wallet: {
			address: "0x1111111111111111111111111111111111111111",
			chainId: "eip155:42161",
			getEthereumProvider: async () => ({ request: providerRequest }),
			switchChain: vi.fn(),
		},
		walletWriteContract: vi.fn(),
	};
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@gatu/hl-react", () => ({
	infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
		queryKey: ["hyperliquid", env, "info", method, params],
	}),
	useHyperliquid: () => ({ env: "Mainnet", info: { usdcRouting: testState.fetchRouting } }),
	useInfo: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
	useWallets: () => ({ wallets: [testState.wallet] }),
}));

vi.mock("@privy-io/react-auth/smart-wallets", () => ({
	useSmartWallets: () => ({ getClientForChain: testState.getClientForChain }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ walletAddress: WALLET_ADDRESS }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => false,
}));

vi.mock("wagmi", () => ({
	useChainId: () => 42161,
	usePublicClient: () => testState.publicClient,
}));

vi.mock("viem", async (importOriginal) => {
	const original = await importOriginal<typeof import("viem")>();
	return {
		...original,
		createWalletClient: testState.createWalletClient,
		custom: vi.fn(() => ({})),
	};
});

describe("useDeposit fresh USDC route guard", () => {
	let capturedDeposit: UseDepositResult | null;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		capturedDeposit = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		});
		root = createRoot(container);
		testState.routingError = null;
		testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		testState.fetchRouting.mockImplementation(async () => {
			if (testState.routingError) throw testState.routingError;
			return testState.routingResponse;
		});
		testState.providerRequest.mockImplementation(async ({ method }: { method: string }) => {
			if (method === "eth_chainId") return "0xa4b1";
			if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
			throw new Error(`Unexpected provider method: ${method}`);
		});
		testState.publicClient.estimateContractGas.mockResolvedValue(21_000n);
		testState.publicClient.getBalance.mockResolvedValue(1_000_000_000_000_000n);
		testState.publicClient.getGasPrice.mockResolvedValue(1n);
		testState.publicClient.getTransactionCount.mockResolvedValue(0);
		testState.publicClient.readContract.mockResolvedValue(0n);
		testState.permitSign.mockResolvedValue(PERMIT_SIGNATURE);
		testState.smartSendTransaction.mockRejectedValue(new Error("smart transaction boundary reached"));
		testState.walletWriteContract.mockRejectedValue(new Error("wallet transaction boundary reached"));
		testState.createWalletClient.mockReturnValue({
			signTypedData: testState.permitSign,
			writeContract: testState.walletWriteContract,
		});
		testState.getClientForChain.mockResolvedValue({ sendTransaction: testState.smartSendTransaction });
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
	});

	function Probe({ mode }: { mode: "smart" | "wallet" }) {
		capturedDeposit = useDeposit({
			balanceEnabled: false,
			executionScope: "manual",
			mode,
			walletAddress: WALLET_ADDRESS,
		});
		return null;
	}

	function renderMode(mode: "smart" | "wallet") {
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe, { mode })));
		});
		if (!capturedDeposit) throw new Error("Deposit hook was not captured");
		return capturedDeposit;
	}

	async function submit(mode: "smart" | "wallet") {
		const depositHook = renderMode(mode);
		await act(async () => {
			await depositHook.deposit("5");
		});
	}

	it.each([
		{
			name: "CCTP is required",
			response: { depositRoute: "cctp", withdrawalRoute: "cctp" },
			error: null,
		},
		{
			name: "the fresh route request fails",
			response: null,
			error: new Error("routing unavailable"),
		},
		{
			name: "the fresh route response is malformed",
			response: { depositRoute: "bridge", withdrawalRoute: "unexpected" },
			error: null,
		},
	])("never signs or broadcasts when $name", async ({ error, response }) => {
		testState.routingError = error;
		testState.routingResponse = response;

		await submit("smart");
		await submit("wallet");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
	});

	it("allows the verified Bridge2 smart-wallet path to reach permit signing and submission", async () => {
		await submit("smart");

		expect(testState.fetchRouting).toHaveBeenCalledTimes(3);
		expect(testState.permitSign).toHaveBeenCalledTimes(1);
		expect(testState.smartSendTransaction).toHaveBeenCalledTimes(1);
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
	});

	it("allows the verified Bridge2 browser-wallet path to reach contract submission", async () => {
		await submit("wallet");

		expect(testState.fetchRouting).toHaveBeenCalledTimes(2);
		expect(testState.walletWriteContract).toHaveBeenCalledTimes(1);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});
});
