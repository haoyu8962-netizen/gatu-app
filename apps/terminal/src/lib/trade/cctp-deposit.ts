import Big from "big.js";
import type { Address, Hex, TransactionReceipt } from "viem";
import {
	concatHex,
	decodeEventLog,
	decodeFunctionData,
	isAddress,
	isAddressEqual,
	isHex,
	numberToHex,
	padHex,
	size,
	stringToHex,
} from "viem";
import {
	CCTP_AUTHORIZATION_WINDOW_SECONDS,
	CCTP_FAST_FINALITY_THRESHOLD,
	type CctpDepositConfig,
} from "@/config/cctp-deposit";

export const CCTP_EXTENSION_ABI = [
	{
		type: "function",
		name: "batchDepositForBurnWithAuth",
		stateMutability: "nonpayable",
		inputs: [
			{
				name: "_receiveWithAuthorizationData",
				type: "tuple",
				components: [
					{ name: "amount", type: "uint256" },
					{ name: "authValidAfter", type: "uint256" },
					{ name: "authValidBefore", type: "uint256" },
					{ name: "authNonce", type: "bytes32" },
					{ name: "v", type: "uint8" },
					{ name: "r", type: "bytes32" },
					{ name: "s", type: "bytes32" },
				],
			},
			{
				name: "_depositForBurnData",
				type: "tuple",
				components: [
					{ name: "amount", type: "uint256" },
					{ name: "destinationDomain", type: "uint32" },
					{ name: "mintRecipient", type: "bytes32" },
					{ name: "destinationCaller", type: "bytes32" },
					{ name: "maxFee", type: "uint256" },
					{ name: "minFinalityThreshold", type: "uint32" },
					{ name: "hookData", type: "bytes" },
				],
			},
		],
		outputs: [],
	},
	{
		type: "event",
		name: "BatchDepositForBurn",
		anonymous: false,
		inputs: [
			{ name: "batchCount", type: "uint256", indexed: false },
			{ name: "batchSize", type: "uint256", indexed: false },
			{ name: "depositor", type: "address", indexed: false },
			{ name: "mintRecipient", type: "bytes32", indexed: false },
			{ name: "destinationDomain", type: "uint32", indexed: false },
		],
	},
] as const;

export interface CctpDepositFeeQuote {
	finalityThreshold: typeof CCTP_FAST_FINALITY_THRESHOLD;
	minimumFeeBps: string;
	forwardFeeRaw: {
		low: bigint;
		med: bigint;
		high: bigint;
	};
}

export interface CctpDepositFeeCalculation {
	protocolFeeRaw: bigint;
	bufferedProtocolFeeRaw: bigint;
	forwardFeeRaw: bigint;
	maxFeeRaw: bigint;
	netAmountRaw: bigint;
}

export interface CctpDepositParameters {
	authorization: {
		amount: bigint;
		authValidAfter: bigint;
		authValidBefore: bigint;
		authNonce: Hex;
	};
	depositForBurn: {
		amount: bigint;
		destinationDomain: number;
		mintRecipient: Hex;
		destinationCaller: Hex;
		maxFee: bigint;
		minFinalityThreshold: typeof CCTP_FAST_FINALITY_THRESHOLD;
		hookData: Hex;
	};
	typedData: ReturnType<typeof buildCctpReceiveWithAuthorizationTypedData>;
	fee: CctpDepositFeeCalculation;
}

interface FeeRecord {
	finalityThreshold: number;
	minimumFee: number;
	forwardFee: {
		low: number;
		med: number;
		high: number;
	};
}

export interface FetchCctpDepositFeesOptions {
	signal?: AbortSignal;
	fetcher?: typeof fetch;
}

export type FetchCctpFastAllowanceOptions = FetchCctpDepositFeesOptions;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type HyperCoreRecipientState = "account" | "agent" | "missing";

export function getHyperCoreRecipientState(value: unknown): HyperCoreRecipientState {
	if (!isRecord(value) || typeof value.role !== "string") {
		throw new Error("Hyperliquid returned an invalid user role");
	}
	if (value.role === "missing") return "missing";
	if (value.role === "user" || value.role === "vault") return "account";
	if (value.role !== "agent" && value.role !== "subAccount") {
		throw new Error("Hyperliquid returned an invalid user role");
	}
	if (!isRecord(value.data)) throw new Error("Hyperliquid returned an invalid user role");
	const owner = value.role === "agent" ? value.data.user : value.data.master;
	if (typeof owner !== "string" || !isAddress(owner, { strict: true })) {
		throw new Error("Hyperliquid returned an invalid user role");
	}
	return value.role === "agent" ? "agent" : "account";
}

