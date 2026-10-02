import type { Hash, TransactionReceipt } from "viem";
import { isAddress, isHex, numberToHex, size, sliceHex } from "viem";
import { getCctpDepositConfig } from "@/config/cctp-deposit";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import {
	addressToBytes32,
	assertCctpDepositReceipt,
	assertCctpDepositSourceTransaction,
	assertCctpSponsoredDepositReceipt,
	encodeCctpForwardHookData,
} from "@/lib/trade/cctp-deposit";

export type CctpDepositEnvironment = "Mainnet" | "Testnet";

export type CctpDepositForwardingStatus = { status: "waiting" } | { status: "forward-submitted"; forwardTxHash: Hash };

interface CctpDepositTrackingRecordBase {
	version: typeof CCTP_DEPOSIT_TRACKING_VERSION;
	env: CctpDepositEnvironment;
	owner: `0x${string}`;
	sourceHash: Hash;
	amount: string;
	createdAt: number;
	status: "source-submitted";
}

export type CctpDepositTrackingRecord = CctpDepositTrackingRecordBase &
	({ mode: "direct"; authNonce?: never } | { mode: "sponsored"; authNonce: Hash });

interface SaveCctpDepositTrackingRecordInputBase {
	env: CctpDepositEnvironment;
	owner: string;
	sourceHash: string;
	amount: string;
	createdAt?: number;
}

export type SaveCctpDepositTrackingRecordInput = SaveCctpDepositTrackingRecordInputBase &
	({ mode?: "direct"; authNonce?: never } | { mode: "sponsored"; authNonce: string });

export interface CctpDepositTrackingStorageOptions {
	storage?: Storage;
	nowMs?: number;
}

export interface CctpSponsoredAuthorizationIntent {
	version: typeof CCTP_SPONSORED_AUTHORIZATION_INTENT_VERSION;
	env: CctpDepositEnvironment;
	owner: `0x${string}`;
	authNonce: Hash;
	amount: string;
	validBefore: number;
	createdAt: number;
	status: "submission-unresolved";
}

export interface SaveCctpSponsoredAuthorizationIntentInput {
	env: CctpDepositEnvironment;
	owner: string;
	authNonce: string;
	amount: string;
	validBefore: bigint | number;
	createdAt?: number;
}

export interface CircleCctpDepositMessageIdentity {
	env: CctpDepositEnvironment;
	owner: string;
	amount: string;
	mode: "direct" | "sponsored";
}

export interface FetchCircleCctpDepositStatusInput extends CircleCctpDepositMessageIdentity {
	sourceHash: string;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}

export interface FetchArbitrumCctpSourceReceiptStatusInput {
	env: CctpDepositEnvironment;
	sourceHash: string;
	owner: string;
	amount: string;
	mode?: "direct";
	authNonce?: never;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

export interface FetchArbitrumSponsoredCctpSourceReceiptStatusInput {
	env: CctpDepositEnvironment;
	sourceHash: string;
	owner: string;
	amount: string;
	mode: "sponsored";
	authNonce: string;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

export type ArbitrumCctpSourceReceiptStatus = { status: "pending" } | { status: "confirmed-success" };

export const CCTP_DEPOSIT_TRACKING_VERSION = 2;
export const CCTP_DEPOSIT_TRACKING_MAX_RECORDS = 20;
export const CCTP_DEPOSIT_TRACKING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const CCTP_DEPOSIT_TRACKING_STORAGE_PREFIX = "sairn:cctp-deposit-tracking:v1";
export const CCTP_SPONSORED_AUTHORIZATION_INTENT_VERSION = 1;
export const CCTP_SPONSORED_AUTHORIZATION_INTENT_STORAGE_PREFIX = "sairn:cctp-sponsored-authorization-intent:v1";

const ARBITRUM_CCTP_SOURCE_DOMAIN = 3;
const CCTP_V2_MESSAGE_VERSION = 1;
const CCTP_V2_HEADER_BYTES = 148;
const CCTP_V2_BURN_TOKEN_OFFSET = CCTP_V2_HEADER_BYTES + 4;
const CCTP_V2_BURN_MINT_RECIPIENT_OFFSET = CCTP_V2_HEADER_BYTES + 36;
const CCTP_V2_BURN_AMOUNT_OFFSET = CCTP_V2_HEADER_BYTES + 68;
const CCTP_V2_BURN_MESSAGE_SENDER_OFFSET = CCTP_V2_HEADER_BYTES + 100;
const CCTP_V2_BURN_HOOK_DATA_OFFSET = CCTP_V2_HEADER_BYTES + 228;
const CCTP_DEPOSIT_TRACKING_CHANGE_EVENT = "sairn:cctp-deposit-tracking-change";
const CCTP_DEPOSIT_TRACKING_PROBE_PREFIX = "sairn:cctp-deposit-tracking-probe:v1";
const CCTP_SOURCE_RECEIPT_TIMEOUT_MS = 10_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const BYTES_32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const CIRCLE_CCTP_API_ORIGINS = {
	Mainnet: "https://iris-api.circle.com",
	Testnet: "https://iris-api-sandbox.circle.com",
} as const;
const LEGACY_TRACKING_RECORD_KEYS = ["amount", "createdAt", "env", "owner", "sourceHash", "status", "version"];
const DIRECT_TRACKING_RECORD_KEYS = ["amount", "createdAt", "env", "mode", "owner", "sourceHash", "status", "version"];
const SPONSORED_TRACKING_RECORD_KEYS = [
	"amount",
	"authNonce",
	"createdAt",
	"env",
	"mode",
	"owner",
	"sourceHash",
	"status",
	"version",
];
const SPONSORED_AUTHORIZATION_INTENT_KEYS = [
	"amount",
	"authNonce",
	"createdAt",
	"env",
	"owner",
	"status",
	"validBefore",
	"version",
];

export class CircleCctpDepositTrackingError extends Error {
	readonly httpStatus?: number;

