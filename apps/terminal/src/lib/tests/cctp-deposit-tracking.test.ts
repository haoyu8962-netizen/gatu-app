// @vitest-environment jsdom

import type { Address, Hex } from "viem";
import { concatHex, encodeAbiParameters, encodeEventTopics, encodeFunctionData, numberToHex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CCTP_DEPOSIT_NETWORKS, CCTP_FAST_FINALITY_THRESHOLD } from "@/config/cctp-deposit";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import {
	addressToBytes32,
	CCTP_EXTENSION_ABI,
	CCTP_EXTENSION_V2_ABI,
	encodeCctpForwardHookData,
} from "@/lib/trade/cctp-deposit";
import {
	ArbitrumCctpSourceReceiptError,
	assertCctpDepositTrackingStorageWritable,
	buildCircleCctpMessagesUrl,
	CCTP_DEPOSIT_TRACKING_MAX_AGE_MS,
	CCTP_DEPOSIT_TRACKING_MAX_RECORDS,
	CctpDepositTrackingPersistenceError,
	fetchArbitrumCctpSourceReceiptStatus,
	fetchCircleCctpDepositStatus,
	getCctpDepositTrackingRecordStorageKey,
	getCctpDepositTrackingStorageKey,
	getCctpSponsoredAuthorizationIntentStorageKey,
	parseArbitrumCctpSourceReceiptResponse,
	parseArbitrumCctpSourceTransactionResponse,
	parseCircleCctpMessagesResponse,
	readCctpDepositTrackingRecords,
	readCctpSponsoredAuthorizationIntent,
	removeCctpDepositTrackingRecord,
	removeCctpSponsoredAuthorizationIntent,
	saveCctpDepositTrackingRecord,
	saveCctpSponsoredAuthorizationIntent,
	subscribeCctpDepositTrackingRecords,
} from "@/lib/trade/cctp-deposit-tracking";

const OWNER = "0x1111111111111111111111111111111111111111";
const SOURCE_HASH = `0x${"a".repeat(64)}` as `0x${string}`;
const FORWARD_HASH = `0x${"b".repeat(64)}` as `0x${string}`;
const AUTH_NONCE = `0x${"1".repeat(64)}` as const;
const NOW_MS = 2_000_000_000_000;
const TRACKING_RECORD = {
	amount: "5",
	env: "Mainnet" as const,
	owner: OWNER as `0x${string}`,
	sourceHash: SOURCE_HASH as `0x${string}`,
	mode: "direct" as const,
};

const SPONSORED_TRACKING_RECORD = {
	...TRACKING_RECORD,
	authNonce: AUTH_NONCE,
	mode: "sponsored" as const,
};

const CIRCLE_DIRECT_IDENTITY = {
	amount: TRACKING_RECORD.amount,
	env: TRACKING_RECORD.env,
	mode: TRACKING_RECORD.mode,
	owner: TRACKING_RECORD.owner,
};

class MemoryStorage implements Storage {
	private readonly items = new Map<string, string>();

	get length(): number {
		return this.items.size;
	}

	clear(): void {
		this.items.clear();
	}

	getItem(key: string): string | null {
		return this.items.get(key) ?? null;
	}

	key(index: number): string | null {
		return Array.from(this.items.keys())[index] ?? null;
	}

	removeItem(key: string): void {
		this.items.delete(key);
	}

