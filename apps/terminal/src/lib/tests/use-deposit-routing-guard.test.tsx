// @vitest-environment jsdom

import { getFundsActionLockName } from "@sairn/hl-react/internal/exchange/funds-action-lock";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, StrictMode } from "react";
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
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { getDepositExecutionState } from "@/lib/hyperliquid/deposit-execution-state";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import { type DepositReview, type UseDepositResult, useDeposit } from "@/lib/hyperliquid/use-deposit";
import { addressToBytes32, CCTP_EXTENSION_ABI, CCTP_EXTENSION_V2_ABI } from "@/lib/trade/cctp-deposit";
import {
	readCctpDepositTrackingRecords,
	readCctpSponsoredAuthorizationIntent,
	saveCctpDepositTrackingRecord,
} from "@/lib/trade/cctp-deposit-tracking";

const WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const SECOND_WALLET_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
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

function stubSuccessfulCctpCapacity(balanceRaw = 5_000_000n, balanceBeforeSubmissionRaw = balanceRaw) {
	let balanceRequestCount = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
			if (body?.method === "eth_call") {
				const currentBalanceRaw = balanceRequestCount === 0 ? balanceRaw : balanceBeforeSubmissionRaw;
				balanceRequestCount += 1;
				return new Response(JSON.stringify({ result: `0x${currentBalanceRaw.toString(16)}` }), { status: 200 });
			}
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
		geoRefetch: vi.fn(),
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
		selectedOwner: "0x1111111111111111111111111111111111111111",
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
		verifyLegalAction: vi.fn(),
	};
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@sairn/hl-react", () => ({
	getInfoClient: (isTestnet: boolean) => ({
		userRole: (params: unknown, signal?: AbortSignal) => testState.getUserRole(isTestnet, params, signal),
	}),
	infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
		queryKey: ["hyperliquid", env, "info", method, params],
	}),
	useHyperliquid: () => ({
		clientKey: testState.selectedOwner,
		env: testState.isTestnet ? "Testnet" : "Mainnet",
		info: { legalCheck: vi.fn(), usdcRouting: testState.fetchRouting },
		sessionMode: "wallet",
	}),
	useInfo: vi.fn(),
	verifyLegalActionAllowed: (options: unknown) => testState.verifyLegalAction(options),
}));

vi.mock("@privy-io/react-auth", () => ({
	useWallets: () => ({ ready: true, wallets: [testState.wallet] }),
}));