	constructor(message: string, options?: { cause?: unknown; httpStatus?: number }) {
		super(message, { cause: options?.cause });
		this.name = "CircleCctpDepositTrackingError";
		this.httpStatus = options?.httpStatus;
	}
}

export class CctpDepositTrackingPersistenceError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.name = "CctpDepositTrackingPersistenceError";
	}
}

export class ArbitrumCctpSourceReceiptError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.name = "ArbitrumCctpSourceReceiptError";
	}
}

export async function fetchArbitrumCctpSourceReceiptStatus({
	env,
	sourceHash,
	owner,
	amount,
	mode = "direct",
	authNonce,
	signal,
	fetchImpl = fetch,
	timeoutMs = CCTP_SOURCE_RECEIPT_TIMEOUT_MS,
}:
	| FetchArbitrumCctpSourceReceiptStatusInput
	| FetchArbitrumSponsoredCctpSourceReceiptStatusInput): Promise<ArbitrumCctpSourceReceiptStatus> {
	const normalizedSourceHash = normalizeHash(sourceHash, "CCTP source transaction hash");
	const normalizedOwner = normalizeOwner(owner);
	const normalizedAuthNonce = mode === "sponsored" ? normalizeHash(authNonce, "CCTP authorization nonce") : undefined;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source receipt timeout is invalid.");
	}

	const controller = new AbortController();
	let timedOut = false;
	const handleAbort = () => controller.abort(signal?.reason);
	if (signal?.aborted) handleAbort();
	else signal?.addEventListener("abort", handleAbort, { once: true });
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort(new DOMException("Arbitrum CCTP source receipt request timed out.", "TimeoutError"));
	}, timeoutMs);

	try {
		const config = getCctpDepositConfig(env === "Testnet");
		const receiptResponse = await fetchArbitrumJsonRpc({
			fetchImpl,
			rpcUrl: config.rpcUrl,
			request: {
				jsonrpc: "2.0",
				id: 1,
				method: "eth_getTransactionReceipt",
				params: [normalizedSourceHash],
			},
			signal: controller.signal,
		});
		const receiptStatus = parseArbitrumCctpSourceReceiptResponse(receiptResponse, {
			amount,
			authNonce: normalizedAuthNonce,
			env,
			mode,
			owner: normalizedOwner,
			sourceHash: normalizedSourceHash,
		});
		if (receiptStatus.status === "pending") return receiptStatus;
		if (mode === "sponsored") return receiptStatus;

		const transactionResponse = await fetchArbitrumJsonRpc({
			fetchImpl,
			rpcUrl: config.rpcUrl,
			request: {
				jsonrpc: "2.0",
				id: 2,
				method: "eth_getTransactionByHash",
				params: [normalizedSourceHash],
			},
			signal: controller.signal,
		});
		parseArbitrumCctpSourceTransactionResponse(transactionResponse, {
			amount,
			env,
			owner: normalizedOwner,
			sourceHash: normalizedSourceHash,
		});
		return receiptStatus;
	} catch (cause) {
		if (signal?.aborted) throw signal.reason ?? cause;
		if (cause instanceof DefinitiveDepositSourceFailureError) throw cause;
		if (cause instanceof ArbitrumCctpSourceReceiptError && !timedOut) throw cause;
		throw new ArbitrumCctpSourceReceiptError(
			timedOut
				? "The Arbitrum CCTP source receipt request timed out."
				: "Unable to query Arbitrum for the CCTP source receipt.",
			{ cause },
		);
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", handleAbort);
	}
}

