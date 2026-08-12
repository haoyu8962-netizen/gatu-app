// @vitest-environment jsdom

import { getFundsActionLockName } from "@gatu/hl-react/internal/exchange/funds-action-lock";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
	decodeFunctionData,
	encodeAbiParameters,
	encodeEventTopics,
	type Hash,
	type Hex,
	type TransactionReceipt,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CCTP_DEPOSIT_NETWORKS } from "@/config/cctp-deposit";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import { type UseDepositResult, useDeposit } from "@/lib/hyperliquid/use-deposit";
import { addressToBytes32, CCTP_EXTENSION_ABI, CCTP_EXTENSION_V2_ABI } from "@/lib/trade/cctp-deposit";
import {
	readCctpDepositTrackingRecords,
	readCctpSponsoredAuthorizationIntent,
	saveCctpDepositTrackingRecord,
} from "@/lib/trade/cctp-deposit-tracking";

const WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const PERMIT_SIGNATURE = `0x${"0".repeat(128)}1b` as const;
const SOURCE_HASH = `0x${"1".repeat(64)}` as Hash;

function createSponsoredCctpReceipt(
	authNonce: Hex,
	eventName: "SponsoredDepositForBurn" | "SponsoredDepositForBurnSkipped" = "SponsoredDepositForBurn",
	isTestnet = false,
): TransactionReceipt {
	const config = isTestnet ? CCTP_DEPOSIT_NETWORKS.testnet : CCTP_DEPOSIT_NETWORKS.mainnet;
	return {
		status: "success",
		logs: [
			{
				address: config.cctpExtensionV2,
				topics: encodeEventTopics({
					abi: CCTP_EXTENSION_V2_ABI,
					eventName,
					args: { authNonce, depositor: WALLET_ADDRESS },
				}),
				data:
					eventName === "SponsoredDepositForBurn"
						? encodeAbiParameters(
								[{ type: "bytes32" }, { type: "uint32" }, { type: "uint256" }],
								[addressToBytes32(config.cctpForwarder), config.destinationDomain, 5_000_000n],
							)
						: "0x",
			},
		],
	} as unknown as TransactionReceipt;
}

function createSuccessfulCctpReceipt(): TransactionReceipt {
	const config = CCTP_DEPOSIT_NETWORKS.mainnet;
	return {
		status: "success",
		logs: [
			{
				address: config.cctpExtension,
				topics: encodeEventTopics({ abi: CCTP_EXTENSION_ABI, eventName: "BatchDepositForBurn" }),
				data: encodeAbiParameters(
					[{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint32" }],
					[1n, 5_000_000n, WALLET_ADDRESS, addressToBytes32(config.cctpForwarder), config.destinationDomain],
				),
			},
		],
	} as unknown as TransactionReceipt;
}

function stubSuccessfulCctpCapacity() {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).includes("/fastBurn/USDC/allowance")) {
				return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
			}
			return new Response(
				JSON.stringify([
					{
						finalityThreshold: 1000,
						minimumFee: 0,
						forwardFee: { low: 200000, med: 200000, high: 200000 },
					},
				]),
				{ status: 200 },
			);
		}),
	);
}

const testState = vi.hoisted(() => {
	const providerRequest = vi.fn();
	return {
		createWalletClient: vi.fn(),
		fetchRouting: vi.fn(),
		getClientForChain: vi.fn(),
		getUserRole: vi.fn(),
		isTestnet: false,
		lockRequest: vi.fn(),
		permitSign: vi.fn(),
		providerRequest,
		publicClient: {
			estimateContractGas: vi.fn(),
			getBalance: vi.fn(),
			getGasPrice: vi.fn(),
			getTransaction: vi.fn(),
			getTransactionCount: vi.fn(),
			getTransactionReceipt: vi.fn(),
			readContract: vi.fn(),
		},
		routingError: null as Error | null,
		routingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
		sponsoredEnabled: true,
		smartSendTransaction: vi.fn(),
		wallet: {
			address: "0x1111111111111111111111111111111111111111",
			chainId: "eip155:42161",
			connectorType: "embedded",
			getEthereumProvider: async () => ({ request: providerRequest }),
			switchChain: vi.fn(),
		},
		walletWriteContract: vi.fn(),
	};
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@gatu/hl-react", () => ({
	getInfoClient: (isTestnet: boolean) => ({
		userRole: (params: unknown, signal?: AbortSignal) => testState.getUserRole(isTestnet, params, signal),
	}),
	infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
		queryKey: ["hyperliquid", env, "info", method, params],
	}),
	useHyperliquid: () => ({
		env: testState.isTestnet ? "Testnet" : "Mainnet",
		info: { usdcRouting: testState.fetchRouting },
	}),
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
	useIsTestnet: () => testState.isTestnet,
}));