export function hasHyperCoreMainnetState(value: unknown): boolean {
	return getHyperCoreRecipientState(value) === "account";
}

function isNonNegativeSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizeFeeRecord(value: unknown): FeeRecord {
	if (!isRecord(value)) throw new Error("Circle returned an invalid CCTP fee quote");
	const forwardFee = value.forwardFee;
	if (
		!Number.isSafeInteger(value.finalityThreshold) ||
		Number(value.finalityThreshold) < 0 ||
		typeof value.minimumFee !== "number" ||
		!Number.isFinite(value.minimumFee) ||
		value.minimumFee < 0 ||
		!isRecord(forwardFee) ||
		!isNonNegativeSafeInteger(forwardFee.low) ||
		!isNonNegativeSafeInteger(forwardFee.med) ||
		!isNonNegativeSafeInteger(forwardFee.high)
	) {
		throw new Error("Circle returned an invalid CCTP fee quote");
	}

	return {
		finalityThreshold: Number(value.finalityThreshold),
		minimumFee: value.minimumFee,
		forwardFee: {
			low: forwardFee.low,
			med: forwardFee.med,
			high: forwardFee.high,
		},
	};
}

function assertAddress(address: string, label: string): asserts address is Address {
	if (!isAddress(address, { strict: true })) throw new Error(`${label} is not a valid EVM address`);
}

function assertBytes32(value: Hex, label: string) {
	if (!isHex(value, { strict: true }) || size(value) !== 32) throw new Error(`${label} must be exactly 32 bytes`);
}

function toCeilingBigInt(value: Big): bigint {
	return BigInt(value.round(0, Big.roundUp).toFixed(0));
}

export function normalizeCctpDepositFees(payload: unknown): CctpDepositFeeQuote {
	if (!Array.isArray(payload) || payload.length === 0) {
		throw new Error("Circle returned an invalid CCTP fee quote");
	}

	const quotes = payload.map(normalizeFeeRecord);
	const fastQuotes = quotes.filter(({ finalityThreshold }) => finalityThreshold === CCTP_FAST_FINALITY_THRESHOLD);
	if (fastQuotes.length !== 1) throw new Error("Circle did not return one unambiguous Fast Transfer fee quote");
	const fastQuote = fastQuotes[0];

	return {
		finalityThreshold: CCTP_FAST_FINALITY_THRESHOLD,
		minimumFeeBps: fastQuote.minimumFee.toString(),
		forwardFeeRaw: {
			low: BigInt(fastQuote.forwardFee.low),
			med: BigInt(fastQuote.forwardFee.med),
			high: BigInt(fastQuote.forwardFee.high),
		},
	};
}

export async function fetchCctpDepositFees(
	config: CctpDepositConfig,
	options: FetchCctpDepositFeesOptions = {},
): Promise<CctpDepositFeeQuote> {
	const fetcher = options.fetcher ?? fetch;
	const response = await fetcher(config.feeApiUrl, {
		method: "GET",
		headers: { accept: "application/json" },
		cache: "no-store",
		signal: options.signal,
	});
	if (!response.ok) throw new Error(`Circle CCTP fee request failed with status ${response.status}`);
	return normalizeCctpDepositFees(await response.json());
}

export function normalizeCctpFastAllowance(payload: unknown): bigint {
	if (!isRecord(payload) || typeof payload.allowance !== "number" || !Number.isFinite(payload.allowance)) {
		throw new Error("Circle returned an invalid CCTP Fast Transfer allowance");
	}

	let allowance: Big;
	try {
		allowance = new Big(payload.allowance.toString());
	} catch {
		throw new Error("Circle returned an invalid CCTP Fast Transfer allowance");
	}
	if (allowance.lt(0)) throw new Error("Circle returned an invalid CCTP Fast Transfer allowance");
	return BigInt(allowance.times(1_000_000).round(0, Big.roundDown).toFixed(0));
}

export async function fetchCctpFastAllowance(
	config: CctpDepositConfig,
	options: FetchCctpFastAllowanceOptions = {},
): Promise<bigint> {
	const fetcher = options.fetcher ?? fetch;
	const response = await fetcher(config.fastAllowanceApiUrl, {
		method: "GET",
		headers: { accept: "application/json" },
		cache: "no-store",
		signal: options.signal,
	});
	if (!response.ok)
		throw new Error(`Circle CCTP Fast Transfer allowance request failed with status ${response.status}`);
	return normalizeCctpFastAllowance(await response.json());
}