export function parseArbitrumCctpSourceReceiptResponse(
	value: unknown,
	record: Pick<CctpDepositTrackingRecord, "amount" | "authNonce" | "env" | "mode" | "owner" | "sourceHash">,
): ArbitrumCctpSourceReceiptStatus {
	const normalizedExpectedSourceHash = normalizeHash(record.sourceHash, "Expected CCTP source transaction hash");
	if (!isRecord(value) || value.jsonrpc !== "2.0" || value.id !== 1 || !("result" in value)) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source receipt response is malformed.");
	}
	if (value.result === null) return { status: "pending" };
	if (!isRecord(value.result)) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source receipt response is malformed: invalid result.");
	}

	let receiptHash: Hash;
	try {
		receiptHash = normalizeHash(value.result.transactionHash, "Arbitrum CCTP source receipt transaction hash");
	} catch (cause) {
		throw new ArbitrumCctpSourceReceiptError(
			"Arbitrum CCTP source receipt response is malformed: invalid transaction hash.",
			{ cause },
		);
	}
	if (receiptHash !== normalizedExpectedSourceHash) {
		throw new ArbitrumCctpSourceReceiptError(
			"Arbitrum CCTP source receipt response does not match the tracked transaction.",
		);
	}

	if (value.result.status === "0x0") {
		throw new DefinitiveDepositSourceFailureError("source-transaction-reverted", "Transaction reverted on Arbitrum");
	}
	if (value.result.status !== "0x1") {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source receipt response has an invalid status.");
	}

	const receipt = {
		status: "success",
		logs: normalizeRpcReceiptLogs(value.result.logs),
	} as TransactionReceipt;
	try {
		const commonInput = {
			amountRaw: parseCctpTrackingAmountRaw(record.amount),
			config: getCctpDepositConfig(record.env === "Testnet"),
			receipt,
			user: normalizeOwner(record.owner),
		};
		if (record.mode === "sponsored") {
			if (!record.authNonce) throw new Error("Sponsored CCTP tracking record is missing its authorization nonce");
			assertCctpSponsoredDepositReceipt({ ...commonInput, authNonce: record.authNonce });
		} else {
			assertCctpDepositReceipt(commonInput);
		}
	} catch (cause) {
		throw createSourceReceiptMismatchError(cause);
	}
	return { status: "confirmed-success" };
}

export function parseArbitrumCctpSourceTransactionResponse(
	value: unknown,
	record: Pick<CctpDepositTrackingRecord, "amount" | "env" | "owner" | "sourceHash">,
): void {
	const normalizedExpectedSourceHash = normalizeHash(record.sourceHash, "Expected CCTP source transaction hash");
	if (!isRecord(value) || value.jsonrpc !== "2.0" || value.id !== 2 || !("result" in value)) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source transaction response is malformed.");
	}
	if (value.result === null) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source transaction is temporarily unavailable.");
	}
	if (!isRecord(value.result)) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source transaction response is malformed: invalid result.");
	}
	const transactionHash = normalizeHash(value.result.hash, "Arbitrum CCTP source transaction hash");
	if (transactionHash !== normalizedExpectedSourceHash) {
		throw new ArbitrumCctpSourceReceiptError(
			"Arbitrum CCTP source transaction response does not match the tracked transaction.",
		);
	}
	if (
		typeof value.result.from !== "string" ||
		!isAddress(value.result.from, { strict: true }) ||
		typeof value.result.to !== "string" ||
		!isAddress(value.result.to, { strict: true }) ||
		typeof value.result.input !== "string" ||
		!isHex(value.result.input, { strict: true })
	) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source transaction response is malformed.");
	}

	try {
		assertCctpDepositSourceTransaction({
			amountRaw: parseCctpTrackingAmountRaw(record.amount),
			config: getCctpDepositConfig(record.env === "Testnet"),
			from: value.result.from,
			input: value.result.input,
			to: value.result.to,
			user: normalizeOwner(record.owner),
		});
	} catch (cause) {
		throw createSourceReceiptMismatchError(cause);
	}
}

async function fetchArbitrumJsonRpc({
	fetchImpl,
	rpcUrl,
	request,
	signal,
}: {
	fetchImpl: typeof fetch;
	rpcUrl: string;
	request: { jsonrpc: "2.0"; id: number; method: string; params: [Hash] };
	signal: AbortSignal;
}): Promise<unknown> {
	const response = await fetchImpl(rpcUrl, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify(request),
		signal,
	});
	if (!response.ok) {
		throw new ArbitrumCctpSourceReceiptError(
			`Arbitrum CCTP source receipt request failed with HTTP ${response.status}.`,
		);
	}
	try {
		return await response.json();
	} catch (cause) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source receipt response is malformed: expected JSON.", {
			cause,
		});
	}
}

function normalizeRpcReceiptLogs(value: unknown): TransactionReceipt["logs"] {
	if (!Array.isArray(value)) {
		throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source receipt response has invalid logs.");
	}
	return value.map((log) => {
		if (
			!isRecord(log) ||
			typeof log.address !== "string" ||
			!isAddress(log.address, { strict: true }) ||
			typeof log.data !== "string" ||
			!isHex(log.data, { strict: true }) ||
			!Array.isArray(log.topics) ||
			!log.topics.every((topic) => typeof topic === "string" && isHex(topic, { strict: true }))
		) {
			throw new ArbitrumCctpSourceReceiptError("Arbitrum CCTP source receipt response has an invalid log.");
		}
		return {
			address: log.address,
			data: log.data,
			topics: log.topics,
		} as TransactionReceipt["logs"][number];
	});
}

function parseCctpTrackingAmountRaw(amount: string): bigint {
	if (!isPositiveDecimal(amount)) throw new Error("Invalid CCTP tracking amount");
	const [whole = "", fraction = ""] = amount.split(".");
	if (fraction.length > 6) throw new Error("Invalid CCTP tracking amount precision");
	return BigInt(`${whole}${fraction.padEnd(6, "0")}`);
}

function createSourceReceiptMismatchError(cause: unknown): DefinitiveDepositSourceFailureError {
	const message = cause instanceof Error ? cause.message : "CCTP source transaction does not match the tracked deposit";
	return new DefinitiveDepositSourceFailureError("source-receipt-mismatch", message, { cause });
}

