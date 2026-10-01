import {
	createMobileAgentName,
	MOBILE_AGENT_NAME_BASE,
	MOBILE_AGENT_VALIDITY_MS,
} from "@sairn/hl-react/signing/mobile-agent";
import { type Address, type Hex, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const MOBILE_SYNC_FRAGMENT_KEY = "sairn-mobile-sync";
export const MOBILE_SYNC_ROUTE_PATH = "/mobile-agent-sync";
export const MOBILE_SYNC_PAYLOAD_TTL_MS = 2 * 60 * 1000;
export const MOBILE_SYNC_QR_VISIBLE_MS = 60 * 1000;
export const MOBILE_SYNC_CLOCK_SKEW_MS = 60 * 1000;
export { createMobileAgentName, MOBILE_AGENT_NAME_BASE, MOBILE_AGENT_VALIDITY_MS };

const MOBILE_SYNC_VERSION = 4;
const LEGACY_KEY_FRAGMENT_KEY = "k";
const HEX_PRIVATE_KEY_RE = /^0x[0-9a-f]{64}$/i;

export type HyperliquidEnvName = "Mainnet" | "Testnet";

export type MobileSyncErrorCode =
	| "missing_fragment"
	| "invalid_payload"
	| "unsupported_version"
	| "expired_payload"
	| "not_yet_valid"
	| "env_mismatch";

export class MobileSyncError extends Error {
	readonly code: MobileSyncErrorCode;

	constructor(code: MobileSyncErrorCode) {
		super(`Mobile sync payload rejected: ${code}`);
		this.name = "MobileSyncError";
		this.code = code;
	}
}

/**
 * The phone-access link carries this payload as plain JSON in the URL fragment. The fragment
 * never leaves the browser, and anyone holding the complete link holds the key, so encrypting
 * it with a key from the same link would add nothing; the fields bind the payload to one
 * network, one owner and a two-minute window instead.
 */
export interface MobileAgentSyncPayload {
	env: HyperliquidEnvName;
	userAddress: Address;
	agentAddress: Address;
	agentPrivateKey: Hex;
	agentNameBase: typeof MOBILE_AGENT_NAME_BASE;
	agentName: string;
	agentValidUntilMs: number;
	createdAtMs: number;
	expiresAtMs: number;
}

export interface CreateMobileAgentSyncUrlInput {
	appOrigin: string;
	env: HyperliquidEnvName;
	userAddress: string;
	agentPrivateKey: string;
	agentValidUntilMs: number;
	nowMs?: number;
}

export interface CreateMobileAgentSyncUrlResult {
	url: string;
	payload: MobileAgentSyncPayload;
}

export interface ParseMobileSyncOptions {
	expectedEnv?: HyperliquidEnvName;
	nowMs?: number;
}

interface WirePayload {
	v: number;
	env: HyperliquidEnvName;
	owner: string;
	key: string;
	validUntil: number;
	createdAt: number;
	expiresAt: number;
}

export function createMobileAgentSyncUrl(input: CreateMobileAgentSyncUrlInput): CreateMobileAgentSyncUrlResult {
	const nowMs = input.nowMs ?? Date.now();
	const wire: WirePayload = {
		v: MOBILE_SYNC_VERSION,
		env: input.env,
		owner: input.userAddress,
		key: input.agentPrivateKey,
		validUntil: input.agentValidUntilMs,
		createdAt: nowMs,
		expiresAt: nowMs + MOBILE_SYNC_PAYLOAD_TTL_MS,
	};
	const payload = toPayload(wire);
	const url = new URL(MOBILE_SYNC_ROUTE_PATH, input.appOrigin);
	url.hash = `${MOBILE_SYNC_FRAGMENT_KEY}=${encodeBase64Url(JSON.stringify(wire))}`;
	return { url: url.toString(), payload };
}

export function parseMobileSyncUrl(
	urlInput: string | URL,
	options: ParseMobileSyncOptions = {},
): MobileAgentSyncPayload {
	return parseMobileSyncFragment(new URL(urlInput).hash, options);
}

export function parseMobileSyncFragment(hash: string, options: ParseMobileSyncOptions = {}): MobileAgentSyncPayload {
	const params = new URLSearchParams(hash.replace(/^#/, ""));
	if (params.has(LEGACY_KEY_FRAGMENT_KEY)) throw new MobileSyncError("unsupported_version");
	const encoded = params.get(MOBILE_SYNC_FRAGMENT_KEY);
	if (!encoded) throw new MobileSyncError("missing_fragment");

	const wire = decodeWirePayload(encoded);
	if (wire.v !== MOBILE_SYNC_VERSION) throw new MobileSyncError("unsupported_version");
	const payload = toPayload(wire);
	if (options.expectedEnv && payload.env !== options.expectedEnv) throw new MobileSyncError("env_mismatch");

	const nowMs = options.nowMs ?? Date.now();
	if (payload.createdAtMs > nowMs + MOBILE_SYNC_CLOCK_SKEW_MS) throw new MobileSyncError("not_yet_valid");
	if (isMobileSyncPayloadExpired(payload, nowMs)) throw new MobileSyncError("expired_payload");
	return payload;
}

export function isMobileSyncPayloadExpired(payload: Pick<MobileAgentSyncPayload, "expiresAtMs">, nowMs = Date.now()) {
	return nowMs > payload.expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS;
}

export function isMobileSyncError(error: unknown): error is MobileSyncError {
	return error instanceof MobileSyncError;
}

function decodeWirePayload(encoded: string): WirePayload {
	let parsed: unknown;
	try {
		parsed = JSON.parse(decodeBase64Url(encoded));
	} catch {
		throw new MobileSyncError("invalid_payload");
	}
	if (typeof parsed !== "object" || parsed === null) throw new MobileSyncError("invalid_payload");
	const record = parsed as Record<string, unknown>;
	if (typeof record.v !== "number") throw new MobileSyncError("invalid_payload");
	if (record.v !== MOBILE_SYNC_VERSION) throw new MobileSyncError("unsupported_version");
	if (
		(record.env !== "Mainnet" && record.env !== "Testnet") ||
		typeof record.owner !== "string" ||
		!isAddress(record.owner) ||
		typeof record.key !== "string" ||
		!HEX_PRIVATE_KEY_RE.test(record.key) ||
		!isSafePositiveInteger(record.validUntil) ||
		!isSafePositiveInteger(record.createdAt) ||
		!isSafePositiveInteger(record.expiresAt) ||
		record.expiresAt <= record.createdAt ||
		record.expiresAt - record.createdAt > MOBILE_SYNC_PAYLOAD_TTL_MS ||
		record.validUntil <= record.createdAt ||
		record.validUntil - record.createdAt > MOBILE_AGENT_VALIDITY_MS
	) {
		throw new MobileSyncError("invalid_payload");
	}
	return {
		v: record.v,
		env: record.env,
		owner: record.owner,
		key: record.key,
		validUntil: record.validUntil,
		createdAt: record.createdAt,
		expiresAt: record.expiresAt,
	};
}

function toPayload(wire: WirePayload): MobileAgentSyncPayload {
	const agentPrivateKey = wire.key.toLowerCase() as Hex;
	return {
		env: wire.env,
		userAddress: wire.owner.toLowerCase() as Address,
		agentAddress: privateKeyToAccount(agentPrivateKey).address.toLowerCase() as Address,
		agentPrivateKey,
		agentNameBase: MOBILE_AGENT_NAME_BASE,
		agentName: createMobileAgentName(wire.validUntil),
		agentValidUntilMs: wire.validUntil,
		createdAtMs: wire.createdAt,
		expiresAtMs: wire.expiresAt,
	};
}

function isSafePositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function encodeBase64Url(value: string): string {
	return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	return atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
}
