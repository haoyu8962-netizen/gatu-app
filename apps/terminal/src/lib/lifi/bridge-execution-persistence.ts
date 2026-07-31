import type { RouteExtended } from "@lifi/sdk";
import { isAddress } from "viem";
import { HYPERCORE_CHAIN_ID, HYPERCORE_USDC_ADDRESS } from "@/config/contracts";

export const BRIDGE_EXECUTION_STORAGE_KEY = "gatu:lifi-bridge-execution:v1";
export const BRIDGE_EXECUTION_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
export const BRIDGE_EXECUTION_MAX_SERIALIZED_CHARACTERS = 256 * 1024;

const LEGACY_RECOVERY_VERSION = 1;
const RECOVERY_VERSION = 2;
const MAX_ROUTE_STEPS = 1;
const MAX_PROCESSES = 32;
const MAX_ROUTE_NODES = 10_000;
const MAX_ROUTE_DEPTH = 20;
const MAX_STRING_LENGTH = 8_192;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EXECUTION_STATUSES = new Set(["ACTION_REQUIRED", "PENDING", "FAILED", "DONE"]);
const PROCESS_STATUSES = new Set([
	"STARTED",
	"ACTION_REQUIRED",
	"MESSAGE_REQUIRED",
	"RESET_REQUIRED",
	"PENDING",
	"FAILED",
	"DONE",
	"CANCELLED",
]);
const PROCESS_TYPES = new Set(["TOKEN_ALLOWANCE", "PERMIT", "SWAP", "CROSS_CHAIN", "RECEIVING_CHAIN"]);
const FORBIDDEN_ROUTE_KEYS = new Set([
	"accesstoken",
	"apikey",
	"authorization",
	"calldata",
	"credential",
	"data",
	"error",
	"message",
	"mnemonic",
	"password",
	"privatekey",
	"rawtransaction",
	"secret",
	"seed",
	"signature",
	"signatures",
	"signedtypeddata",
	"tocontractcalldata",
	"transactionrequest",
	"txhex",
	"typeddata",
]);
const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface BridgeRouteIdentity {
	routeId: string;
	stepId: string;
	tool: string;
	sourceAddress: `0x${string}`;
	sourceChainId: number;
	sourceTokenAddress: `0x${string}`;
	sourceAmount: string;
	destinationAddress: `0x${string}`;
	destinationChainId: number;
	destinationTokenAddress: `0x${string}`;
}

export interface PersistedBridgeExecution {
	route: RouteExtended;
	expectedToAmount: string;
	startTime: number;
	identity: BridgeRouteIdentity;
}