export function buildCircleCctpMessagesUrl(env: CctpDepositEnvironment, sourceHash: string): string {
	const normalizedSourceHash = normalizeHash(sourceHash, "CCTP source transaction hash");
	const url = new URL(`/v2/messages/${ARBITRUM_CCTP_SOURCE_DOMAIN}`, CIRCLE_CCTP_API_ORIGINS[env]);
	url.searchParams.set("transactionHash", normalizedSourceHash);
	return url.toString();
}

export function parseCircleCctpMessagesResponse(
	value: unknown,
	expectedSourceHash?: string,
	expectedDeposit?: CircleCctpDepositMessageIdentity,
): CctpDepositForwardingStatus {
	if (!isRecord(value) || !Array.isArray(value.messages)) {
		throw new CircleCctpDepositTrackingError("Circle CCTP response is malformed: messages must be an array.");
	}

	const normalizedExpectedSourceHash = expectedSourceHash
		? normalizeHash(expectedSourceHash, "Expected CCTP source transaction hash")
		: undefined;
	const sourceTxHash = normalizeHash(value.sourceTxHash, "Circle CCTP source transaction hash");
	if (normalizedExpectedSourceHash && sourceTxHash !== normalizedExpectedSourceHash) {
		throw new CircleCctpDepositTrackingError(
			"Circle CCTP response is malformed: source transaction hash does not match the request.",
		);
	}

	let messages = value.messages;
	if (expectedDeposit) {
		const matchingMessages = messages.filter((message) => {
			if (!isRecord(message)) {
				throw new CircleCctpDepositTrackingError("Circle CCTP response is malformed: every message must be an object.");
			}
			if (typeof message.message !== "string" || !isHex(message.message, { strict: true })) {
				throw new CircleCctpDepositTrackingError("Circle CCTP response is malformed: message bytes are invalid.");
			}
			return matchesCircleCctpDepositMessage(message.message, expectedDeposit);
		});
		if (matchingMessages.length === 0) return { status: "waiting" };
		if (matchingMessages.length > 1) {
			throw new CircleCctpDepositTrackingError(
				"Circle CCTP response is ambiguous: multiple messages match the tracked deposit.",
			);
		}
		messages = matchingMessages;
	}

	const forwardTxHashes = new Set<Hash>();
	for (const message of messages) {
		if (!isRecord(message)) {
			throw new CircleCctpDepositTrackingError("Circle CCTP response is malformed: every message must be an object.");
		}
		if (typeof message.status !== "string" || message.status.length === 0) {
			throw new CircleCctpDepositTrackingError("Circle CCTP response is malformed: message status is invalid.");
		}
		if (message.forwardState !== undefined && typeof message.forwardState !== "string") {
			throw new CircleCctpDepositTrackingError("Circle CCTP response is malformed: forwarding state is invalid.");
		}
		if (message.forwardTxHash !== undefined) {
			forwardTxHashes.add(normalizeHash(message.forwardTxHash, "Circle CCTP forward transaction hash"));
		}
	}

	if (forwardTxHashes.size > 1) {
		throw new CircleCctpDepositTrackingError(
			"Circle CCTP response is ambiguous: multiple forward transaction hashes were returned.",
		);
	}
	const forwardTxHash = forwardTxHashes.values().next().value;
	return forwardTxHash ? { status: "forward-submitted", forwardTxHash } : { status: "waiting" };
}

function matchesCircleCctpDepositMessage(message: `0x${string}`, identity: CircleCctpDepositMessageIdentity): boolean {
	const config = getCctpDepositConfig(identity.env === "Testnet");
	const owner = normalizeOwner(identity.owner);
	const amountRaw = parseCctpTrackingAmountRaw(identity.amount);
	const expectedHookData = encodeCctpForwardHookData(owner);
	if (size(message) !== CCTP_V2_BURN_HOOK_DATA_OFFSET + size(expectedHookData)) return false;

	const expectedForwarder = addressToBytes32(config.cctpForwarder).toLowerCase();
	const expectedMessageSender = addressToBytes32(
		identity.mode === "sponsored" ? config.cctpExtensionV2 : config.cctpExtension,
	).toLowerCase();
	return (
		sliceHex(message, 0, 4).toLowerCase() === numberToHex(CCTP_V2_MESSAGE_VERSION, { size: 4 }).toLowerCase() &&
		sliceHex(message, 4, 8).toLowerCase() === numberToHex(config.sourceDomain, { size: 4 }).toLowerCase() &&
		sliceHex(message, 8, 12).toLowerCase() === numberToHex(config.destinationDomain, { size: 4 }).toLowerCase() &&
		sliceHex(message, 108, 140).toLowerCase() === expectedForwarder &&
		sliceHex(message, CCTP_V2_HEADER_BYTES, CCTP_V2_HEADER_BYTES + 4).toLowerCase() ===
			numberToHex(CCTP_V2_MESSAGE_VERSION, { size: 4 }).toLowerCase() &&
		sliceHex(message, CCTP_V2_BURN_TOKEN_OFFSET, CCTP_V2_BURN_MINT_RECIPIENT_OFFSET).toLowerCase() ===
			addressToBytes32(config.usdc).toLowerCase() &&
		sliceHex(message, CCTP_V2_BURN_MINT_RECIPIENT_OFFSET, CCTP_V2_BURN_AMOUNT_OFFSET).toLowerCase() ===
			expectedForwarder &&
		sliceHex(message, CCTP_V2_BURN_AMOUNT_OFFSET, CCTP_V2_BURN_MESSAGE_SENDER_OFFSET).toLowerCase() ===
			numberToHex(amountRaw, { size: 32 }).toLowerCase() &&
		sliceHex(message, CCTP_V2_BURN_MESSAGE_SENDER_OFFSET, CCTP_V2_BURN_MESSAGE_SENDER_OFFSET + 32).toLowerCase() ===
			expectedMessageSender &&
		sliceHex(message, CCTP_V2_BURN_HOOK_DATA_OFFSET).toLowerCase() === expectedHookData.toLowerCase()
	);
}

