// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Address, Hash, Hex } from "viem";
import { concatHex, encodeAbiParameters, encodeEventTopics, encodeFunctionData, numberToHex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CCTP_DEPOSIT_NETWORKS, CCTP_FAST_FINALITY_THRESHOLD } from "@/config/cctp-deposit";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import {
	addressToBytes32,
	CCTP_EXTENSION_ABI,
	CCTP_EXTENSION_V2_ABI,
	encodeCctpForwardHookData,
} from "@/lib/trade/cctp-deposit";
import {
	ArbitrumCctpSourceReceiptError,
	getCctpDepositTrackingRecordStorageKey,
	readCctpSponsoredAuthorizationIntent,
	saveCctpDepositTrackingRecord,
	saveCctpSponsoredAuthorizationIntent,
} from "@/lib/trade/cctp-deposit-tracking";

const OWNER = "0x1111111111111111111111111111111111111111";
const SOURCE_HASH = `0x${"a".repeat(64)}` as Hash;
const FORWARD_HASH = `0x${"b".repeat(64)}` as Hash;
const AUTH_NONCE = `0x${"1".repeat(64)}` as Hash;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("useCctpDepositTracking cross-tab reactivity", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;
	let recoveryHash: Hash | null;
	let removeOnForwardSubmitted: boolean;
	let trackingData: { status: string } | undefined;
	let trackingError: Error | null;

	beforeEach(() => {
		window.localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
		root = createRoot(container);
		recoveryHash = null;
		removeOnForwardSubmitted = false;
		trackingData = undefined;
		trackingError = null;
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSourceReceiptResponse(null)));
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		vi.unstubAllGlobals();
	});

	function Probe() {
		const tracking = useCctpDepositTracking({
			enabled: true,
			env: "Mainnet",
			owner: OWNER,
			removeOnForwardSubmitted,
		});
		recoveryHash = tracking.recoveryRecord?.sourceHash ?? null;
		trackingData = tracking.data;
		trackingError = tracking.error;
		return null;
	}

	function saveRecoveryRecord() {
		saveCctpDepositTrackingRecord({ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "5" });
	}

	it("observes local persistence notifications and another tab's storage event", () => {
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		expect(recoveryHash).toBeNull();

		act(() => {
			saveCctpDepositTrackingRecord({ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "5" });
		});
		expect(recoveryHash).toBe(SOURCE_HASH);

		const recordKey = getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH);
		window.localStorage.removeItem(recordKey);
		act(() => {
			window.dispatchEvent(new StorageEvent("storage", { key: recordKey }));
		});
		expect(recoveryHash).toBeNull();
	});

	it("clears a reloaded recovery record only after an explicit reverted receipt", async () => {
		saveRecoveryRecord();
		vi.mocked(fetch).mockResolvedValue(createSourceReceiptResponse("0x0"));

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() => expect(trackingError).toBeInstanceOf(DefinitiveDepositSourceFailureError));
		});

		expect(trackingError).toMatchObject({ code: "source-transaction-reverted" });
		expect(recoveryHash).toBeNull();
		expect(
			window.localStorage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH)),
		).toBeNull();
	});

	it("keeps a reloaded recovery record when the source receipt is still missing or pending", async () => {
		saveRecoveryRecord();

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() => expect(trackingData).toEqual({ status: "waiting" }));
		});

		expect(recoveryHash).toBe(SOURCE_HASH);
		expect(trackingError).toBeNull();
		expect(
			window.localStorage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH)),
		).not.toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("keeps a reloaded recovery record when the Arbitrum RPC is unavailable", async () => {
		saveRecoveryRecord();
		vi.mocked(fetch).mockRejectedValue(new Error("RPC unavailable"));

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() => expect(trackingError).toBeInstanceOf(ArbitrumCctpSourceReceiptError));
		});

		expect(recoveryHash).toBe(SOURCE_HASH);
		expect(
			window.localStorage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH)),
		).not.toBeNull();
	});

	it("continues with Circle tracking only after a successful source receipt", async () => {
		saveRecoveryRecord();
		vi.mocked(fetch).mockImplementation(createRecoveryFetch());

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() =>
				expect(trackingData).toEqual({ status: "forward-submitted", forwardTxHash: FORWARD_HASH }),
			);
		});

		expect(recoveryHash).toBe(SOURCE_HASH);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(vi.mocked(fetch).mock.calls[2]?.[0].toString()).toContain("iris-api.circle.com/v2/messages/3");
	});

	it("removes a completed automatic-deposit record without reopening the deposit modal", async () => {
		saveRecoveryRecord();
		removeOnForwardSubmitted = true;
		vi.mocked(fetch).mockImplementation(createRecoveryFetch());

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() => expect(recoveryHash).toBeNull());
		});

		expect(
			window.localStorage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH)),
		).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("tracks sponsored receipts without assuming the AA outer transaction sender or target", async () => {
		saveCctpSponsoredAuthorizationIntent({
			authNonce: AUTH_NONCE,
			env: "Mainnet",
			owner: OWNER,
			amount: "5",
			validBefore: Math.floor(Date.now() / 1000) + 3_600,
		});
		saveCctpDepositTrackingRecord({
			authNonce: AUTH_NONCE,
			env: "Mainnet",
			mode: "sponsored",
			owner: OWNER,
			sourceHash: SOURCE_HASH,
			amount: "5",
		});
		vi.mocked(fetch).mockImplementation(createSponsoredRecoveryFetch());

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() =>
				expect(trackingData).toEqual({ status: "forward-submitted", forwardTxHash: FORWARD_HASH }),
			);
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", OWNER)).toBeNull();
		const rpcRequest = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as { method?: string };
		expect(rpcRequest.method).toBe("eth_getTransactionReceipt");
	});

	it("retains the sponsored authorization tombstone after a skipped recovery receipt", async () => {
		saveCctpSponsoredAuthorizationIntent({
			authNonce: AUTH_NONCE,
			env: "Mainnet",
			owner: OWNER,
			amount: "5",
			validBefore: Math.floor(Date.now() / 1000) + 3_600,
		});
		saveCctpDepositTrackingRecord({
			authNonce: AUTH_NONCE,
			env: "Mainnet",
			mode: "sponsored",
			owner: OWNER,
			sourceHash: SOURCE_HASH,
			amount: "5",
		});
		vi.mocked(fetch).mockImplementation(createSponsoredRecoveryFetch([createSponsoredDepositSkippedLog()]));

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() => expect(trackingError).toBeInstanceOf(DefinitiveDepositSourceFailureError));
		});

		expect(recoveryHash).toBeNull();
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", OWNER)).toMatchObject({
			authNonce: AUTH_NONCE,
			status: "submission-unresolved",
		});
	});

	it.each([
		["has no official burn event", []],
		["emits the event from another extension", [createBatchDepositLog({ address: OWNER as Address })]],
		["has mismatched event fields", [createBatchDepositLog({ amountRaw: 4_000_000n })]],
	])("clears a confirmed recovery record when its receipt $name", async (_name, logs) => {
		saveRecoveryRecord();
		vi.mocked(fetch).mockImplementation(createRecoveryFetch({ logs }));

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() => expect(trackingError).toBeInstanceOf(DefinitiveDepositSourceFailureError));
		});

		expect(trackingError).toMatchObject({ code: "source-receipt-mismatch" });
		expect(recoveryHash).toBeNull();
		expect(
			window.localStorage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH)),
		).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("clears a confirmed recovery record when its calldata hook does not match the owner", async () => {
		saveRecoveryRecord();
		vi.mocked(fetch).mockImplementation(
			createRecoveryFetch({ transaction: createSourceTransactionPayload(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder) }),
		);

		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		await act(async () => {
			await vi.waitFor(() => expect(trackingError).toBeInstanceOf(DefinitiveDepositSourceFailureError));
		});

		expect(trackingError).toMatchObject({ code: "source-receipt-mismatch" });
		expect(recoveryHash).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

function createSourceReceiptResponse(status: "0x0" | "0x1" | null): Response {
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			result: status === null ? null : { transactionHash: SOURCE_HASH, status, logs: [createBatchDepositLog()] },
		}),
		{ status: 200 },
	);
}