interface PersistedBridgeEnvelope {
	version: number;
	savedAt: number;
	sourceAddress: string;
	sourceChainId: number;
	expectedToAmount: string;
	startTime: number;
	route: unknown;
	routeIdentity: BridgeRouteIdentity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSameAddress(left: string | undefined, right: string | undefined): boolean {
	return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

function isSafeChainId(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) > 0;
}

function isBoundedString(value: unknown, maxLength = MAX_STRING_LENGTH): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isPositiveIntegerString(value: unknown): value is string {
	return typeof value === "string" && /^[0-9]{1,128}$/.test(value) && BigInt(value) > 0n;
}

function getTokenChainId(token: unknown): number | null {
	if (!isRecord(token) || !isSafeChainId(token.chainId)) return null;
	return token.chainId;
}

function getTokenAddress(token: unknown): string | null {
	if (!isRecord(token) || !isBoundedString(token.address, 128) || !isAddress(token.address)) return null;
	return token.address;
}

function getStepAction(step: unknown): Record<string, unknown> | null {
	if (!isRecord(step) || !isRecord(step.action)) return null;
	return step.action;
}

export function getBridgeRouteIdentity(route: unknown): BridgeRouteIdentity | null {
	if (!isRecord(route) || !isBoundedString(route.id, MAX_IDENTIFIER_LENGTH)) return null;
	if (!Array.isArray(route.steps) || route.steps.length !== MAX_ROUTE_STEPS) return null;
	if (!isAddress(String(route.fromAddress ?? "")) || !isAddress(String(route.toAddress ?? ""))) return null;
	if (!hasSameAddress(String(route.fromAddress), String(route.toAddress))) return null;
	if (!isSafeChainId(route.fromChainId) || route.fromChainId === HYPERCORE_CHAIN_ID) return null;
	if (route.toChainId !== HYPERCORE_CHAIN_ID) return null;
	const sourceTokenAddress = getTokenAddress(route.fromToken);
	const destinationTokenAddress = getTokenAddress(route.toToken);
	if (!sourceTokenAddress || !destinationTokenAddress) return null;
	if (getTokenChainId(route.fromToken) !== route.fromChainId) return null;
	if (getTokenChainId(route.toToken) !== HYPERCORE_CHAIN_ID) return null;
	if (!hasSameAddress(destinationTokenAddress, HYPERCORE_USDC_ADDRESS)) return null;

	const firstStep = route.steps[0];
	const lastStep = route.steps.at(-1);
	const firstAction = getStepAction(firstStep);
	const lastAction = getStepAction(lastStep);
	if (!isRecord(firstStep) || !isBoundedString(firstStep.id, MAX_IDENTIFIER_LENGTH) || firstStep.id !== route.id) {
		return null;
	}
	if (
		firstStep.type !== "lifi" ||
		!isBoundedString(firstStep.tool, MAX_IDENTIFIER_LENGTH) ||
		!firstAction ||
		!lastAction
	) {
		return null;
	}
	if (!hasSameAddress(String(firstAction.fromAddress ?? ""), String(route.fromAddress))) return null;
	if (!hasSameAddress(String(lastAction.toAddress ?? ""), String(route.toAddress))) return null;
	if (firstAction.fromChainId !== route.fromChainId || lastAction.toChainId !== HYPERCORE_CHAIN_ID) return null;
	if (getTokenChainId(firstAction.fromToken) !== route.fromChainId) return null;
	if (getTokenChainId(lastAction.toToken) !== HYPERCORE_CHAIN_ID) return null;
	if (!hasSameAddress(getTokenAddress(firstAction.fromToken) ?? undefined, sourceTokenAddress)) return null;
	if (!hasSameAddress(getTokenAddress(lastAction.toToken) ?? undefined, destinationTokenAddress)) return null;
	if (!hasSameAddress(destinationTokenAddress, HYPERCORE_USDC_ADDRESS)) return null;
	if (
		!isPositiveIntegerString(route.fromAmount) ||
		!isPositiveIntegerString(firstAction.fromAmount) ||
		route.fromAmount !== firstAction.fromAmount ||
		!isPositiveIntegerString(route.toAmount) ||
		!isPositiveIntegerString(route.toAmountMin)
	) {
		return null;
	}

	return {
		routeId: route.id,
		stepId: firstStep.id,
		tool: firstStep.tool,
		sourceAddress: route.fromAddress as `0x${string}`,
		sourceChainId: route.fromChainId,
		sourceTokenAddress: sourceTokenAddress as `0x${string}`,
		sourceAmount: route.fromAmount,
		destinationAddress: route.toAddress as `0x${string}`,
		destinationChainId: route.toChainId,
		destinationTokenAddress: destinationTokenAddress as `0x${string}`,
	};
}

export function hasSameBridgeRouteIdentity(
	left: BridgeRouteIdentity | null | undefined,
	right: BridgeRouteIdentity | null | undefined,
): boolean {
	return (
		!!left &&
		!!right &&
		left.routeId === right.routeId &&
		left.stepId === right.stepId &&
		left.tool === right.tool &&
		hasSameAddress(left.sourceAddress, right.sourceAddress) &&
		left.sourceChainId === right.sourceChainId &&
		hasSameAddress(left.sourceTokenAddress, right.sourceTokenAddress) &&
		left.sourceAmount === right.sourceAmount &&
		hasSameAddress(left.destinationAddress, right.destinationAddress) &&
		left.destinationChainId === right.destinationChainId &&
		hasSameAddress(left.destinationTokenAddress, right.destinationTokenAddress)
	);
}

function parseStoredBridgeRouteIdentity(value: unknown): BridgeRouteIdentity | null {
	if (!isRecord(value)) return null;
	const expectedKeys = [
		"destinationAddress",
		"destinationChainId",
		"destinationTokenAddress",
		"routeId",
		"sourceAddress",
		"sourceAmount",
		"sourceChainId",
		"sourceTokenAddress",
		"stepId",
		"tool",
	];
	const keys = Object.keys(value).sort();
	if (keys.length !== expectedKeys.length || !keys.every((key, index) => key === expectedKeys[index])) return null;
	if (
		!isBoundedString(value.routeId, MAX_IDENTIFIER_LENGTH) ||
		!isBoundedString(value.stepId, MAX_IDENTIFIER_LENGTH) ||
		!isBoundedString(value.tool, MAX_IDENTIFIER_LENGTH) ||
		!isAddress(String(value.sourceAddress ?? "")) ||
		!isSafeChainId(value.sourceChainId) ||
		!isAddress(String(value.sourceTokenAddress ?? "")) ||
		!isPositiveIntegerString(value.sourceAmount) ||
		!isAddress(String(value.destinationAddress ?? "")) ||
		!isSafeChainId(value.destinationChainId) ||
		!isAddress(String(value.destinationTokenAddress ?? ""))
	) {
		return null;
	}
	return value as unknown as BridgeRouteIdentity;
}

function isCommittedProcessIdentifier(value: unknown): boolean {
	return (
		typeof value === "string" &&
		value.length >= 3 &&
		value.length <= MAX_IDENTIFIER_LENGTH &&
		/^0x[0-9a-f]+$/i.test(value)
	);
}

export function hasCommittedBridgeFunds(route: unknown): route is RouteExtended {
	const identity = getBridgeRouteIdentity(route);
	if (!identity || !isRecord(route) || !Array.isArray(route.steps)) return false;

	const step = route.steps[0];
	if (!isRecord(step) || !isRecord(step.execution)) return false;
	if (!EXECUTION_STATUSES.has(String(step.execution.status))) return false;
	if (!Number.isSafeInteger(step.execution.startedAt) || Number(step.execution.startedAt) <= 0) return false;
	if (!Array.isArray(step.execution.process) || step.execution.process.length === 0) return false;
	if (step.execution.process.length > MAX_PROCESSES) return false;

	let hasCommittedCrossChainProcess = false;
	const processTypes = new Set<string>();
	for (const process of step.execution.process) {
		if (!isRecord(process) || !PROCESS_STATUSES.has(String(process.status))) return false;
		if (!PROCESS_TYPES.has(String(process.type)) || !isSafeChainId(process.chainId)) return false;
		if (!Number.isSafeInteger(process.startedAt) || Number(process.startedAt) <= 0) return false;
		if (processTypes.has(String(process.type))) return false;
		processTypes.add(String(process.type));
		if (process.type === "CROSS_CHAIN") {
			if (process.chainId !== identity.sourceChainId) return false;
			if (isCommittedProcessIdentifier(process.txHash) || isCommittedProcessIdentifier(process.taskId)) {
				hasCommittedCrossChainProcess = true;
			}
		}
	}

	return hasCommittedCrossChainProcess;
}

function hasOnlySafeRouteValues(value: unknown): boolean {
	const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
	let visited = 0;

	while (pending.length > 0) {
		const current = pending.pop();
		if (!current) break;
		visited += 1;
		if (visited > MAX_ROUTE_NODES || current.depth > MAX_ROUTE_DEPTH) return false;

		if (typeof current.value === "string") {
			if (current.value.length > MAX_STRING_LENGTH) return false;
			continue;
		}
		if (
			current.value === null ||
			typeof current.value === "boolean" ||
			(typeof current.value === "number" && Number.isFinite(current.value))
		) {
			continue;
		}
		if (Array.isArray(current.value)) {
			for (const item of current.value) pending.push({ value: item, depth: current.depth + 1 });
			continue;
		}
		if (!isRecord(current.value)) return false;

		for (const [key, child] of Object.entries(current.value)) {
			const normalizedKey = key.replaceAll("_", "").toLowerCase();
			if (DANGEROUS_OBJECT_KEYS.has(key) || FORBIDDEN_ROUTE_KEYS.has(normalizedKey)) return false;
			pending.push({ value: child, depth: current.depth + 1 });
		}
	}

	return true;
}

function sanitizeRoute(route: RouteExtended): unknown | null {
	let serialized: string;
	try {
		serialized = JSON.stringify(route, (key, value) => {
			const normalizedKey = key.replaceAll("_", "").toLowerCase();
			if (DANGEROUS_OBJECT_KEYS.has(key) || FORBIDDEN_ROUTE_KEYS.has(normalizedKey)) return undefined;
			if (typeof value === "bigint") return value.toString();
			return value;
		});
	} catch {
		return null;
	}
	if (!serialized || serialized.length > BRIDGE_EXECUTION_MAX_SERIALIZED_CHARACTERS) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		return null;
	}
	if (!hasOnlySafeRouteValues(parsed) || !getBridgeRouteIdentity(parsed)) return null;
	return parsed;
}