	setItem(key: string, value: string): void {
		this.items.set(key, value);
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Circle CCTP deposit status", () => {
	it("builds the production and sandbox Arbitrum-domain endpoints", () => {
		expect(buildCircleCctpMessagesUrl("Mainnet", SOURCE_HASH.toUpperCase().replace("0X", "0x"))).toBe(
			`https://iris-api.circle.com/v2/messages/3?transactionHash=${SOURCE_HASH}`,
		);
		expect(buildCircleCctpMessagesUrl("Testnet", SOURCE_HASH)).toBe(
			`https://iris-api-sandbox.circle.com/v2/messages/3?transactionHash=${SOURCE_HASH}`,
		);
		expect(() => buildCircleCctpMessagesUrl("Mainnet", "0x1234")).toThrow("must be a 32-byte hexadecimal value");
	});

	it("treats empty and official pending-confirmation messages as waiting", () => {
		expect(parseCircleCctpMessagesResponse({ sourceTxHash: SOURCE_HASH, messages: [] })).toEqual({ status: "waiting" });
		expect(
			parseCircleCctpMessagesResponse({ sourceTxHash: SOURCE_HASH, messages: [{ status: "pending_confirmations" }] }),
		).toEqual({
			status: "waiting",
		});
		expect(parseCircleCctpMessagesResponse({ sourceTxHash: SOURCE_HASH, messages: [{ status: "complete" }] })).toEqual({
			status: "waiting",
		});
	});

	it("reports a submitted forward transaction without claiming HyperCore credit", () => {
		expect(
			parseCircleCctpMessagesResponse(
				{
					sourceTxHash: SOURCE_HASH,
					messages: [{ status: "complete", forwardState: "PENDING", forwardTxHash: FORWARD_HASH }],
				},
				SOURCE_HASH,
			),
		).toEqual({ status: "forward-submitted", forwardTxHash: FORWARD_HASH });
	});

	it("selects only the tracked deposit from a multi-user smart-account batch", () => {
		const anotherOwner = "0x2222222222222222222222222222222222222222" as const;
		const anotherForwardHash = `0x${"c".repeat(64)}` as const;
		expect(
			parseCircleCctpMessagesResponse(
				{
					sourceTxHash: SOURCE_HASH,
					messages: [
						{
							message: createCircleCctpMessage({ mode: "sponsored", owner: anotherOwner }),
							status: 123,
							forwardTxHash: anotherForwardHash,
						},
						{
							message: createCircleCctpMessage({ mode: "sponsored" }),
							status: "complete",
							forwardTxHash: FORWARD_HASH,
						},
					],
				},
				SOURCE_HASH,
				{ ...CIRCLE_DIRECT_IDENTITY, mode: "sponsored" },
			),
		).toEqual({ status: "forward-submitted", forwardTxHash: FORWARD_HASH });
	});

	it("waits for the tracked message and rejects duplicate matching messages", () => {
		const unrelatedMessage = {
			message: createCircleCctpMessage({ owner: "0x2222222222222222222222222222222222222222" }),
			status: "complete",
			forwardTxHash: FORWARD_HASH,
		};
		expect(
			parseCircleCctpMessagesResponse(
				{ sourceTxHash: SOURCE_HASH, messages: [unrelatedMessage] },
				SOURCE_HASH,
				CIRCLE_DIRECT_IDENTITY,
			),
		).toEqual({ status: "waiting" });

		const matchingMessage = {
			message: createCircleCctpMessage(),
			status: "complete",
			forwardTxHash: FORWARD_HASH,
		};
		expect(() =>
			parseCircleCctpMessagesResponse(
				{ sourceTxHash: SOURCE_HASH, messages: [matchingMessage, matchingMessage] },
				SOURCE_HASH,
				CIRCLE_DIRECT_IDENTITY,
			),
		).toThrow("multiple messages match");
	});

	it("requires raw message bytes when selecting a deposit from a batch", () => {
		expect(() =>
			parseCircleCctpMessagesResponse(
				{ sourceTxHash: SOURCE_HASH, messages: [{ status: "complete", forwardTxHash: FORWARD_HASH }] },
				SOURCE_HASH,
				CIRCLE_DIRECT_IDENTITY,
			),
		).toThrow("message bytes are invalid");
	});

	it.each([
		["missing messages", {}],
		["non-array messages", { messages: {} }],
		["non-object message", { messages: [null] }],
		["missing source transaction hash", { messages: [{ status: "pending" }] }],
		["short forward hash", { messages: [{ status: "complete", forwardTxHash: "0x1234" }] }],
		["null forward hash", { messages: [{ status: "complete", forwardTxHash: null }] }],
		["invalid forward state", { messages: [{ status: "complete", forwardState: 1 }] }],
	])("rejects malformed responses: %s", (_name, response) => {
		expect(() => parseCircleCctpMessagesResponse(response)).toThrow();
	});

	it("rejects a source-hash mismatch and ambiguous forwarding results", () => {
		expect(() => parseCircleCctpMessagesResponse({ sourceTxHash: FORWARD_HASH, messages: [] }, SOURCE_HASH)).toThrow(
			"does not match",
		);
		expect(() =>
			parseCircleCctpMessagesResponse({
				sourceTxHash: SOURCE_HASH,
				messages: [
					{ status: "complete", forwardTxHash: FORWARD_HASH },
					{ status: "complete", forwardTxHash: SOURCE_HASH },
				],
			}),
		).toThrow("multiple forward transaction hashes");
	});

	it("maps 404 to waiting and forwards the abort signal", async () => {
		const controller = new AbortController();
		const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

		await expect(
			fetchCircleCctpDepositStatus({
				...CIRCLE_DIRECT_IDENTITY,
				env: "Testnet",
				sourceHash: SOURCE_HASH,
				signal: controller.signal,
				fetchImpl,
			}),
		).resolves.toEqual({ status: "waiting" });
		expect(fetchImpl).toHaveBeenCalledWith(
			`https://iris-api-sandbox.circle.com/v2/messages/3?transactionHash=${SOURCE_HASH}`,
			expect.objectContaining({ method: "GET", signal: controller.signal }),
		);
	});

	it("strictly parses successful requests and surfaces HTTP or JSON failures", async () => {
		const completedFetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					sourceTxHash: SOURCE_HASH,
					messages: [{ message: createCircleCctpMessage(), status: "complete", forwardTxHash: FORWARD_HASH }],
				}),
				{
					status: 200,
				},
			),
		);
		await expect(
			fetchCircleCctpDepositStatus({
				...CIRCLE_DIRECT_IDENTITY,
				sourceHash: SOURCE_HASH,
				fetchImpl: completedFetch,
			}),
		).resolves.toEqual({ status: "forward-submitted", forwardTxHash: FORWARD_HASH });

		const failedFetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
		await expect(
			fetchCircleCctpDepositStatus({
				...CIRCLE_DIRECT_IDENTITY,
				sourceHash: SOURCE_HASH,
				fetchImpl: failedFetch,
			}),
		).rejects.toMatchObject({ httpStatus: 429 });

		const invalidJsonFetch = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
		await expect(
			fetchCircleCctpDepositStatus({
				...CIRCLE_DIRECT_IDENTITY,
				sourceHash: SOURCE_HASH,
				fetchImpl: invalidJsonFetch,
			}),
		).rejects.toThrow("expected JSON");
	});
});