function createBatchDepositLog({
	address = CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtension,
	amountRaw = 5_000_000n,
}: {
	address?: Address;
	amountRaw?: bigint;
} = {}) {
	return {
		address,
		data: encodeAbiParameters(
			[{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint32" }],
			[
				1n,
				amountRaw,
				OWNER,
				addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
				CCTP_DEPOSIT_NETWORKS.mainnet.destinationDomain,
			],
		),
		topics: encodeEventTopics({ abi: CCTP_EXTENSION_ABI, eventName: "BatchDepositForBurn" }),
	};
}

function createSponsoredDepositLog() {
	return {
		address: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2,
		data: encodeAbiParameters(
			[{ type: "bytes32" }, { type: "uint32" }, { type: "uint256" }],
			[
				addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
				CCTP_DEPOSIT_NETWORKS.mainnet.destinationDomain,
				5_000_000n,
			],
		),
		topics: encodeEventTopics({
			abi: CCTP_EXTENSION_V2_ABI,
			args: { authNonce: AUTH_NONCE, depositor: OWNER },
			eventName: "SponsoredDepositForBurn",
		}),
	};
}

function createSponsoredDepositSkippedLog() {
	return {
		address: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2,
		data: "0x" as const,
		topics: encodeEventTopics({
			abi: CCTP_EXTENSION_V2_ABI,
			args: { authNonce: AUTH_NONCE, depositor: OWNER },
			eventName: "SponsoredDepositForBurnSkipped",
		}),
	};
}

function createSourceTransactionPayload(hookOwner: Address = OWNER) {
	return {
		jsonrpc: "2.0",
		id: 2,
		result: {
			hash: SOURCE_HASH,
			from: OWNER,
			to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtension,
			input: encodeFunctionData({
				abi: CCTP_EXTENSION_ABI,
				functionName: "batchDepositForBurnWithAuth",
				args: [
					{
						amount: 5_000_000n,
						authValidAfter: 0n,
						authValidBefore: 1n,
						authNonce: `0x${"1".repeat(64)}`,
						v: 27,
						r: `0x${"2".repeat(64)}`,
						s: `0x${"3".repeat(64)}`,
					},
					{
						amount: 5_000_000n,
						destinationDomain: CCTP_DEPOSIT_NETWORKS.mainnet.destinationDomain,
						mintRecipient: addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
						destinationCaller: addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
						maxFee: 200_000n,
						minFinalityThreshold: CCTP_FAST_FINALITY_THRESHOLD,
						hookData: encodeCctpForwardHookData(hookOwner),
					},
				],
			}),
		},
	};
}

function createRecoveryFetch({
	logs = [createBatchDepositLog()],
	transaction = createSourceTransactionPayload(),
}: {
	logs?: ReturnType<typeof createBatchDepositLog>[];
	transaction?: ReturnType<typeof createSourceTransactionPayload>;
} = {}) {
	return async (input: RequestInfo | URL, init?: RequestInit) => {
		if (!String(input).includes("arb1.arbitrum.io")) {
			return new Response(
				JSON.stringify({
					sourceTxHash: SOURCE_HASH,
					messages: [{ message: createCircleCctpMessage(), status: "complete", forwardTxHash: FORWARD_HASH }],
				}),
				{ status: 200 },
			);
		}
		const request = JSON.parse(String(init?.body)) as { method?: string };
		const payload =
			request.method === "eth_getTransactionReceipt"
				? { jsonrpc: "2.0", id: 1, result: { transactionHash: SOURCE_HASH, status: "0x1", logs } }
				: transaction;
		return new Response(JSON.stringify(payload), { status: 200 });
	};
}

function createSponsoredRecoveryFetch(logs = [createSponsoredDepositLog()]) {
	return async (input: RequestInfo | URL) => {
		if (!String(input).includes("arb1.arbitrum.io")) {
			return new Response(
				JSON.stringify({
					sourceTxHash: SOURCE_HASH,
					messages: [
						{
							message: createCircleCctpMessage({ mode: "sponsored" }),
							status: "complete",
							forwardTxHash: FORWARD_HASH,
						},
					],
				}),
				{ status: 200 },
			);
		}
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				result: { transactionHash: SOURCE_HASH, status: "0x1", logs },
			}),
			{ status: 200 },
		);
	};
}