export async function fetchCircleCctpDepositStatus({
	amount,
	env,
	mode,
	owner,
	sourceHash,
	signal,
	fetchImpl = fetch,
}: FetchCircleCctpDepositStatusInput): Promise<CctpDepositForwardingStatus> {
	const normalizedSourceHash = normalizeHash(sourceHash, "CCTP source transaction hash");
	let response: Response;
	try {
		response = await fetchImpl(buildCircleCctpMessagesUrl(env, normalizedSourceHash), {
			method: "GET",
			headers: { Accept: "application/json" },
			signal,
		});
	} catch (cause) {
		if (signal?.aborted) throw cause;
		throw new CircleCctpDepositTrackingError("Unable to query Circle for the CCTP deposit status.", { cause });
	}

	if (response.status === 404) return { status: "waiting" };
	if (!response.ok) {
		throw new CircleCctpDepositTrackingError(`Circle CCTP status request failed with HTTP ${response.status}.`, {
			httpStatus: response.status,
		});
	}

	let value: unknown;
	try {
		value = await response.json();
	} catch (cause) {
		throw new CircleCctpDepositTrackingError("Circle CCTP response is malformed: expected JSON.", { cause });
	}
	return parseCircleCctpMessagesResponse(value, normalizedSourceHash, { amount, env, mode, owner });
}

export function getCctpDepositTrackingStorageKey(env: CctpDepositEnvironment, owner: string): string {
	return `${CCTP_DEPOSIT_TRACKING_STORAGE_PREFIX}:${env.toLowerCase()}:${normalizeOwner(owner)}`;
}

export function getCctpDepositTrackingRecordStorageKey(
	env: CctpDepositEnvironment,
	owner: string,
	sourceHash: string,
): string {
	return `${getCctpDepositTrackingStorageKey(env, owner)}:${normalizeHash(sourceHash, "CCTP source transaction hash")}`;
}

export function getCctpSponsoredAuthorizationIntentStorageKey(env: CctpDepositEnvironment, owner: string): string {
	return `${CCTP_SPONSORED_AUTHORIZATION_INTENT_STORAGE_PREFIX}:${env.toLowerCase()}:${normalizeOwner(owner)}`;
}

export function readCctpSponsoredAuthorizationIntent(
	env: CctpDepositEnvironment,
	owner: string,
	options: CctpDepositTrackingStorageOptions = {},
): CctpSponsoredAuthorizationIntent | null {
	const nowMs = getNowMs(options.nowMs);
	const storage = getStorage(options.storage);
	const normalizedOwner = normalizeOwner(owner);
	const key = getCctpSponsoredAuthorizationIntentStorageKey(env, normalizedOwner);
	let serialized: string | null;
	try {
		serialized = storage.getItem(key);
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError("CCTP sponsored authorization storage is unavailable.", {
			cause,
		});
	}
	if (serialized === null) return null;

	let intent: CctpSponsoredAuthorizationIntent;
	try {
		intent = normalizeSponsoredAuthorizationIntent(JSON.parse(serialized), env, normalizedOwner, nowMs);
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError(
			"Stored CCTP sponsored authorization data is invalid and cannot be trusted.",
			{ cause },
		);
	}
	if (intent.validBefore > Math.floor(nowMs / 1000)) return intent;

	removeTrackingRecordStorageKey(storage, key);
	return null;
}

export function saveCctpSponsoredAuthorizationIntent(
	input: SaveCctpSponsoredAuthorizationIntentInput,
	options: CctpDepositTrackingStorageOptions = {},
): CctpSponsoredAuthorizationIntent {
	const nowMs = getNowMs(options.nowMs);
	const storage = getStorage(options.storage);
	const owner = normalizeOwner(input.owner);
	if (readCctpSponsoredAuthorizationIntent(input.env, owner, { storage, nowMs })) {
		throw new CctpDepositTrackingPersistenceError(
			"An unresolved CCTP sponsored authorization already exists for this account.",
		);
	}
	const validBefore = normalizeAuthorizationValidBefore(input.validBefore);
	if (validBefore <= Math.floor(nowMs / 1000)) {
		throw new CctpDepositTrackingPersistenceError("CCTP sponsored authorization is already expired.");
	}
	const intent = normalizeSponsoredAuthorizationIntent(
		{
			amount: input.amount,
			authNonce: normalizeHash(input.authNonce, "CCTP authorization nonce"),
			createdAt: input.createdAt ?? nowMs,
			env: input.env,
			owner,
			status: "submission-unresolved",
			validBefore,
			version: CCTP_SPONSORED_AUTHORIZATION_INTENT_VERSION,
		},
		input.env,
		owner,
		nowMs,
	);
	writeSponsoredAuthorizationIntent(storage, getCctpSponsoredAuthorizationIntentStorageKey(input.env, owner), intent);
	return intent;
}