describe("Arbitrum CCTP source receipt recovery", () => {
	it("uses the configured RPC for each environment and requests the exact tracked receipt", async () => {
		const mainnetFetch = createSuccessfulRpcFetch(CCTP_DEPOSIT_NETWORKS.mainnet);
		const testnetRecord = { ...TRACKING_RECORD, env: "Testnet" as const };
		const testnetFetch = createSuccessfulRpcFetch(CCTP_DEPOSIT_NETWORKS.testnet);

		await expect(
			fetchArbitrumCctpSourceReceiptStatus({ ...TRACKING_RECORD, fetchImpl: mainnetFetch }),
		).resolves.toEqual({ status: "confirmed-success" });
		await expect(fetchArbitrumCctpSourceReceiptStatus({ ...testnetRecord, fetchImpl: testnetFetch })).resolves.toEqual({
			status: "confirmed-success",
		});

		expect(mainnetFetch.mock.calls[0]?.[0]).toBe("https://arb1.arbitrum.io/rpc");
		expect(testnetFetch.mock.calls[0]?.[0]).toBe("https://sepolia-rollup.arbitrum.io/rpc");
		expect(JSON.parse(String(mainnetFetch.mock.calls[0]?.[1]?.body))).toEqual({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_getTransactionReceipt",
			params: [SOURCE_HASH],
		});
		expect(JSON.parse(String(mainnetFetch.mock.calls[1]?.[1]?.body))).toEqual({
			jsonrpc: "2.0",
			id: 2,
			method: "eth_getTransactionByHash",
			params: [SOURCE_HASH],
		});
	});

	it("treats a missing receipt as unknown and accepts only a matching confirmed success", () => {
		expect(parseArbitrumCctpSourceReceiptResponse(createSourceReceiptPayload(null), TRACKING_RECORD)).toEqual({
			status: "pending",
		});
		expect(parseArbitrumCctpSourceReceiptResponse(createSourceReceiptPayload("0x1"), TRACKING_RECORD)).toEqual({
			status: "confirmed-success",
		});
	});

	it("surfaces an explicit reverted receipt as a structured definitive failure", () => {
		expect(() => parseArbitrumCctpSourceReceiptResponse(createSourceReceiptPayload("0x0"), TRACKING_RECORD)).toThrow(
			DefinitiveDepositSourceFailureError,
		);
		try {
			parseArbitrumCctpSourceReceiptResponse(createSourceReceiptPayload("0x0"), TRACKING_RECORD);
		} catch (error) {
			expect(error).toMatchObject({ code: "source-transaction-reverted" });
		}
	});

	it("validates the exact official extension event and source transaction calldata", () => {
		expect(() =>
			parseArbitrumCctpSourceTransactionResponse(createSourceTransactionPayload(), TRACKING_RECORD),
		).not.toThrow();
	});

	it("validates a sponsored receipt by owner, amount, and authorization nonce", () => {
		expect(
			parseArbitrumCctpSourceReceiptResponse(
				createSourceReceiptPayload("0x1", SOURCE_HASH, [createSponsoredDepositLog()]),
				SPONSORED_TRACKING_RECORD,
			),
		).toEqual({ status: "confirmed-success" });
	});

	it.each([
		["a skipped authorization", [createSponsoredDepositLog(), createSponsoredDepositSkippedLog()]],
		["a different authorization nonce", [createSponsoredDepositLog({ authNonce: FORWARD_HASH })]],
		["a different depositor", [createSponsoredDepositLog({ depositor: CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder })]],
		["a different amount", [createSponsoredDepositLog({ amountRaw: 4_000_000n })]],
	])("rejects a sponsored receipt with %s", (_name, logs) => {
		expect(() =>
			parseArbitrumCctpSourceReceiptResponse(
				createSourceReceiptPayload("0x1", SOURCE_HASH, logs),
				SPONSORED_TRACKING_RECORD,
			),
		).toThrow(DefinitiveDepositSourceFailureError);
	});

	it.each([
		["missing official burn event", createSourceReceiptPayload("0x1", SOURCE_HASH, [])],
		[
			"event from another extension",
			createSourceReceiptPayload("0x1", SOURCE_HASH, [createBatchDepositLog({ address: OWNER })]),
		],
		[
			"mismatched event amount",
			createSourceReceiptPayload("0x1", SOURCE_HASH, [createBatchDepositLog({ amountRaw: 4_000_000n })]),
		],
	])("treats %s as a definitive receipt mismatch", (_name, response) => {
		expect(() => parseArbitrumCctpSourceReceiptResponse(response, TRACKING_RECORD)).toThrow(
			DefinitiveDepositSourceFailureError,
		);
		try {
			parseArbitrumCctpSourceReceiptResponse(response, TRACKING_RECORD);
		} catch (error) {
			expect(error).toMatchObject({ code: "source-receipt-mismatch" });
		}
	});

	it.each([
		["wrong extension", createSourceTransactionPayload({ to: OWNER })],
		["wrong owner", createSourceTransactionPayload({ from: CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder })],
		["wrong hook owner", createSourceTransactionPayload({ hookOwner: CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder })],
		["wrong forwarding domain", createSourceTransactionPayload({ destinationDomain: 0 })],
		["wrong forwarder", createSourceTransactionPayload({ forwarder: OWNER })],
	])("treats calldata with %s as a definitive receipt mismatch", (_name, response) => {
		expect(() => parseArbitrumCctpSourceTransactionResponse(response, TRACKING_RECORD)).toThrow(
			DefinitiveDepositSourceFailureError,
		);
	});

	it.each([
		["a mismatched receipt", createSourceReceiptPayload("0x1", FORWARD_HASH, [])],
		["an unknown receipt status", createSourceReceiptPayload("0x2")],
		["a JSON-RPC error", { jsonrpc: "2.0", id: 1, error: { code: -32_000, message: "unavailable" } }],
		["a malformed response", { jsonrpc: "2.0", id: 1, result: [] }],
	])("keeps %s non-definitive", (_name, response) => {
		expect(() => parseArbitrumCctpSourceReceiptResponse(response, TRACKING_RECORD)).toThrow(
			ArbitrumCctpSourceReceiptError,
		);
	});

	it("surfaces RPC failures and timeouts without manufacturing a receipt outcome", async () => {
		await expect(
			fetchArbitrumCctpSourceReceiptStatus({
				...TRACKING_RECORD,
				fetchImpl: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
			}),
		).rejects.toBeInstanceOf(ArbitrumCctpSourceReceiptError);

		const hangingFetch = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
				}),
		);
		await expect(
			fetchArbitrumCctpSourceReceiptStatus({
				...TRACKING_RECORD,
				fetchImpl: hangingFetch,
				timeoutMs: 1,
			}),
		).rejects.toMatchObject({
			name: "ArbitrumCctpSourceReceiptError",
			message: "The Arbitrum CCTP source receipt request timed out.",
		});
	});
});