function createCircleCctpMessage({
	mode = "direct",
	owner = OWNER,
}: {
	mode?: "direct" | "sponsored";
	owner?: Address;
} = {}): Hex {
	const config = CCTP_DEPOSIT_NETWORKS.mainnet;
	const messageSender = mode === "sponsored" ? config.cctpExtensionV2 : config.cctpExtension;
	return concatHex([
		numberToHex(1, { size: 4 }),
		numberToHex(config.sourceDomain, { size: 4 }),
		numberToHex(config.destinationDomain, { size: 4 }),
		AUTH_NONCE,
		addressToBytes32(config.cctpExtension),
		addressToBytes32(config.cctpExtension),
		addressToBytes32(config.cctpForwarder),
		numberToHex(CCTP_FAST_FINALITY_THRESHOLD, { size: 4 }),
		numberToHex(CCTP_FAST_FINALITY_THRESHOLD, { size: 4 }),
		numberToHex(1, { size: 4 }),
		addressToBytes32(config.usdc),
		addressToBytes32(config.cctpForwarder),
		numberToHex(5_000_000, { size: 32 }),
		addressToBytes32(messageSender),
		numberToHex(200_000, { size: 32 }),
		numberToHex(200_000, { size: 32 }),
		numberToHex(1, { size: 32 }),
		encodeCctpForwardHookData(owner),
	]);
}