export function removeCctpSponsoredAuthorizationIntent(
	env: CctpDepositEnvironment,
	owner: string,
	authNonce: string,
	options: CctpDepositTrackingStorageOptions = {},
): void {
	const nowMs = getNowMs(options.nowMs);
	const storage = getStorage(options.storage);
	const normalizedOwner = normalizeOwner(owner);
	const normalizedAuthNonce = normalizeHash(authNonce, "CCTP authorization nonce");
	const intent = readCctpSponsoredAuthorizationIntent(env, normalizedOwner, { storage, nowMs });
	if (intent === null) return;
	if (intent.authNonce !== normalizedAuthNonce) {
		throw new CctpDepositTrackingPersistenceError(
			"CCTP sponsored authorization does not match the unresolved submission.",
		);
	}
	removeTrackingRecordStorageKey(storage, getCctpSponsoredAuthorizationIntentStorageKey(env, normalizedOwner));
}

export function getCctpDepositTrackingStorageSnapshot(env: CctpDepositEnvironment, owner: string): string {
	const storage = getStorage(undefined);
	const keyPrefix = `${getCctpDepositTrackingStorageKey(env, owner)}:`;
	try {
		return getStorageKeys(storage)
			.filter((key) => key.startsWith(keyPrefix))
			.sort()
			.map((key) => `${key}=${storage.getItem(key) ?? ""}`)
			.join("\n");
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError("CCTP deposit tracking storage is unavailable.", { cause });
	}
}

export function subscribeCctpDepositTrackingRecords(
	env: CctpDepositEnvironment,
	owner: string,
	onStoreChange: () => void,
): () => void {
	if (typeof window === "undefined") return () => undefined;
	const keyPrefix = `${getCctpDepositTrackingStorageKey(env, owner)}:`;
	const handleStorage = (event: StorageEvent) => {
		if (event.key === null || event.key.startsWith(keyPrefix)) onStoreChange();
	};
	const handleLocalChange = (event: Event) => {
		const key = (event as CustomEvent<{ key?: unknown }>).detail?.key;
		if (typeof key === "string" && key.startsWith(keyPrefix)) onStoreChange();
	};

	window.addEventListener("storage", handleStorage);
	window.addEventListener(CCTP_DEPOSIT_TRACKING_CHANGE_EVENT, handleLocalChange);
	return () => {
		window.removeEventListener("storage", handleStorage);
		window.removeEventListener(CCTP_DEPOSIT_TRACKING_CHANGE_EVENT, handleLocalChange);
	};
}

export function assertCctpDepositTrackingStorageWritable(
	env: CctpDepositEnvironment,
	owner: string,
	options: Pick<CctpDepositTrackingStorageOptions, "storage"> = {},
): void {
	const storage = getStorage(options.storage);
	const probeKey = `${CCTP_DEPOSIT_TRACKING_PROBE_PREFIX}:${env.toLowerCase()}:${normalizeOwner(owner)}`;
	const probeValue = "writable";
	try {
		storage.setItem(probeKey, probeValue);
		if (storage.getItem(probeKey) !== probeValue) throw new Error("CCTP deposit tracking probe readback failed");
		storage.removeItem(probeKey);
		if (storage.getItem(probeKey) !== null) throw new Error("CCTP deposit tracking probe cleanup failed");
	} catch (cause) {
		try {
			storage.removeItem(probeKey);
		} catch {}
		throw new CctpDepositTrackingPersistenceError("CCTP deposit tracking storage is unavailable.", { cause });
	}
}

export function readCctpDepositTrackingRecords(
	env: CctpDepositEnvironment,
	owner: string,
	options: CctpDepositTrackingStorageOptions = {},
): CctpDepositTrackingRecord[] {
	const nowMs = getNowMs(options.nowMs);
	const storage = getStorage(options.storage);
	const normalizedOwner = normalizeOwner(owner);
	const keyPrefix = `${getCctpDepositTrackingStorageKey(env, normalizedOwner)}:`;
	let recordKeys: string[];
	try {
		recordKeys = getStorageKeys(storage).filter((key) => key.startsWith(keyPrefix));
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError("CCTP deposit tracking storage is unavailable.", { cause });
	}

	const records: CctpDepositTrackingRecord[] = [];
	for (const key of recordKeys) {
		try {
			const sourceHash = normalizeHash(key.slice(keyPrefix.length), "Stored CCTP source transaction hash");
			const serialized = storage.getItem(key);
			if (serialized === null) continue;
			const record = normalizeTrackingRecord(JSON.parse(serialized), env, normalizedOwner, nowMs);
			if (record.sourceHash !== sourceHash) throw new Error("CCTP tracking key and source hash mismatch");
			records.push(record);
		} catch (cause) {
			try {
				storage.removeItem(key);
				notifyTrackingChange(key);
			} catch {}
			throw new CctpDepositTrackingPersistenceError(
				"Stored CCTP deposit tracking data is invalid and cannot be trusted.",
				{ cause },
			);
		}
	}

	const activeRecords = records
		.filter((record) => nowMs - record.createdAt < CCTP_DEPOSIT_TRACKING_MAX_AGE_MS)
		.sort(compareTrackingRecords)
		.slice(0, CCTP_DEPOSIT_TRACKING_MAX_RECORDS);
	const activeHashes = new Set(activeRecords.map((record) => record.sourceHash));
	for (const record of records) {
		if (!activeHashes.has(record.sourceHash)) {
			removeTrackingRecordStorageKey(
				storage,
				getCctpDepositTrackingRecordStorageKey(env, normalizedOwner, record.sourceHash),
			);
		}
	}
	return activeRecords;
}