function sanitizeCommittedRoute(route: RouteExtended): RouteExtended | null {
	const sanitized = sanitizeRoute(route);
	if (!hasCommittedBridgeFunds(sanitized)) return null;
	return sanitized;
}

export function prepareCommittedBridgeRouteForTracking(route: RouteExtended): RouteExtended | null {
	const sanitized = sanitizeCommittedRoute(route);
	const step = sanitized?.steps[0];
	if (!step?.execution) return null;

	const committedProcess = step.execution.process.find(
		(process) =>
			process.type === "CROSS_CHAIN" &&
			(isCommittedProcessIdentifier(process.txHash) || isCommittedProcessIdentifier(process.taskId)),
	);
	if (!committedProcess) return null;

	if (committedProcess.status === "FAILED") {
		committedProcess.status = "PENDING";
		committedProcess.doneAt = undefined;
	}
	if (step.execution.status === "FAILED") {
		step.execution.status = "PENDING";
		step.execution.doneAt = undefined;
	}

	return sanitized;
}

export function isBridgeRouteRecoveryCompatible(route: RouteExtended): boolean {
	return sanitizeRoute(route) !== null;
}

function getSessionStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function hasExactEnvelopeKeys(value: Record<string, unknown>): boolean {
	const expectedKeys = [
		"expectedToAmount",
		"route",
		...(value.version === RECOVERY_VERSION ? ["routeIdentity"] : []),
		"savedAt",
		"sourceAddress",
		"sourceChainId",
		"startTime",
		"version",
	];
	const keys = Object.keys(value).sort();
	return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function parseEnvelope(serialized: string, now: number): PersistedBridgeEnvelope | null {
	if (!serialized || serialized.length > BRIDGE_EXECUTION_MAX_SERIALIZED_CHARACTERS) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || !hasExactEnvelopeKeys(parsed)) return null;
	const routeIdentity = getBridgeRouteIdentity(parsed.route);
	const persistedIdentity =
		parsed.version === RECOVERY_VERSION
			? parseStoredBridgeRouteIdentity(parsed.routeIdentity)
			: parsed.version === LEGACY_RECOVERY_VERSION
				? routeIdentity
				: null;
	if (
		!routeIdentity ||
		!persistedIdentity ||
		!hasSameBridgeRouteIdentity(routeIdentity, persistedIdentity) ||
		!Number.isSafeInteger(parsed.savedAt) ||
		!Number.isSafeInteger(parsed.startTime) ||
		Number(parsed.savedAt) <= 0 ||
		Number(parsed.startTime) <= 0 ||
		Number(parsed.savedAt) > now + MAX_FUTURE_CLOCK_SKEW_MS ||
		now - Number(parsed.savedAt) > BRIDGE_EXECUTION_RECOVERY_TTL_MS ||
		Number(parsed.startTime) > now + MAX_FUTURE_CLOCK_SKEW_MS ||
		Number(parsed.startTime) > Number(parsed.savedAt) ||
		!isAddress(String(parsed.sourceAddress ?? "")) ||
		!isSafeChainId(parsed.sourceChainId) ||
		!isPositiveIntegerString(parsed.expectedToAmount) ||
		!hasOnlySafeRouteValues(parsed.route) ||
		!hasCommittedBridgeFunds(parsed.route)
	) {
		return null;
	}
	return { ...parsed, routeIdentity: persistedIdentity } as unknown as PersistedBridgeEnvelope;
}