vi.mock("@privy-io/react-auth/smart-wallets", () => ({
	useSmartWallets: () => ({ getClientForChain: testState.getClientForChain }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ walletAddress: WALLET_ADDRESS }),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ retry: testState.geoRefetch }),
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
		testState.selectedOwner = WALLET_ADDRESS;
		testState.sponsoredEnabled = true;
		testState.wallet.address = WALLET_ADDRESS;
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
		testState.geoRefetch.mockResolvedValue({
			data: { country: "GB", proxy: false, tradeRestricted: false },
			isError: false,
		});
		testState.permitSign.mockResolvedValue(PERMIT_SIGNATURE);
		testState.smartSendTransaction.mockRejectedValue(new Error("smart transaction boundary reached"));
		testState.walletWriteContract.mockRejectedValue(new Error("wallet transaction boundary reached"));
		testState.verifyLegalAction.mockResolvedValue({ canPerformActions: true });
		testState.createWalletClient.mockReturnValue({
			signTypedData: testState.permitSign,
			writeContract: testState.walletWriteContract,
		});
		testState.getClientForChain.mockImplementation(async ({ id }: { id: number }) => ({
			chain: { id },
			paymaster: {},
			sendTransaction: testState.smartSendTransaction,
		}));
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

	function Probe({
		balanceEnabled = false,
		balancePollIntervalMs,
		executionScope = "manual",
		mode,
		route = "bridge",
		sponsoredReadinessEnabled = false,
		walletAddress = WALLET_ADDRESS,
	}: {
		balanceEnabled?: boolean;
		balancePollIntervalMs?: number;
		executionScope?: "automatic" | "manual";
		mode: "smart" | "wallet";
		route?: "bridge" | "cctp";
		sponsoredReadinessEnabled?: boolean;
		walletAddress?: `0x${string}`;
	}) {
		capturedDeposit = useDeposit({
			balanceEnabled,
			balancePollIntervalMs,
			executionScope,
			mode,
			depositRoute: route,
			expectedCctpMaxFeeRaw: route === "cctp" ? 200_000n : undefined,
			sponsoredReadinessEnabled,
			walletAddress,
		});
		return null;
	}

	function renderMode(
		mode: "smart" | "wallet",
		route: "bridge" | "cctp" = "bridge",
		executionScope: "automatic" | "manual" = "manual",
	) {
		act(() => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, { executionScope, mode, route }),
				),
			);
		});
		if (!capturedDeposit) throw new Error("Deposit hook was not captured");
		return capturedDeposit;
	}

	async function renderSponsoredReadiness() {
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, { mode: "smart", route: "cctp", sponsoredReadinessEnabled: true }),
				),
			);
		});
		for (let attempt = 0; attempt < 5 && capturedDeposit?.sponsoredCctpReadiness.status === "loading"; attempt += 1) {
			await act(async () => {
				await Promise.resolve();
			});
		}
		if (!capturedDeposit) throw new Error("Deposit hook was not captured");
		return capturedDeposit;
	}

	async function submit(
		mode: "smart" | "wallet",
		route: "bridge" | "cctp" = "bridge",
		review?: DepositReview | null,
		executionScope: "automatic" | "manual" = "manual",
	) {
		const depositHook = renderMode(mode, route, executionScope);
		const submittedReview =
			review === undefined && mode === "smart" && route === "cctp" && !testState.isTestnet
				? { expectedBalanceRaw: 5_000_000n, expectedCctpMaxFeeRaw: 200_000n }
				: (review ?? undefined);
		await act(async () => {
			await depositHook.deposit("5", submittedReview);
		});
	}

	it("preflights the target-chain Smart Wallet without signing or submitting", async () => {
		const depositHook = await renderSponsoredReadiness();

		expect(testState.getClientForChain).toHaveBeenCalledOnce();
		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 42161 });
		expect(depositHook.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
	});

	it.each([
		{
			failure: "build-gate-disabled" as const,
			prepare: () => {
				testState.sponsoredEnabled = false;
			},
			expectedClientCalls: 0,
		},
		{
			failure: "smart-client-unavailable" as const,
			prepare: () => {
				testState.getClientForChain.mockResolvedValue(undefined);
			},
			expectedClientCalls: 1,
		},
		{
			failure: "wrong-chain" as const,
			prepare: () => {
				testState.getClientForChain.mockResolvedValue({ chain: { id: 421614 }, paymaster: {} });
			},
			expectedClientCalls: 1,
		},
		{
			failure: "paymaster-unavailable" as const,
			prepare: () => {
				testState.getClientForChain.mockResolvedValue({ chain: { id: 42161 }, paymaster: undefined });
			},
			expectedClientCalls: 1,
		},
	])(
		"reports $failure before exposing sponsored funding readiness",
		async ({ expectedClientCalls, failure, prepare }) => {
			prepare();

			const depositHook = await renderSponsoredReadiness();

			expect(testState.getClientForChain).toHaveBeenCalledTimes(expectedClientCalls);
			expect(depositHook.sponsoredCctpReadiness).toMatchObject({ status: "error", failure });
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		},
	);

	it("ignores an older Smart Wallet readiness result after retry", async () => {
		let resolveFirst: ((client: { chain: { id: number }; paymaster: object }) => void) | undefined;
		testState.getClientForChain
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValue({ chain: { id: 42161 }, paymaster: {} });

		const firstRender = await renderSponsoredReadiness();
		expect(firstRender.sponsoredCctpReadiness.status).toBe("loading");

		await act(async () => {
			firstRender.sponsoredCctpReadiness.retry();
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });

		await act(async () => {
			resolveFirst?.({ chain: { id: 421614 }, paymaster: {} });
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.getClientForChain).toHaveBeenCalledTimes(2);
	});

	it("keeps the current readiness when StrictMode's discarded request resolves late", async () => {
		let resolveDiscarded: ((client: { chain: { id: number }; paymaster: object }) => void) | undefined;
		testState.getClientForChain
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveDiscarded = resolve;
					}),
			)
			.mockResolvedValue({ chain: { id: 42161 }, paymaster: {} });

		await act(async () => {
			root.render(
				createElement(
					StrictMode,
					null,
					createElement(
						QueryClientProvider,
						{ client: queryClient },
						createElement(Probe, { mode: "smart", route: "cctp", sponsoredReadinessEnabled: true }),
					),
				),
			);
			await Promise.resolve();
		});

		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.getClientForChain).toHaveBeenCalledTimes(2);

		await act(async () => {
			resolveDiscarded?.({ chain: { id: 421614 }, paymaster: {} });
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
	});

	it("withholds readiness immediately when the embedded wallet identity changes", async () => {
		let resolvePreviousIdentity: ((client: { chain: { id: number }; paymaster: object }) => void) | undefined;
		testState.getClientForChain
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolvePreviousIdentity = resolve;
					}),
			)
			.mockResolvedValue({ chain: { id: 42161 }, paymaster: {} });

		const firstRender = await renderSponsoredReadiness();
		expect(firstRender.sponsoredCctpReadiness.status).toBe("loading");

		testState.wallet.address = SECOND_WALLET_ADDRESS;
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, {
						mode: "smart",
						route: "cctp",
						sponsoredReadinessEnabled: true,
						walletAddress: SECOND_WALLET_ADDRESS,
					}),
				),
			);
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });

		await act(async () => {
			resolvePreviousIdentity?.({ chain: { id: 421614 }, paymaster: {} });
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.getClientForChain).toHaveBeenCalledTimes(2);
	});

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

	it.each(["smart", "wallet"] as const)(
		"fails closed before %s CCTP signing when regional availability cannot be verified",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			testState.geoRefetch.mockResolvedValue({ data: undefined, isError: true });

			await submit(mode, "cctp");

			expect(testState.geoRefetch).toHaveBeenCalledOnce();
			expect(testState.getUserRole).not.toHaveBeenCalled();
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Unable to verify regional availability");
		},
	);

	it.each(["smart", "wallet"] as const)("fails closed before %s CCTP signing in a restricted region", async (mode) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.geoRefetch.mockResolvedValue({
			data: { country: "US", proxy: false, tradeRestricted: true },
			isError: false,
		});

		await submit(mode, "cctp");

		expect(testState.geoRefetch).toHaveBeenCalledOnce();
		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Deposits are not available in your region");
	});

	it.each(["smart", "wallet"] as const)(
		"reports an unavailable Circle fee quote before %s CCTP signing with a translatable reason",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("unavailable", { status: 503 })),
			);

			await submit(mode, "cctp");

			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).toBeInstanceOf(LocalizedActionError);
			expect(capturedDeposit?.error?.message).toBe(
				"Unable to verify the current Circle CCTP fee and Fast Transfer capacity.",
			);
		},
	);

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

	it.each(["smart", "wallet"] as const)(
		"forces a fresh selected-owner legal check before the %s CCTP funds write",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.verifyLegalAction.mockRejectedValue(
				new Error("Hyperliquid access could not be verified before this action"),
			);

			await submit(mode, "cctp");

			expect(testState.verifyLegalAction).toHaveBeenCalledWith(
				expect.objectContaining({
					env: "Mainnet",
					forceFresh: true,
					owner: WALLET_ADDRESS,
				}),
			);
			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toBe("Hyperliquid access could not be verified before this action");
		},
	);

	it.each(["smart", "wallet"] as const)(
		"rechecks the exact %s CCTP source account after the legal request",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let legalRequestCompleted = false;
			testState.verifyLegalAction.mockImplementation(async () => {
				legalRequestCompleted = true;
				return { canPerformActions: true };
			});
			testState.providerRequest.mockImplementation(async ({ method }: { method: string }) => {
				if (method === "eth_chainId") return "0xa4b1";
				if (method === "eth_accounts" || method === "eth_requestAccounts") {
					return [legalRequestCompleted ? SECOND_WALLET_ADDRESS : WALLET_ADDRESS];
				}
				throw new Error(`Unexpected provider method: ${method}`);
			});

			await submit(mode, "cctp");

			expect(testState.verifyLegalAction).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Selected wallet does not match");
		},
	);

	describe("wallet network", () => {
		const EXECUTION_KEY = `mainnet:manual:wallet:${WALLET_ADDRESS.toLowerCase()}`;

		function networkSwitchPending() {
			return getDepositExecutionState(EXECUTION_KEY).networkSwitchPending;
		}

		function providerOn(
			chainIds: () => unknown,
			options: { onSwitch?: (params: unknown) => Promise<unknown> | unknown } = {},
		) {
			const listeners = new Set<(chainId: unknown) => void>();
			const requests: Array<{ method: string; params?: unknown }> = [];
			testState.providerRequest.mockImplementation(async ({ method, params }: { method: string; params?: unknown }) => {
				if (method === "eth_chainId") return chainIds();
				if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
				if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
					requests.push({ method, params });
					return method === "wallet_switchEthereumChain" ? await options.onSwitch?.(params) : null;
				}
				throw new Error(`Unexpected provider method: ${method}`);
			});
			const provider = {
				request: testState.providerRequest,
				on: (_event: string, listener: (chainId: unknown) => void) => listeners.add(listener),
				removeListener: (_event: string, listener: (chainId: unknown) => void) => listeners.delete(listener),
			};
			testState.wallet.getEthereumProvider = async () => provider;
			return {
				listeners,
				requests,
				switchRequests: () => requests.filter((request) => request.method === "wallet_switchEthereumChain"),
				emitChainChanged: (chainId: unknown) => {
					for (const listener of listeners) listener(chainId);
				},
			};
		}

		async function flushUntil(condition: () => boolean) {
			for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await Promise.resolve();
			expect(condition()).toBe(true);
		}

		afterEach(() => {
			testState.wallet.getEthereumProvider = async () => ({ request: testState.providerRequest });
			testState.wallet.switchChain = vi.fn();
		});

		it("accepts a WalletConnect provider that reports the Arbitrum chain id as a number", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			const { listeners, requests } = providerOn(() => 42161);

			await submit("wallet", "cctp");

			expect(requests).toHaveLength(0);
			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("asks the wallet itself to switch when Privy already believes it is on Arbitrum", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 56;
			let pendingDuringSwitch: boolean | undefined;
			const { listeners, requests, emitChainChanged } = providerOn(() => chainId, {
				onSwitch: () => {
					pendingDuringSwitch = networkSwitchPending();
					setTimeout(() => {
						chainId = "0xa4b1";
						emitChainChanged("0xa4b1");
					}, 0);
					return null;
				},
			});

			await submit("wallet", "cctp");

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(requests).toEqual([{ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa4b1" }] }]);
			expect(pendingDuringSwitch).toBe(true);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("adds Arbitrum and switches again when the wallet does not know the chain", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 56;
			let switchAttempts = 0;
			const { requests } = providerOn(() => chainId, {
				onSwitch: () => {
					switchAttempts += 1;
					if (switchAttempts === 1) throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
					chainId = 42161;
					return null;
				},
			});

			await submit("wallet", "cctp");

			expect(requests.map((request) => request.method)).toEqual([
				"wallet_switchEthereumChain",
				"wallet_addEthereumChain",
				"wallet_switchEthereumChain",
			]);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});

		it("continues on the chainChanged event before the next poll is due", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 56;
			const { listeners, switchRequests, emitChainChanged } = providerOn(() => chainId);
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await flushUntil(() => switchRequests().length === 1 && listeners.size === 1);
				chainId = 42161;
				emitChainChanged("0xa4b1");
				await request;
			});

			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
		});

		it("switches through Privy exactly once and waits for the wallet to report Arbitrum", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			let chainId: unknown = "0x38";
			let pendingDuringSwitch: boolean | undefined;
			let pendingDuringSigning: boolean | undefined;
			const { listeners, switchRequests } = providerOn(() => chainId);
			testState.wallet.switchChain = vi.fn(async () => {
				pendingDuringSwitch = networkSwitchPending();
				setTimeout(() => {
					chainId = 42161;
				}, 9_000);
			});
			testState.permitSign.mockImplementation(async () => {
				pendingDuringSigning = networkSwitchPending();
				return PERMIT_SIGNATURE;
			});
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(9_500);
				await request;
			});

			expect(testState.wallet.switchChain).toHaveBeenCalledTimes(1);
			expect(testState.wallet.switchChain).toHaveBeenCalledWith(42161);
			expect(switchRequests()).toHaveLength(0);
			expect(pendingDuringSwitch).toBe(true);
			expect(pendingDuringSigning).toBe(false);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("reports a wallet that never moves to Arbitrum without a second switch request", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			const { listeners, switchRequests } = providerOn(() => "0x38");
			testState.wallet.switchChain = vi.fn(async () => undefined);
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(9_900);
				expect(testState.walletWriteContract).not.toHaveBeenCalled();
				expect(networkSwitchPending()).toBe(true);
				await vi.advanceTimersByTimeAsync(200);
				await request;
			});

			expect(testState.wallet.switchChain).toHaveBeenCalledTimes(1);
			expect(switchRequests()).toHaveLength(0);
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});

		it("gives up on a chain query that never answers once the settle window closes", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			const { listeners } = providerOn(() => (switched ? new Promise(() => {}) : 56), {
				onSwitch: () => {
					switched = true;
					return null;
				},
			});
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(10_100);
				await request;
			});

			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});

		function deferred<T>() {
			let resolve!: (value: T) => void;
			let reject!: (reason: unknown) => void;
			const promise = new Promise<T>((res, rej) => {
				resolve = res;
				reject = rej;
			});
			return { promise, resolve, reject };
		}

		it("exposes the network switch through the hook while the wallet is asked to switch", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			let chainId: unknown = 56;
			const switchAnswer = deferred<void>();
			providerOn(() => chainId);
			testState.wallet.switchChain = vi.fn(() => switchAnswer.promise);
			const depositHook = renderMode("wallet", "cctp");
			expect(depositHook.networkSwitchPending).toBe(false);

			let request: Promise<void> | undefined;
			await act(async () => {
				request = depositHook.deposit("5");
				await flushUntil(() => testState.wallet.switchChain.mock.calls.length === 1);
			});
			expect(capturedDeposit?.networkSwitchPending).toBe(true);

			await act(async () => {
				chainId = 42161;
				switchAnswer.resolve();
				await request;
			});
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});

		it("ignores chain answers that arrive after the settle window closed", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			const lateAnswers: Array<ReturnType<typeof deferred<unknown>>> = [];
			let queries = 0;
			const { listeners, emitChainChanged } = providerOn(
				() => {
					if (!switched) return 56;
					queries += 1;
					const answer = deferred<unknown>();
					lateAnswers.push(answer);
					return answer.promise;
				},
				{
					onSwitch: () => {
						switched = true;
						return null;
					},
				},
			);
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(10_100);
				await request;
			});
			const queriesAtDeadline = queries;
			expect(queriesAtDeadline).toBe(1);
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
			const errorAtDeadline = capturedDeposit?.error;

			await act(async () => {
				lateAnswers[0]?.resolve(56);
				emitChainChanged("0xa4b1");
				await vi.advanceTimersByTimeAsync(2_000);
			});

			expect(queries).toBe(queriesAtDeadline);
			expect(listeners.size).toBe(0);
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).toBe(errorAtDeadline);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("stops waiting and cleans up when a chain query fails during the observation", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			let queries = 0;
			const failure = deferred<unknown>();
			const { listeners } = providerOn(
				() => {
					if (!switched) return 56;
					queries += 1;
					return failure.promise;
				},
				{
					onSwitch: () => {
						switched = true;
						return null;
					},
				},
			);
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await flushUntil(() => queries === 1 && listeners.size === 1);
				failure.reject(new Error("provider closed"));
				await request;
			});

			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error).not.toBeNull();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(11_000);
			});
			expect(queries).toBe(1);
		});

		it("does not query again after the chainChanged event ended the wait", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			let chainId: unknown = 56;
			let queriesAfterSwitch = 0;
			const { listeners, emitChainChanged } = providerOn(
				() => {
					if (switched) queriesAfterSwitch += 1;
					return chainId;
				},
				{
					onSwitch: () => {
						switched = true;
						return null;
					},
				},
			);
			const depositHook = renderMode("wallet", "cctp");
			const scheduled: Array<{ id: unknown; delay: unknown }> = [];
			const fakeSetTimeout = globalThis.setTimeout;
			const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
				handler: Parameters<typeof setTimeout>[0],
				delay?: number,
				...args: unknown[]
			) => {
				const id = fakeSetTimeout(handler, delay, ...args);
				scheduled.push({ id, delay });
				return id;
			}) as typeof setTimeout);
			const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

			await act(async () => {
				const request = depositHook.deposit("5");
				await flushUntil(() => queriesAfterSwitch === 1 && listeners.size === 1);
				await vi.advanceTimersByTimeAsync(100);
				chainId = 42161;
				emitChainChanged("42161");
				await request;
			});
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			const deadlineTimer = scheduled.find((timer) => timer.delay === 10_000);
			const pollTimer = scheduled.find((timer) => timer.delay === 250);
			expect(deadlineTimer).toBeDefined();
			expect(pollTimer).toBeDefined();
			expect(clearTimeoutSpy).toHaveBeenCalledWith(deadlineTimer?.id);
			expect(clearTimeoutSpy).toHaveBeenCalledWith(pollTimer?.id);
			setTimeoutSpy.mockRestore();
			clearTimeoutSpy.mockRestore();
			const queriesAtEnd = queriesAfterSwitch;

			await act(async () => {
				await vi.advanceTimersByTimeAsync(11_000);
			});
			expect(queriesAfterSwitch).toBe(queriesAtEnd);
			expect(listeners.size).toBe(0);
		});

		it("keeps waiting when the wallet reports a chain other than Arbitrum", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			let chainId: unknown = 56;
			const { listeners, emitChainChanged } = providerOn(() => chainId, {
				onSwitch: () => {
					switched = true;
					return null;
				},
			});
			const depositHook = renderMode("wallet", "cctp");

			let request: Promise<void> | undefined;
			await act(async () => {
				request = depositHook.deposit("5");
				await flushUntil(() => switched && listeners.size === 1);
				emitChainChanged("0x1");
				await vi.advanceTimersByTimeAsync(250);
			});
			expect(listeners.size).toBe(1);
			expect(capturedDeposit?.networkSwitchPending).toBe(true);
			expect(testState.permitSign).not.toHaveBeenCalled();

			await act(async () => {
				chainId = 42161;
				emitChainChanged("0xa4b1");
				await request;
			});
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("falls back to the wallet provider when Privy itself reports an unknown chain", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			let chainId: unknown = 56;
			let switchAttempts = 0;
			const { requests } = providerOn(() => chainId, {
				onSwitch: () => {
					switchAttempts += 1;
					if (switchAttempts === 1) throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
					chainId = 42161;
					return null;
				},
			});
			testState.wallet.switchChain = vi.fn(async () => {
				throw Object.assign(new Error("Unknown chain"), { code: 4902 });
			});

			await submit("wallet", "cctp");

			expect(testState.wallet.switchChain).toHaveBeenCalledTimes(1);
			expect(requests.map((request) => request.method)).toEqual([
				"wallet_switchEthereumChain",
				"wallet_addEthereumChain",
				"wallet_switchEthereumChain",
			]);
			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("does not fall back to the wallet provider when Privy reports a rejected switch", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			const { requests } = providerOn(() => 56);
			testState.wallet.switchChain = vi.fn(async () => {
				throw Object.assign(new Error("User rejected the request."), { code: 4001 });
			});

			await submit("wallet", "cctp");

			expect(requests).toHaveLength(0);
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toBe("Arbitrum network switch was rejected.");
		});

		it("reports a rejected switch without broadcasting", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			const { listeners } = providerOn(() => 56);
			testState.wallet.switchChain = vi.fn(async () => {
				throw Object.assign(new Error("User rejected the request."), { code: 4001 });
			});

			await submit("wallet", "cctp");

			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error?.message).toBe("Arbitrum network switch was rejected.");
		});

		it("does not sign the authorization when the wallet leaves Arbitrum before signing", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 42161;
			let routingChecks = 0;
			providerOn(() => chainId);
			testState.fetchRouting.mockImplementation(async () => {
				routingChecks += 1;
				if (routingChecks === 2) chainId = 56;
				return testState.routingResponse;
			});

			await submit("wallet", "cctp");

			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});

		it("does not broadcast when the wallet leaves Arbitrum after signing", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = "0xa4b1";
			providerOn(() => chainId);
			testState.verifyLegalAction.mockImplementation(async () => {
				chainId = 56;
				return { canPerformActions: true };
			});

			await submit("wallet", "cctp");

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});
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
			if (key.startsWith("sairn:cctp-deposit-tracking-probe:v1:")) {
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

	it("submits a reviewed full-balance sponsored deposit only when the locked balance still matches", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
	});

	it("rejects an automatic mainnet sponsored deposit at the execution boundary", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await submit("smart", "cctp", { expectedBalanceRaw: 5_000_000n, expectedCctpMaxFeeRaw: 200_000n }, "automatic");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("confirmation is required");
	});

	it.each([
		{ name: "no review", review: null },
		{ name: "only a reviewed balance", review: { expectedBalanceRaw: 5_000_000n } },
		{ name: "only a reviewed fee", review: { expectedCctpMaxFeeRaw: 200_000n } },
	])("rejects a mainnet sponsored deposit with $name", async ({ review }) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await submit("smart", "cctp", review);

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("confirmation is required");
	});

	it("rejects a mainnet sponsored amount that differs from the reviewed full balance", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await submit("smart", "cctp", {
			expectedBalanceRaw: 6_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("requires renewed review when the locked sponsored-wallet balance changed", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity(6_000_000n);

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("does not broadcast when the reviewed balance changes after authorization signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity(5_000_000n, 6_000_000n);

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("uses the call-time reviewed CCTP fee instead of the hook fallback", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 300_000n,
		});

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("fees changed");
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

	it("fails closed before signing when the Smart Wallet client is on the wrong chain", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.getClientForChain.mockResolvedValue({
			chain: { id: 421614 },
			paymaster: {},
			sendTransaction: testState.smartSendTransaction,
		});

		await submit("smart", "cctp");

		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 42161 });
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Smart wallet client not ready");
	});

	it("fails closed before signing when the target-chain Smart Wallet client is unavailable", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.getClientForChain.mockResolvedValue(undefined);

		await submit("smart", "cctp");

		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 42161 });
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Smart wallet client not ready");
	});

	it("fails closed before signing when Smart Wallet gas sponsorship is not configured", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.getClientForChain.mockResolvedValue({
			chain: { id: 42161 },
			paymaster: undefined,
			sendTransaction: testState.smartSendTransaction,
		});

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
		const key = `sairn:cctp-sponsored-authorization-intent:v1:mainnet:${WALLET_ADDRESS}`;
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
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
				if (body?.method === "eth_call") {
					return new Response(JSON.stringify({ result: "0x4c4b40" }), { status: 200 });
				}
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

	it.each([
		{ name: "before signing", feeFetchesBeforeRise: 0, signs: 0 },
		{ name: "after signing", feeFetchesBeforeRise: 1, signs: 1 },
	])(
		"reports a fee change when a fresh quote puts the amount below the Circle minimum $name",
		async ({ feeFetchesBeforeRise, signs }) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			let feeRequestCount = 0;
			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
					const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
					if (body?.method === "eth_call") {
						return new Response(JSON.stringify({ result: "0x4c4b40" }), { status: 200 });
					}
					if (String(input).includes("/fastBurn/USDC/allowance")) {
						return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
					}
					feeRequestCount += 1;
					const forwardFee = feeRequestCount <= feeFetchesBeforeRise ? 200_000 : 3_000_000;
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

			expect(testState.permitSign).toHaveBeenCalledTimes(signs);
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).toBeInstanceOf(LocalizedActionError);
			expect(capturedDeposit?.error?.message).toContain("fees changed");
		},
	);

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
	it("keeps the shown balance while a poll refreshes it in the background", async () => {
		const balanceRequests: Array<(raw: bigint) => void> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
				if (body?.method !== "eth_call") throw new Error("Unexpected request");
				const raw = await new Promise<bigint>((resolve) => balanceRequests.push(resolve));
				return new Response(JSON.stringify({ result: `0x${raw.toString(16)}` }), { status: 200 });
			}),
		);

		act(() => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, { balanceEnabled: true, balancePollIntervalMs: 50, mode: "smart" }),
				),
			);
		});
		await vi.waitFor(() => expect(balanceRequests).toHaveLength(1));
		expect(capturedDeposit?.balanceStatus).toBe("loading");
		expect(capturedDeposit?.maxDepositRaw).toBeUndefined();

		await act(async () => balanceRequests[0]?.(5_000_000n));
		expect(capturedDeposit?.balanceStatus).toBe("success");
		expect(capturedDeposit?.maxDepositRaw).toBe(5_000_000n);

		await vi.waitFor(() => expect(balanceRequests.length).toBeGreaterThanOrEqual(2));
		expect(capturedDeposit?.balanceStatus).toBe("success");
		expect(capturedDeposit?.maxDepositRaw).toBe(5_000_000n);
		expect(capturedDeposit?.balance).toBe("5");

		const newest = balanceRequests.length;
		await act(async () => balanceRequests[newest - 1]?.(7_000_000n));
		expect(capturedDeposit?.balanceStatus).toBe("success");
		expect(capturedDeposit?.maxDepositRaw).toBe(7_000_000n);
	});
});