describe("CCTP deposit tracking persistence", () => {
	it("probes storage write/readback and always removes the temporary key", () => {
		const storage = new MemoryStorage();
		assertCctpDepositTrackingStorageWritable("Mainnet", OWNER, { storage });
		expect(storage.length).toBe(0);

		vi.spyOn(storage, "getItem").mockReturnValue("mismatch");
		expect(() => assertCctpDepositTrackingStorageWritable("Mainnet", OWNER, { storage })).toThrow(
			CctpDepositTrackingPersistenceError,
		);
		expect(storage.length).toBe(0);
	});

	it("persists only normalized source-submitted recovery fields", () => {
		const storage = new MemoryStorage();
		const record = saveCctpDepositTrackingRecord(
			{
				env: "Mainnet",
				owner: OWNER.toUpperCase().replace("0X", "0x"),
				sourceHash: SOURCE_HASH.toUpperCase().replace("0X", "0x"),
				amount: "5.25",
			},
			{ storage, nowMs: NOW_MS },
		);

		expect(record).toEqual({
			version: 2,
			env: "Mainnet",
			owner: OWNER,
			sourceHash: SOURCE_HASH,
			amount: "5.25",
			createdAt: NOW_MS,
			mode: "direct",
			status: "source-submitted",
		});
		expect(
			JSON.parse(storage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH)) ?? "null"),
		).toEqual(record);
		expect(readCctpDepositTrackingRecords("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toEqual([record]);
	});

	it("persists sponsored recovery identity without the authorization signature", () => {
		const storage = new MemoryStorage();
		const record = saveCctpDepositTrackingRecord(
			{
				authNonce: AUTH_NONCE,
				env: "Mainnet",
				mode: "sponsored",
				owner: OWNER,
				sourceHash: SOURCE_HASH,
				amount: "5",
			},
			{ storage, nowMs: NOW_MS },
		);

		expect(record).toMatchObject({ authNonce: AUTH_NONCE, mode: "sponsored", version: 2 });
		expect(JSON.stringify(record)).not.toContain("signature");
	});

	it("persists a minimal unresolved sponsored authorization before submission", () => {
		const storage = new MemoryStorage();
		const validBefore = Math.floor(NOW_MS / 1000) + 3_600;
		const intent = saveCctpSponsoredAuthorizationIntent(
			{
				authNonce: AUTH_NONCE,
				env: "Mainnet",
				owner: OWNER.toUpperCase().replace("0X", "0x"),
				amount: "5",
				validBefore: BigInt(validBefore),
			},
			{ storage, nowMs: NOW_MS },
		);

		expect(intent).toEqual({
			amount: "5",
			authNonce: AUTH_NONCE,
			createdAt: NOW_MS,
			env: "Mainnet",
			owner: OWNER,
			status: "submission-unresolved",
			validBefore,
			version: 1,
		});
		expect(JSON.stringify(intent)).not.toContain("signature");
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toEqual(intent);
	});

	it("refuses to overwrite an unexpired sponsored authorization and removes only the matching nonce", () => {
		const storage = new MemoryStorage();
		const input = {
			authNonce: AUTH_NONCE,
			env: "Mainnet" as const,
			owner: OWNER,
			amount: "5",
			validBefore: Math.floor(NOW_MS / 1000) + 3_600,
		};
		saveCctpSponsoredAuthorizationIntent(input, { storage, nowMs: NOW_MS });

		expect(() => saveCctpSponsoredAuthorizationIntent(input, { storage, nowMs: NOW_MS })).toThrow("already exists");
		expect(() =>
			removeCctpSponsoredAuthorizationIntent("Mainnet", OWNER, FORWARD_HASH, { storage, nowMs: NOW_MS }),
		).toThrow("does not match");
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", OWNER, { storage, nowMs: NOW_MS })).not.toBeNull();

		removeCctpSponsoredAuthorizationIntent("Mainnet", OWNER, AUTH_NONCE, { storage, nowMs: NOW_MS });
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toBeNull();
	});

	it("removes an expired sponsored authorization and fails closed for invalid or unavailable storage", () => {
		const storage = new MemoryStorage();
		const key = getCctpSponsoredAuthorizationIntentStorageKey("Mainnet", OWNER);
		saveCctpSponsoredAuthorizationIntent(
			{
				authNonce: AUTH_NONCE,
				env: "Mainnet",
				owner: OWNER,
				amount: "5",
				validBefore: Math.floor(NOW_MS / 1000) + 1,
			},
			{ storage, nowMs: NOW_MS },
		);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", OWNER, { storage, nowMs: NOW_MS + 1_000 })).toBeNull();
		expect(storage.getItem(key)).toBeNull();

		storage.setItem(key, "not-json");
		expect(() => readCctpSponsoredAuthorizationIntent("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toThrow(
			"cannot be trusted",
		);
		expect(storage.getItem(key)).toBe("not-json");

		vi.spyOn(storage, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});
		expect(() => readCctpSponsoredAuthorizationIntent("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toThrow(
			CctpDepositTrackingPersistenceError,
		);
	});

	it("reads legacy version-one records as direct version-two recovery records", () => {
		const storage = new MemoryStorage();
		const key = getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH);
		storage.setItem(
			key,
			JSON.stringify({
				amount: "5",
				createdAt: NOW_MS,
				env: "Mainnet",
				owner: OWNER,
				sourceHash: SOURCE_HASH,
				status: "source-submitted",
				version: 1,
			}),
		);

		expect(readCctpDepositTrackingRecords("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toEqual([
			expect.objectContaining({ mode: "direct", version: 2 }),
		]);
	});

	it("deduplicates source hashes and limits records to the newest bounded set", () => {
		const storage = new MemoryStorage();
		for (let index = 0; index <= CCTP_DEPOSIT_TRACKING_MAX_RECORDS; index += 1) {
			saveCctpDepositTrackingRecord(
				{
					env: "Testnet",
					owner: OWNER,
					sourceHash: `0x${index.toString(16).padStart(64, "0")}`,
					amount: "1",
					createdAt: NOW_MS + index,
				},
				{ storage, nowMs: NOW_MS + index },
			);
		}

		const records = readCctpDepositTrackingRecords("Testnet", OWNER, {
			storage,
			nowMs: NOW_MS + CCTP_DEPOSIT_TRACKING_MAX_RECORDS,
		});
		expect(records).toHaveLength(CCTP_DEPOSIT_TRACKING_MAX_RECORDS);
		expect(records[0]?.sourceHash).toBe(`0x${CCTP_DEPOSIT_TRACKING_MAX_RECORDS.toString(16).padStart(64, "0")}`);
		expect(records.at(-1)?.sourceHash).toBe(`0x${"1".padStart(64, "0")}`);

		const replacement = saveCctpDepositTrackingRecord(
			{
				env: "Testnet",
				owner: OWNER,
				sourceHash: records[0]?.sourceHash ?? SOURCE_HASH,
				amount: "2",
				createdAt: NOW_MS + 100,
			},
			{ storage, nowMs: NOW_MS + 100 },
		);
		expect(readCctpDepositTrackingRecords("Testnet", OWNER, { storage, nowMs: NOW_MS + 100 })[0]).toEqual(replacement);
	});

	it("prunes expired records and removes the storage key", () => {
		const storage = new MemoryStorage();
		saveCctpDepositTrackingRecord(
			{ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "5", createdAt: NOW_MS },
			{ storage, nowMs: NOW_MS },
		);
		const key = getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH);

		expect(
			readCctpDepositTrackingRecords("Mainnet", OWNER, {
				storage,
				nowMs: NOW_MS + CCTP_DEPOSIT_TRACKING_MAX_AGE_MS,
			}),
		).toEqual([]);
		expect(storage.getItem(key)).toBeNull();
	});

	it("fails closed and clears malformed or secret-bearing persisted data", () => {
		const storage = new MemoryStorage();
		const key = getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH);
		storage.setItem(key, "{not-json");
		expect(() => readCctpDepositTrackingRecords("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toThrow(
			CctpDepositTrackingPersistenceError,
		);
		expect(storage.getItem(key)).toBeNull();

		storage.setItem(
			key,
			JSON.stringify([
				{
					version: 1,
					env: "Mainnet",
					owner: OWNER,
					sourceHash: SOURCE_HASH,
					amount: "5",
					createdAt: NOW_MS,
					status: "source-submitted",
					signature: "must-not-persist",
				},
			]),
		);
		expect(() => readCctpDepositTrackingRecords("Mainnet", OWNER, { storage, nowMs: NOW_MS })).toThrow(
			"cannot be trusted",
		);
		expect(storage.getItem(key)).toBeNull();
	});

	it("rejects invalid record values and storage writes that cannot be read back", () => {
		const storage = new MemoryStorage();
		expect(() =>
			saveCctpDepositTrackingRecord(
				{ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "0" },
				{ storage, nowMs: NOW_MS },
			),
		).toThrow("Invalid CCTP tracking amount");

		vi.spyOn(storage, "setItem").mockImplementation(() => undefined);
		expect(() =>
			saveCctpDepositTrackingRecord(
				{ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "5" },
				{ storage, nowMs: NOW_MS },
			),
		).toThrow("Unable to persist");
	});

	it("removes completed records without touching another environment or source hash", () => {
		const storage = new MemoryStorage();
		const otherHash = `0x${"c".repeat(64)}`;
		saveCctpDepositTrackingRecord(
			{ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "5" },
			{ storage, nowMs: NOW_MS },
		);
		saveCctpDepositTrackingRecord(
			{ env: "Mainnet", owner: OWNER, sourceHash: otherHash, amount: "6" },
			{ storage, nowMs: NOW_MS + 1 },
		);
		saveCctpDepositTrackingRecord(
			{ env: "Testnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "7" },
			{ storage, nowMs: NOW_MS + 2 },
		);

		removeCctpDepositTrackingRecord("Mainnet", OWNER, SOURCE_HASH, { storage, nowMs: NOW_MS + 3 });
		expect(readCctpDepositTrackingRecords("Mainnet", OWNER, { storage, nowMs: NOW_MS + 3 })).toMatchObject([
			{ sourceHash: otherHash },
		]);
		expect(readCctpDepositTrackingRecords("Testnet", OWNER, { storage, nowMs: NOW_MS + 3 })).toMatchObject([
			{ sourceHash: SOURCE_HASH },
		]);
	});

	it("uses independent per-hash keys so interleaved saves and removal cannot overwrite another record", () => {
		const storage = new MemoryStorage();
		const otherHash = `0x${"c".repeat(64)}`;
		saveCctpDepositTrackingRecord(
			{ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "5" },
			{ storage, nowMs: NOW_MS },
		);
		saveCctpDepositTrackingRecord(
			{ env: "Mainnet", owner: OWNER, sourceHash: otherHash, amount: "6" },
			{ storage, nowMs: NOW_MS + 1 },
		);
		removeCctpDepositTrackingRecord("Mainnet", OWNER, SOURCE_HASH, { storage, nowMs: NOW_MS + 2 });

		expect(storage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH))).toBeNull();
		expect(storage.getItem(getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, otherHash))).not.toBeNull();
		expect(readCctpDepositTrackingRecords("Mainnet", OWNER, { storage, nowMs: NOW_MS + 2 })).toMatchObject([
			{ sourceHash: otherHash },
		]);
	});

	it("notifies subscribers for same-tab writes and cross-tab storage events in the matching account scope", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeCctpDepositTrackingRecords("Mainnet", OWNER, listener);
		const recordKey = getCctpDepositTrackingRecordStorageKey("Mainnet", OWNER, SOURCE_HASH);

		saveCctpDepositTrackingRecord(
			{ env: "Mainnet", owner: OWNER, sourceHash: SOURCE_HASH, amount: "5" },
			{ nowMs: NOW_MS },
		);
		expect(listener).toHaveBeenCalledTimes(1);

		window.dispatchEvent(new StorageEvent("storage", { key: recordKey }));
		expect(listener).toHaveBeenCalledTimes(2);
		window.dispatchEvent(
			new StorageEvent("storage", { key: `${getCctpDepositTrackingStorageKey("Testnet", OWNER)}:${SOURCE_HASH}` }),
		);
		expect(listener).toHaveBeenCalledTimes(2);

		unsubscribe();
		removeCctpDepositTrackingRecord("Mainnet", OWNER, SOURCE_HASH, { nowMs: NOW_MS + 1 });
		expect(listener).toHaveBeenCalledTimes(2);
	});
});