export function calculateCctpDepositFee(amountRaw: bigint, quote: CctpDepositFeeQuote): CctpDepositFeeCalculation {
	if (amountRaw <= 0n) throw new Error("CCTP deposit amount must be positive");
	if (quote.finalityThreshold !== CCTP_FAST_FINALITY_THRESHOLD) {
		throw new Error("CCTP deposit requires a Fast Transfer fee quote");
	}

	let minimumFeeBps: Big;
	try {
		minimumFeeBps = new Big(quote.minimumFeeBps);
	} catch {
		throw new Error("CCTP minimum fee is invalid");
	}
	if (minimumFeeBps.lt(0) || quote.forwardFeeRaw.med < 0n) throw new Error("CCTP fee cannot be negative");

	const protocolFeeRaw = toCeilingBigInt(new Big(amountRaw.toString()).times(minimumFeeBps).div(10_000));
	const bufferedProtocolFeeRaw = toCeilingBigInt(new Big(protocolFeeRaw.toString()).times(120).div(100));
	const maxFeeRaw = bufferedProtocolFeeRaw + quote.forwardFeeRaw.med;
	if (maxFeeRaw >= amountRaw) throw new Error("CCTP fees must be lower than the deposit amount");

	return {
		protocolFeeRaw,
		bufferedProtocolFeeRaw,
		forwardFeeRaw: quote.forwardFeeRaw.med,
		maxFeeRaw,
		netAmountRaw: amountRaw - maxFeeRaw,
	};
}

export function addressToBytes32(address: Address): Hex {
	assertAddress(address, "CCTP address");
	return padHex(address, { size: 32 });
}

export function encodeCctpForwardHookData(recipient: Address): Hex {
	assertAddress(recipient, "HyperCore recipient");
	return concatHex([
		stringToHex("cctp-forward", { size: 24 }),
		numberToHex(0, { size: 4 }),
		numberToHex(24, { size: 4 }),
		recipient.toLowerCase() as Address,
		numberToHex(0, { size: 4 }),
	]);
}

export function buildCctpReceiveWithAuthorizationTypedData({
	amountRaw,
	config,
	nonce,
	user,
	validAfter,
	validBefore,
}: {
	amountRaw: bigint;
	config: CctpDepositConfig;
	nonce: Hex;
	user: Address;
	validAfter: bigint;
	validBefore: bigint;
}) {
	assertAddress(user, "CCTP depositor");
	assertBytes32(nonce, "CCTP authorization nonce");
	if (amountRaw <= 0n) throw new Error("CCTP deposit amount must be positive");
	if (validAfter < 0n || validBefore <= validAfter) throw new Error("CCTP authorization validity window is invalid");

	return {
		domain: {
			name: config.usdcAuthorizationName,
			version: config.usdcAuthorizationVersion,
			chainId: config.chainId,
			verifyingContract: config.usdc,
		},
		types: {
			ReceiveWithAuthorization: [
				{ name: "from", type: "address" },
				{ name: "to", type: "address" },
				{ name: "value", type: "uint256" },
				{ name: "validAfter", type: "uint256" },
				{ name: "validBefore", type: "uint256" },
				{ name: "nonce", type: "bytes32" },
			],
		},
		primaryType: "ReceiveWithAuthorization" as const,
		message: {
			from: user,
			to: config.cctpExtension,
			value: amountRaw,
			validAfter,
			validBefore,
			nonce,
		},
	} as const;
}

export function createCctpDepositParameters({
	amountRaw,
	config,
	feeQuote,
	nonce,
	nowSeconds,
	user,
}: {
	amountRaw: bigint;
	config: CctpDepositConfig;
	feeQuote: CctpDepositFeeQuote;
	nonce: Hex;
	nowSeconds: number | bigint;
	user: Address;
}): CctpDepositParameters {
	if (typeof nowSeconds === "number" && (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0)) {
		throw new Error("CCTP authorization timestamp is invalid");
	}
	const now = typeof nowSeconds === "bigint" ? nowSeconds : BigInt(nowSeconds);
	const validityWindow = BigInt(CCTP_AUTHORIZATION_WINDOW_SECONDS);
	if (now < validityWindow) throw new Error("CCTP authorization timestamp is invalid");
	const authValidAfter = now - validityWindow;
	const authValidBefore = now + validityWindow;
	const fee = calculateCctpDepositFee(amountRaw, feeQuote);
	const forwarder = addressToBytes32(config.cctpForwarder);
	const typedData = buildCctpReceiveWithAuthorizationTypedData({
		amountRaw,
		config,
		nonce,
		user,
		validAfter: authValidAfter,
		validBefore: authValidBefore,
	});

	return {
		authorization: {
			amount: amountRaw,
			authValidAfter,
			authValidBefore,
			authNonce: nonce,
		},
		depositForBurn: {
			amount: amountRaw,
			destinationDomain: config.destinationDomain,
			mintRecipient: forwarder,
			destinationCaller: forwarder,
			maxFee: fee.maxFeeRaw,
			minFinalityThreshold: CCTP_FAST_FINALITY_THRESHOLD,
			hookData: encodeCctpForwardHookData(user),
		},
		typedData,
		fee,
	};
}