export function saveCctpDepositTrackingRecord(
	input: SaveCctpDepositTrackingRecordInput,
	options: CctpDepositTrackingStorageOptions = {},
): CctpDepositTrackingRecord {
	const nowMs = getNowMs(options.nowMs);
	const storage = getStorage(options.storage);
	const record = normalizeTrackingRecord(
		{
			version: CCTP_DEPOSIT_TRACKING_VERSION,
			env: input.env,
			owner: normalizeOwner(input.owner),
			sourceHash: normalizeHash(input.sourceHash, "CCTP source transaction hash"),
			amount: input.amount,
			createdAt: input.createdAt ?? nowMs,
			...(input.mode === "sponsored"
				? { mode: "sponsored", authNonce: normalizeHash(input.authNonce, "CCTP authorization nonce") }
				: { mode: "direct" }),
			status: "source-submitted",
		},
		input.env,
		normalizeOwner(input.owner),
		nowMs,
	);
	writeTrackingRecord(
		storage,
		getCctpDepositTrackingRecordStorageKey(input.env, record.owner, record.sourceHash),
		record,
	);
	readCctpDepositTrackingRecords(input.env, record.owner, { storage, nowMs });
	return record;
}

export function removeCctpDepositTrackingRecord(
	env: CctpDepositEnvironment,
	owner: string,
	sourceHash: string,
	options: CctpDepositTrackingStorageOptions = {},
): void {
	const storage = getStorage(options.storage);
	const normalizedOwner = normalizeOwner(owner);
	const normalizedSourceHash = normalizeHash(sourceHash, "CCTP source transaction hash");
	if (options.nowMs !== undefined) getNowMs(options.nowMs);
	removeTrackingRecordStorageKey(
		storage,
		getCctpDepositTrackingRecordStorageKey(env, normalizedOwner, normalizedSourceHash),
	);
}

function normalizeTrackingRecord(
	value: unknown,
	env: CctpDepositEnvironment,
	owner: `0x${string}`,
	nowMs: number,
): CctpDepositTrackingRecord {
	if (!isRecord(value)) throw new Error("Expected a CCTP deposit tracking record");
	const keys = Object.keys(value).sort();
	const isLegacyDirect =
		value.version === 1 &&
		keys.length === LEGACY_TRACKING_RECORD_KEYS.length &&
		keys.every((key, index) => key === LEGACY_TRACKING_RECORD_KEYS[index]);
	let mode: "direct" | "sponsored";
	if (isLegacyDirect) {
		mode = "direct";
	} else if (value.mode === "direct" || value.mode === "sponsored") {
		mode = value.mode;
	} else {
		throw new Error("Unexpected or unsupported CCTP tracking fields");
	}
	const expectedKeys = mode === "sponsored" ? SPONSORED_TRACKING_RECORD_KEYS : DIRECT_TRACKING_RECORD_KEYS;
	if (
		!isLegacyDirect &&
		(value.version !== CCTP_DEPOSIT_TRACKING_VERSION ||
			keys.length !== expectedKeys.length ||
			!keys.every((key, index) => key === expectedKeys[index]))
	) {
		throw new Error("Unexpected or unsupported CCTP tracking fields");
	}
	if (value.env !== env) throw new Error("CCTP tracking environment mismatch");
	if (value.owner !== owner) throw new Error("CCTP tracking owner mismatch");
	if (value.status !== "source-submitted") throw new Error("Invalid CCTP tracking status");
	if (!isPositiveDecimal(value.amount)) throw new Error("Invalid CCTP tracking amount");
	if (
		typeof value.createdAt !== "number" ||
		!Number.isSafeInteger(value.createdAt) ||
		value.createdAt <= 0 ||
		value.createdAt > nowMs + MAX_FUTURE_CLOCK_SKEW_MS
	) {
		throw new Error("Invalid CCTP tracking timestamp");
	}
	const sourceHash = normalizeHash(value.sourceHash, "Stored CCTP source transaction hash");
	if (sourceHash !== value.sourceHash) throw new Error("Stored CCTP source transaction hash must be normalized");
	const commonRecord = {
		version: CCTP_DEPOSIT_TRACKING_VERSION,
		env,
		owner,
		sourceHash,
		amount: value.amount,
		createdAt: value.createdAt,
		status: "source-submitted",
	} as const;
	if (mode === "direct") return { ...commonRecord, mode };
	const authNonce = normalizeHash(value.authNonce, "Stored CCTP authorization nonce");
	if (authNonce !== value.authNonce) throw new Error("Stored CCTP authorization nonce must be normalized");
	return { ...commonRecord, mode, authNonce };
}