function createCircleCctpMessage({
	amountRaw = 5_000_000n,
	env = "Mainnet",
	mode = "direct",
	owner = OWNER,
}: {
	amountRaw?: bigint;
	env?: "Mainnet" | "Testnet";
	mode?: "direct" | "sponsored";
	owner?: Address;
} = {}): Hex {
	const config = CCTP_DEPOSIT_NETWORKS[env === "Testnet" ? "testnet" : "mainnet"];
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
		numberToHex(amountRaw, { size: 32 }),
		addressToBytes32(messageSender),
		numberToHex(200_000, { size: 32 }),
		numberToHex(200_000, { size: 32 }),
		numberToHex(1, { size: 32 }),
		encodeCctpForwardHookData(owner),
	]);
}

function createBatchDepositLog({
	address = CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtension,
	amountRaw = 5_000_000n,
	config = CCTP_DEPOSIT_NETWORKS.mainnet,
	depositor = OWNER as Address,
}: {
	address?: Address;
	amountRaw?: bigint;
	config?: (typeof CCTP_DEPOSIT_NETWORKS)[keyof typeof CCTP_DEPOSIT_NETWORKS];
	depositor?: Address;
} = {}) {
	return {
		address,
		data: encodeAbiParameters(
			[{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint32" }],
			[1n, amountRaw, depositor, addressToBytes32(config.cctpForwarder), config.destinationDomain],
		),
		topics: encodeEventTopics({ abi: CCTP_EXTENSION_ABI, eventName: "BatchDepositForBurn" }),
	};
}

function createSponsoredDepositLog({
	address = CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2,
	amountRaw = 5_000_000n,
	authNonce = AUTH_NONCE,
	depositor = OWNER as Address,
}: {
	address?: Address;
	amountRaw?: bigint;
	authNonce?: `0x${string}`;
	depositor?: Address;
} = {}) {
	return {
		address,
		data: encodeAbiParameters(
			[{ type: "bytes32" }, { type: "uint32" }, { type: "uint256" }],
			[
				addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
				CCTP_DEPOSIT_NETWORKS.mainnet.destinationDomain,
				amountRaw,
			],
		),
		topics: encodeEventTopics({
			abi: CCTP_EXTENSION_V2_ABI,
			args: { authNonce, depositor },
			eventName: "SponsoredDepositForBurn",
		}),
	};
}

function createSponsoredDepositSkippedLog({
	address = CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2,
	authNonce = AUTH_NONCE,
	depositor = OWNER as Address,
}: {
	address?: Address;
	authNonce?: `0x${string}`;
	depositor?: Address;
} = {}) {
	return {
		address,
		data: "0x" as const,
		topics: encodeEventTopics({
			abi: CCTP_EXTENSION_V2_ABI,
			args: { authNonce, depositor },
			eventName: "SponsoredDepositForBurnSkipped",
		}),
	};
}

function createSourceReceiptPayload(
	status: "0x0" | "0x1" | "0x2" | null,
	transactionHash = SOURCE_HASH,
	logs = status === null ? [] : [createBatchDepositLog()],
) {
	return {
		jsonrpc: "2.0",
		id: 1,
		result: status === null ? null : { transactionHash, status, logs },
	};
}

function createSourceTransactionPayload({
	config = CCTP_DEPOSIT_NETWORKS.mainnet,
	destinationDomain = config.destinationDomain,
	forwarder = config.cctpForwarder,
	from = OWNER as Address,
	hookOwner = OWNER as Address,
	to = config.cctpExtension,
}: {
	config?: (typeof CCTP_DEPOSIT_NETWORKS)[keyof typeof CCTP_DEPOSIT_NETWORKS];
	destinationDomain?: number;
	forwarder?: Address;
	from?: Address;
	hookOwner?: Address;
	to?: Address;
} = {}) {
	const input = encodeFunctionData({
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
				destinationDomain,
				mintRecipient: addressToBytes32(forwarder),
				destinationCaller: addressToBytes32(forwarder),
				maxFee: 200_000n,
				minFinalityThreshold: CCTP_FAST_FINALITY_THRESHOLD,
				hookData: encodeCctpForwardHookData(hookOwner),
			},
		],
	});
	return { jsonrpc: "2.0", id: 2, result: { hash: SOURCE_HASH, from, to, input } };
}

function createSuccessfulRpcFetch(config: (typeof CCTP_DEPOSIT_NETWORKS)[keyof typeof CCTP_DEPOSIT_NETWORKS]) {
	return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
		const request = JSON.parse(String(init?.body)) as { method?: string };
		const payload =
			request.method === "eth_getTransactionReceipt"
				? createSourceReceiptPayload("0x1", SOURCE_HASH, [
						createBatchDepositLog({ config, address: config.cctpExtension }),
					])
				: createSourceTransactionPayload({ config });
		return new Response(JSON.stringify(payload), { status: 200 });
	});
}