vi.mock("@/config/cctp-deposit", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/config/cctp-deposit")>();
	return {
		...original,
		isCctpExternalDepositEnabled: () => true,
		isCctpSponsoredDepositEnabled: () => testState.sponsoredEnabled,
	};
});

vi.mock("wagmi", () => ({
	useChainId: () => (testState.isTestnet ? 421614 : 42161),
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
		window.localStorage.clear();
		testState.isTestnet = false;
		testState.lockRequest.mockImplementation(
			async (name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
				callback({ name, mode: "exclusive" } as Lock),
		);
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: { request: testState.lockRequest },
		});
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
		testState.sponsoredEnabled = true;
		testState.wallet.connectorType = "embedded";
		testState.wallet.chainId = "eip155:42161";
		testState.fetchRouting.mockImplementation(async () => {
			if (testState.routingError) throw testState.routingError;
			return testState.routingResponse;
		});
		testState.providerRequest.mockImplementation(async ({ method }: { method: string }) => {
			if (method === "eth_chainId") return testState.isTestnet ? "0x66eee" : "0xa4b1";
			if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
			throw new Error(`Unexpected provider method: ${method}`);
		});
		testState.publicClient.estimateContractGas.mockResolvedValue(21_000n);
		testState.publicClient.getBalance.mockResolvedValue(1_000_000_000_000_000n);
		testState.publicClient.getGasPrice.mockResolvedValue(1n);
		testState.publicClient.getTransactionCount.mockResolvedValue(0);
		testState.publicClient.readContract.mockResolvedValue(0n);
		testState.getUserRole.mockResolvedValue({ role: "user" });
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
		vi.useRealTimers();
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
		vi.unstubAllGlobals();
	});

	function Probe({ mode, route = "bridge" }: { mode: "smart" | "wallet"; route?: "bridge" | "cctp" }) {
		capturedDeposit = useDeposit({
			balanceEnabled: false,
			executionScope: "manual",
			mode,
			depositRoute: route,
			expectedCctpMaxFeeRaw: route === "cctp" ? 200_000n : undefined,
			walletAddress: WALLET_ADDRESS,
		});
		return null;
	}

	function renderMode(mode: "smart" | "wallet", route: "bridge" | "cctp" = "bridge") {
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe, { mode, route })));
		});
		if (!capturedDeposit) throw new Error("Deposit hook was not captured");
		return capturedDeposit;
	}

	async function submit(mode: "smart" | "wallet", route: "bridge" | "cctp" = "bridge") {
		const depositHook = renderMode(mode, route);
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

	it("stops the retired Bridge2 smart-wallet path before signing or submission", async () => {
		await submit("smart");

		expect(testState.fetchRouting).toHaveBeenCalledTimes(1);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Legacy Bridge2 deposits are no longer accepted");
	});

	it("stops the retired Bridge2 browser-wallet path before signing or submission", async () => {
		await submit("wallet");

		expect(testState.fetchRouting).toHaveBeenCalledTimes(1);
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Legacy Bridge2 deposits are no longer accepted");
	});

	it("uses the verified Circle CCTP path for an external wallet and never enters Bridge2", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);

		await submit("wallet", "cctp");

		expect(testState.permitSign).toHaveBeenCalledTimes(1);
		expect(testState.walletWriteContract).toHaveBeenCalledWith(
			expect.objectContaining({
				address: "0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE",
				functionName: "batchDepositForBurnWithAuth",
			}),
		);
		expect(testState.lockRequest).toHaveBeenCalledWith(
			getFundsActionLockName("Mainnet", WALLET_ADDRESS),
			expect.objectContaining({ mode: "exclusive", signal: expect.any(AbortSignal) }),
			expect.any(Function),
		);
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});

	it("fails closed before CCTP signing or broadcast when cross-tab Web Locks are unavailable", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});

		await submit("wallet", "cctp");

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.name).toBe("FundsActionLockUnavailableError");
	});

	it("fails closed without signing or broadcasting when CCTP lock acquisition times out", async () => {
		vi.useFakeTimers();
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.lockRequest.mockImplementation(
			(_name: string, options: LockOptions) =>
				new Promise((_resolve, reject) => {
					options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
				}),
		);
		const depositHook = renderMode("wallet", "cctp");
		await act(async () => {
			const request = depositHook.deposit("5");
			for (let attempt = 0; attempt < 20 && testState.lockRequest.mock.calls.length === 0; attempt += 1) {
				await Promise.resolve();
			}
			expect(testState.lockRequest).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(10_001);
			await request;
		});

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.name).toBe("FundsActionLockTimeoutError");
	});

	it("blocks a queued tab from signing or broadcasting while an earlier CCTP deposit is pending", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		saveCctpDepositTrackingRecord({
			env: "Mainnet",
			owner: WALLET_ADDRESS,
			sourceHash: SOURCE_HASH,
			amount: "5",
		});

		await submit("wallet", "cctp");

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Another Circle CCTP deposit is still pending");
	});

	it("fails closed before CCTP signing when recovery storage cannot pass a write/readback probe", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		const persistSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("storage disabled", "SecurityError");
		});

		await submit("wallet", "cctp");

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.name).toBe("CctpDepositTrackingPersistenceError");
		persistSpy.mockRestore();
	});

	it.each([
		{
			code: "source-transaction-reverted" as const,
			name: "the source transaction reverted",
			receipt: { logs: [], status: "reverted" } as unknown as TransactionReceipt,
		},
		{
			code: "source-receipt-mismatch" as const,
			name: "the confirmed source receipt does not contain the requested CCTP burn",
			receipt: { logs: [], status: "success" } as unknown as TransactionReceipt,
		},
	])("removes recovery state when $name so reopening does not restore it", async ({ code, receipt }) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);
		testState.walletWriteContract.mockResolvedValue(SOURCE_HASH);
		testState.publicClient.getTransactionReceipt.mockResolvedValue(receipt);

		await submit("wallet", "cctp");

		expect(capturedDeposit?.error).toBeInstanceOf(DefinitiveDepositSourceFailureError);
		expect(capturedDeposit?.error).toMatchObject({ code });

		let recoveredSourceHash: Hash | null = SOURCE_HASH;
		function ReopenTrackingProbe() {
			recoveredSourceHash =
				useCctpDepositTracking({
					enabled: true,
					env: "Mainnet",
					owner: WALLET_ADDRESS,
				}).recoveryRecord?.sourceHash ?? null;
			return null;
		}
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ReopenTrackingProbe)));
		});
		expect(recoveredSourceHash).toBeNull();
	});

	it.each(["05", "5.", "005.00"])("normalizes %s before persisting CCTP recovery state", async (amount) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);
		testState.walletWriteContract.mockResolvedValue(SOURCE_HASH);
		testState.publicClient.getTransactionReceipt.mockResolvedValue(createSuccessfulCctpReceipt());

		const depositHook = renderMode("wallet", "cctp");
		await act(async () => {
			await depositHook.deposit(amount);
		});

		let recoveredAmount: string | null = null;
		function ReopenTrackingProbe() {
			recoveredAmount =
				useCctpDepositTracking({ enabled: true, env: "Mainnet", owner: WALLET_ADDRESS }).recoveryRecord?.amount ?? null;
			return null;
		}
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ReopenTrackingProbe)));
		});
		expect(recoveredAmount).toBe("5");
	});

	it("keeps a confirmed deposit successful while exposing unavailable browser recovery", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);
		testState.walletWriteContract.mockResolvedValue(SOURCE_HASH);
		testState.publicClient.getTransactionReceipt.mockResolvedValue(createSuccessfulCctpReceipt());
		let successfulProbeWrites = 0;
		const originalSetItem = Storage.prototype.setItem;
		const persistSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key.startsWith("gatu:cctp-deposit-tracking-probe:v1:")) {
				successfulProbeWrites += 1;
				return originalSetItem.call(this, key, value);
			}
			throw new DOMException("quota exceeded", "QuotaExceededError");
		});

		await submit("wallet", "cctp");

		expect(capturedDeposit).toMatchObject({ status: "success", cctpRecoveryUnavailable: true });
		expect(successfulProbeWrites).toBe(1);
		persistSpy.mockRestore();
	});

	it("does not request a CCTP signature when Fast Transfer allowance is insufficient", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);

		await submit("wallet", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
	});

	it("rejects an Agent/API wallet as a CCTP recipient before signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.getUserRole.mockResolvedValue({ role: "agent", data: { user: WALLET_ADDRESS } });

		await submit("wallet", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Agent/API wallet addresses cannot receive CCTP deposits");
	});

	it("rejects a Testnet Agent/API wallet even when the address is a Mainnet user", async () => {
		testState.isTestnet = true;
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.getUserRole.mockImplementation(async (isTestnet: boolean) =>
			isTestnet ? { role: "agent", data: { user: WALLET_ADDRESS } } : { role: "user" },
		);

		await submit("wallet", "cctp");

		expect(testState.getUserRole).toHaveBeenCalledWith(false, { user: WALLET_ADDRESS }, undefined);
		expect(testState.getUserRole).toHaveBeenCalledWith(true, { user: WALLET_ADDRESS }, undefined);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Agent/API wallet addresses cannot receive CCTP deposits");
	});

	it.each([{ role: "missing" }, { role: "user" }])(
		"allows a Testnet $role recipient when the address is a Mainnet user",
		async (testnetRole) => {
			testState.isTestnet = true;
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			testState.getUserRole.mockImplementation(async (isTestnet: boolean) =>
				isTestnet ? testnetRole : { role: "user" },
			);
			stubSuccessfulCctpCapacity();

			await submit("wallet", "cctp");

			expect(testState.getUserRole).toHaveBeenCalledWith(false, { user: WALLET_ADDRESS }, undefined);
			expect(testState.getUserRole).toHaveBeenCalledWith(true, { user: WALLET_ADDRESS }, undefined);
			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		},
	);

	it.each([
		{ mainnetRole: { role: "unexpected" }, name: "Mainnet", testnetRole: { role: "user" } },
		{ mainnetRole: { role: "user" }, name: "Testnet", testnetRole: { role: "unexpected" } },
	])("fails closed when the $name userRole response is malformed", async ({ mainnetRole, testnetRole }) => {
		testState.isTestnet = true;
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.getUserRole.mockImplementation(async (isTestnet: boolean) => (isTestnet ? testnetRole : mainnetRole));

		await submit("wallet", "cctp");

		expect(testState.getUserRole).toHaveBeenCalledTimes(2);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Hyperliquid returned an invalid user role");
	});

	it("submits embedded CCTP through the sponsored V2 contract and validates its exact event", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async ({ data }: { data: Hex }) => {
			const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_V2_ABI, data });
			if (decoded.functionName !== "batchSponsorDepositForBurn") throw new Error("Unexpected sponsored function");
			const authNonce = decoded.args[0][0].authNonce;
			testState.publicClient.getTransactionReceipt.mockResolvedValue(createSponsoredCctpReceipt(authNonce));
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledWith(
			expect.objectContaining({
				account: WALLET_ADDRESS,
				message: expect.objectContaining({
					from: WALLET_ADDRESS,
					to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2,
				}),
			}),
		);
		expect(testState.smartSendTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2 }),
			{ uiOptions: { showWalletUIs: false } },
		);
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit).toMatchObject({ status: "success", hash: SOURCE_HASH });
		const trackingRecord = readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)[0];
		expect(trackingRecord).toMatchObject({
			mode: "sponsored",
			owner: WALLET_ADDRESS,
			sourceHash: SOURCE_HASH,
		});
		expect(trackingRecord.mode === "sponsored" ? trackingRecord.authNonce : null).toBe(
			decodeFunctionData({
				abi: CCTP_EXTENSION_V2_ABI,
				data: testState.smartSendTransaction.mock.calls[0][0].data,
			}).args[0][0].authNonce.toLowerCase(),
		);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
	});

	it("uses the Sepolia V2 contract and Smart Wallet client for sponsored testnet deposits", async () => {
		testState.isTestnet = true;
		testState.wallet.chainId = "eip155:421614";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async ({ data }: { data: Hex }) => {
			const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_V2_ABI, data });
			if (decoded.functionName !== "batchSponsorDepositForBurn") throw new Error("Unexpected sponsored function");
			testState.publicClient.getTransactionReceipt.mockResolvedValue(
				createSponsoredCctpReceipt(decoded.args[0][0].authNonce, "SponsoredDepositForBurn", true),
			);
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 421614 });
		expect(testState.smartSendTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ to: CCTP_DEPOSIT_NETWORKS.testnet.cctpExtensionV2 }),
			{ uiOptions: { showWalletUIs: false } },
		);
		expect(capturedDeposit).toMatchObject({ status: "success", hash: SOURCE_HASH });
	});

	it("fails closed when sponsored CCTP is disabled", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.sponsoredEnabled = false;

		await submit("smart", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("not enabled");
	});

	it("rejects a same-address external connector for a sponsored embedded deposit", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.wallet.connectorType = "injected";

		await submit("smart", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Wallet client not ready");
	});

	it("surfaces a Paymaster rejection without falling back to Bridge2", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(() => {
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();
			return Promise.reject(new Error("Paymaster policy rejected sponsored call"));
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Paymaster policy rejected");
		expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);
		expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toHaveLength(0);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toMatchObject({
			amount: "5",
			status: "submission-unresolved",
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		expect(capturedDeposit?.error?.message).toContain("still pending");
	});

	it("fails closed before signing when unresolved sponsored authorization storage is invalid", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		const key = `gatu:cctp-sponsored-authorization-intent:v1:mainnet:${WALLET_ADDRESS}`;
		window.localStorage.setItem(key, "not-json");

		await submit("smart", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("cannot be trusted");
		expect(window.localStorage.getItem(key)).toBe("not-json");
	});

	it("does not submit a sponsored authorization when the route changes after signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.permitSign.mockImplementation(async () => {
			testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
			return PERMIT_SIGNATURE;
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});

	it("does not submit a sponsored authorization when the Circle fee changes after signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		let feeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				feeRequestCount += 1;
				const forwardFee = feeRequestCount === 1 ? 200_000 : 300_000;
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: forwardFee, med: forwardFee, high: forwardFee },
						},
					]),
					{ status: 200 },
				);
			}),
		);

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("fees changed");
	});

	it("treats the V2 skipped event as a definitive source failure", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async ({ data }: { data: Hex }) => {
			const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_V2_ABI, data });
			if (decoded.functionName !== "batchSponsorDepositForBurn") throw new Error("Unexpected sponsored function");
			const authNonce = decoded.args[0][0].authNonce;
			testState.publicClient.getTransactionReceipt.mockResolvedValue(
				createSponsoredCctpReceipt(authNonce, "SponsoredDepositForBurnSkipped"),
			);
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(capturedDeposit?.error).toBeInstanceOf(DefinitiveDepositSourceFailureError);
		expect(capturedDeposit?.error?.message).toContain("skipped");
		expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toHaveLength(0);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toMatchObject({
			amount: "5",
			status: "submission-unresolved",
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		expect(capturedDeposit?.error?.message).toContain("still pending");
	});

	it("keeps a sponsored authorization tombstone when the AA source transaction reverts", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async () => {
			testState.publicClient.getTransactionReceipt.mockResolvedValue({
				logs: [],
				status: "reverted",
			} as unknown as TransactionReceipt);
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(capturedDeposit?.error).toBeInstanceOf(DefinitiveDepositSourceFailureError);
		expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toHaveLength(0);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toMatchObject({
			amount: "5",
			status: "submission-unresolved",
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
	});
});