export function splitCctpAuthorizationSignature(signature: Hex) {
	if (!isHex(signature, { strict: true }) || size(signature) !== 65) {
		throw new Error("CCTP authorization signature must be exactly 65 bytes");
	}
	const normalized = signature.slice(2);
	let v = Number.parseInt(normalized.slice(128, 130), 16);
	if (v < 27) v += 27;
	if (v !== 27 && v !== 28) throw new Error("CCTP authorization signature recovery id is invalid");

	return {
		v,
		r: `0x${normalized.slice(0, 64)}` as Hex,
		s: `0x${normalized.slice(64, 128)}` as Hex,
	};
}

export function buildCctpDepositContractArgs(parameters: CctpDepositParameters, signature: Hex) {
	const { r, s, v } = splitCctpAuthorizationSignature(signature);
	return [
		{
			...parameters.authorization,
			v,
			r,
			s,
		},
		parameters.depositForBurn,
	] as const;
}

export function assertCctpDepositReceipt({
	amountRaw,
	config,
	receipt,
	user,
}: {
	amountRaw: bigint;
	config: CctpDepositConfig;
	receipt: TransactionReceipt;
	user: Address;
}) {
	assertAddress(user, "CCTP depositor");
	if (amountRaw <= 0n) throw new Error("CCTP deposit amount must be positive");
	if (receipt.status !== "success") throw new Error("CCTP deposit transaction reverted on Arbitrum");

	const events = receipt.logs.flatMap((log) => {
		if (!isAddressEqual(log.address, config.cctpExtension)) return [];
		try {
			const event = decodeEventLog({ abi: CCTP_EXTENSION_ABI, data: log.data, topics: log.topics });
			return event.eventName === "BatchDepositForBurn" ? [event.args] : [];
		} catch {
			return [];
		}
	});

	if (events.length !== 1) throw new Error("CCTP deposit receipt is missing one unambiguous burn event");
	const event = events[0];
	const expectedForwarder = addressToBytes32(config.cctpForwarder);
	if (
		event.batchCount !== 1n ||
		event.batchSize !== amountRaw ||
		!isAddressEqual(event.depositor, user) ||
		event.mintRecipient.toLowerCase() !== expectedForwarder.toLowerCase() ||
		event.destinationDomain !== config.destinationDomain
	) {
		throw new Error("CCTP deposit receipt does not match the requested HyperCore deposit");
	}
}

export function assertCctpDepositSourceTransaction({
	amountRaw,
	config,
	input,
	from,
	to,
	user,
}: {
	amountRaw: bigint;
	config: CctpDepositConfig;
	input: Hex;
	from: Address;
	to: Address;
	user: Address;
}) {
	assertAddress(user, "CCTP depositor");
	assertAddress(from, "CCTP source transaction sender");
	assertAddress(to, "CCTP source transaction recipient");
	if (amountRaw <= 0n) throw new Error("CCTP deposit amount must be positive");
	if (!isAddressEqual(from, user) || !isAddressEqual(to, config.cctpExtension)) {
		throw new Error("CCTP source transaction does not target the requested depositor and official extension");
	}

	const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_ABI, data: input });
	if (decoded.functionName !== "batchDepositForBurnWithAuth") {
		throw new Error("CCTP source transaction does not call the official deposit function");
	}
	const [authorization, depositForBurn] = decoded.args;
	const expectedForwarder = addressToBytes32(config.cctpForwarder);
	if (
		authorization.amount !== amountRaw ||
		depositForBurn.amount !== amountRaw ||
		depositForBurn.destinationDomain !== config.destinationDomain ||
		depositForBurn.mintRecipient.toLowerCase() !== expectedForwarder.toLowerCase() ||
		depositForBurn.destinationCaller.toLowerCase() !== expectedForwarder.toLowerCase() ||
		depositForBurn.maxFee >= amountRaw ||
		depositForBurn.minFinalityThreshold !== CCTP_FAST_FINALITY_THRESHOLD ||
		depositForBurn.hookData.toLowerCase() !== encodeCctpForwardHookData(user).toLowerCase()
	) {
		throw new Error("CCTP source transaction does not match the requested HyperCore deposit");
	}
}