export function isBridgeRecoveryStorageAvailable(storage: Storage | null = getSessionStorage()): boolean {
	if (!storage) return false;
	const probeKey = `${BRIDGE_EXECUTION_STORAGE_KEY}:probe`;
	try {
		storage.setItem(probeKey, "1");
		storage.removeItem(probeKey);
		return true;
	} catch {
		return false;
	}
}

export function persistCommittedBridgeExecution(
	{
		route,
		expectedToAmount,
		startTime,
	}: {
		route: RouteExtended;
		expectedToAmount: string;
		startTime: number;
	},
	storage: Storage | null = getSessionStorage(),
	now = Date.now(),
): boolean {
	if (
		!storage ||
		!isPositiveIntegerString(expectedToAmount) ||
		!Number.isSafeInteger(startTime) ||
		startTime <= 0 ||
		startTime > now
	) {
		return false;
	}
	const identity = getBridgeRouteIdentity(route);
	const sanitizedRoute = sanitizeCommittedRoute(route);
	if (!identity || !sanitizedRoute) return false;
	if (expectedToAmount !== sanitizedRoute.toAmount) return false;

	const envelope: PersistedBridgeEnvelope = {
		version: RECOVERY_VERSION,
		savedAt: now,
		sourceAddress: identity.sourceAddress,
		sourceChainId: identity.sourceChainId,
		expectedToAmount,
		startTime,
		route: sanitizedRoute,
		routeIdentity: identity,
	};
	const serialized = JSON.stringify(envelope);
	if (serialized.length > BRIDGE_EXECUTION_MAX_SERIALIZED_CHARACTERS) return false;

	try {
		storage.setItem(BRIDGE_EXECUTION_STORAGE_KEY, serialized);
		return true;
	} catch {
		return false;
	}
}