function normalizeSponsoredAuthorizationIntent(
	value: unknown,
	env: CctpDepositEnvironment,
	owner: `0x${string}`,
	nowMs: number,
): CctpSponsoredAuthorizationIntent {
	if (!isRecord(value)) throw new Error("Expected a CCTP sponsored authorization intent");
	const keys = Object.keys(value).sort();
	if (
		value.version !== CCTP_SPONSORED_AUTHORIZATION_INTENT_VERSION ||
		keys.length !== SPONSORED_AUTHORIZATION_INTENT_KEYS.length ||
		!keys.every((key, index) => key === SPONSORED_AUTHORIZATION_INTENT_KEYS[index])
	) {
		throw new Error("Unexpected or unsupported CCTP sponsored authorization fields");
	}
	if (value.env !== env) throw new Error("CCTP sponsored authorization environment mismatch");
	if (value.owner !== owner) throw new Error("CCTP sponsored authorization owner mismatch");
	if (value.status !== "submission-unresolved") throw new Error("Invalid CCTP sponsored authorization status");
	if (!isPositiveDecimal(value.amount)) throw new Error("Invalid CCTP sponsored authorization amount");
	if (
		typeof value.createdAt !== "number" ||
		!Number.isSafeInteger(value.createdAt) ||
		value.createdAt <= 0 ||
		value.createdAt > nowMs + MAX_FUTURE_CLOCK_SKEW_MS
	) {
		throw new Error("Invalid CCTP sponsored authorization timestamp");
	}
	const validBefore = normalizeAuthorizationValidBefore(value.validBefore);
	const authNonce = normalizeHash(value.authNonce, "Stored CCTP authorization nonce");
	if (authNonce !== value.authNonce) throw new Error("Stored CCTP authorization nonce must be normalized");
	return {
		version: CCTP_SPONSORED_AUTHORIZATION_INTENT_VERSION,
		env,
		owner,
		authNonce,
		amount: value.amount,
		validBefore,
		createdAt: value.createdAt,
		status: "submission-unresolved",
	};
}

function normalizeAuthorizationValidBefore(value: unknown): number {
	if (typeof value === "bigint") {
		if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new Error("Invalid CCTP sponsored authorization expiry");
		}
		return Number(value);
	}
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		throw new Error("Invalid CCTP sponsored authorization expiry");
	}
	return value;
}

function writeSponsoredAuthorizationIntent(
	storage: Storage,
	key: string,
	intent: CctpSponsoredAuthorizationIntent,
): void {
	try {
		const serialized = JSON.stringify(intent);
		storage.setItem(key, serialized);
		if (storage.getItem(key) !== serialized) throw new Error("CCTP sponsored authorization readback failed");
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError("Unable to persist CCTP sponsored authorization data.", {
			cause,
		});
	}
	notifyTrackingChange(key);
}

function writeTrackingRecord(storage: Storage, key: string, record: CctpDepositTrackingRecord): void {
	try {
		const serialized = JSON.stringify(record);
		storage.setItem(key, serialized);
		if (storage.getItem(key) !== serialized) throw new Error("CCTP deposit tracking readback failed");
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError("Unable to persist CCTP deposit tracking data.", { cause });
	}
	notifyTrackingChange(key);
}

function removeTrackingRecordStorageKey(storage: Storage, key: string): void {
	try {
		storage.removeItem(key);
		if (storage.getItem(key) !== null) throw new Error("CCTP deposit tracking removal readback failed");
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError("Unable to persist CCTP deposit tracking data.", { cause });
	}
	notifyTrackingChange(key);
}

function notifyTrackingChange(key: string): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(CCTP_DEPOSIT_TRACKING_CHANGE_EVENT, { detail: { key } }));
}

function getStorageKeys(storage: Storage): string[] {
	const keys: string[] = [];
	for (let index = 0; index < storage.length; index += 1) {
		const key = storage.key(index);
		if (key !== null) keys.push(key);
	}
	return keys;
}

function compareTrackingRecords(left: CctpDepositTrackingRecord, right: CctpDepositTrackingRecord): number {
	if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
	return left.sourceHash.localeCompare(right.sourceHash);
}

function getStorage(storage: Storage | undefined): Storage {
	if (storage) return storage;
	try {
		if (typeof window === "undefined") throw new Error("Window is unavailable");
		return window.localStorage;
	} catch (cause) {
		throw new CctpDepositTrackingPersistenceError("CCTP deposit tracking storage is unavailable.", { cause });
	}
}

function getNowMs(nowMs: number | undefined): number {
	const value = nowMs ?? Date.now();
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new CctpDepositTrackingPersistenceError("CCTP deposit tracking time is invalid.");
	}
	return value;
}

function normalizeOwner(owner: string): `0x${string}` {
	if (!isAddress(owner)) throw new CctpDepositTrackingPersistenceError("CCTP deposit tracking owner is invalid.");
	return owner.toLowerCase() as `0x${string}`;
}

function normalizeHash(value: unknown, label: string): Hash {
	if (typeof value !== "string" || !BYTES_32_PATTERN.test(value)) {
		throw new CircleCctpDepositTrackingError(`${label} must be a 32-byte hexadecimal value.`);
	}
	return value.toLowerCase() as Hash;
}

function isPositiveDecimal(value: unknown): value is string {
	return (
		typeof value === "string" && value.length <= 128 && POSITIVE_DECIMAL_PATTERN.test(value) && /[1-9]/.test(value)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