export function loadPersistedBridgeExecution(
	walletAddress: string,
	storage: Storage | null = getSessionStorage(),
	now = Date.now(),
): PersistedBridgeExecution | null {
	if (!storage || !isAddress(walletAddress)) return null;

	let serialized: string | null;
	try {
		serialized = storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY);
	} catch {
		return null;
	}
	if (!serialized) return null;

	const envelope = parseEnvelope(serialized, now);
	if (!envelope) {
		clearPersistedBridgeExecution(storage);
		return null;
	}
	const identity = getBridgeRouteIdentity(envelope.route);
	if (
		!identity ||
		!hasSameBridgeRouteIdentity(identity, envelope.routeIdentity) ||
		!hasSameAddress(identity.sourceAddress, envelope.sourceAddress) ||
		identity.sourceChainId !== envelope.sourceChainId ||
		envelope.expectedToAmount !== (envelope.route as Record<string, unknown>).toAmount
	) {
		clearPersistedBridgeExecution(storage);
		return null;
	}
	if (!hasSameAddress(walletAddress, identity.sourceAddress)) return null;

	return {
		route: envelope.route as RouteExtended,
		expectedToAmount: envelope.expectedToAmount,
		startTime: envelope.startTime,
		identity,
	};
}

export function clearPersistedBridgeExecution(storage: Storage | null = getSessionStorage()): void {
	if (!storage) return;
	try {
		storage.removeItem(BRIDGE_EXECUTION_STORAGE_KEY);
	} catch {
		// Recovery storage is best effort after a terminal state.
	}
}
