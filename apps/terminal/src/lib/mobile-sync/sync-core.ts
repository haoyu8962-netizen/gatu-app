import {
	createMobileAgentName,
	MOBILE_AGENT_NAME_BASE,
	MOBILE_AGENT_VALIDITY_MS,
} from "@gatu/hl-react/signing/mobile-agent";
import { type Address, getAddress, type Hex, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const MOBILE_SYNC_FRAGMENT_KEY = "ht-mobile-sync";
export const MOBILE_SYNC_KEY_FRAGMENT_KEY = "k";
export const MOBILE_SYNC_ROUTE_PATH = "/mobile-agent-sync";
export const MOBILE_SYNC_PAYLOAD_TTL_MS = 10 * 60 * 1000;
export const MOBILE_SYNC_CLOCK_SKEW_MS = 60 * 1000;
export { createMobileAgentName, MOBILE_AGENT_NAME_BASE, MOBILE_AGENT_VALIDITY_MS };

const MOBILE_SYNC_ENVELOPE_TYPE = "gatu.mobile-agent-sync";
const MOBILE_SYNC_VERSION = 2;
const SYNC_ID_BYTES = 16;
const SYNC_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_LENGTH = 128;
const AES_GCM_KEY_LENGTH = 256;
// Binary envelope layout (single base64url pass — keeps the QR small):
// version(1) | createdAtMs(8 BE) | expiresAtMs(8 BE) | syncId(16) | iv(12) | ciphertext+tag(…)
const ENVELOPE_CREATED_AT_OFFSET = 1;
const ENVELOPE_EXPIRES_AT_OFFSET = 9;
const ENVELOPE_SYNC_ID_OFFSET = 17;
const ENVELOPE_IV_OFFSET = 33;
const ENVELOPE_HEADER_BYTES = ENVELOPE_IV_OFFSET + AES_GCM_IV_BYTES;
const ENVELOPE_AAD_PREFIX = `gatu mobile sync envelope v${MOBILE_SYNC_VERSION}:`;
const HEX_PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export type HyperliquidEnvName = "Mainnet" | "Testnet";

export type MobileSyncErrorCode =
	| "missing_sync_fragment"
	| "missing_sync_key"
	| "sync_payload_in_query"
	| "sync_payload_in_path"
	| "unknown_fragment_key"
	| "invalid_payload_encoding"
	| "invalid_envelope"
	| "expired_payload"
	| "decrypt_failed"
	| "invalid_plaintext"
	| "origin_mismatch"
	| "env_mismatch"
	| "account_mismatch"
	| "agent_key_mismatch";

export class MobileSyncError extends Error {
	readonly code: MobileSyncErrorCode;

	constructor(code: MobileSyncErrorCode) {
		super(getMobileSyncErrorMessage(code));
		this.name = "MobileSyncError";
		this.code = code;
	}
}

export interface MobileSyncEnvelope {
	v: typeof MOBILE_SYNC_VERSION;
	type: typeof MOBILE_SYNC_ENVELOPE_TYPE;
	syncId: string;
	createdAtMs: number;
	expiresAtMs: number;
	cipher: {
		name: "AES-GCM";
		length: typeof AES_GCM_KEY_LENGTH;
		iv: string;
		tagLength: typeof AES_GCM_TAG_LENGTH;
	};
	ciphertext: string;
}

// Only fields that cannot be derived on import travel in the plaintext. agentAddress comes from
// the private key, agentName/agentNameBase from agentValidUntilMs, and syncId/createdAtMs/expiresAtMs
// from the GCM-authenticated envelope header (bound via AAD).
export interface MobileAgentSyncPlaintext {
	v: typeof MOBILE_SYNC_VERSION;
	issuerOrigin: string;
	env: HyperliquidEnvName;
	userAddress: Address;
	agentPrivateKey: Hex;
	agentValidUntilMs: number;
}

export interface ImportedMobileAgent {
	env: HyperliquidEnvName;
	userAddress: Address;
	agentAddress: Address;
	agentPrivateKey: Hex;
	agentNameBase: typeof MOBILE_AGENT_NAME_BASE;
	agentName: string;
	agentValidUntilMs: number;
	importedAtMs: number;
	syncId: string;
}

export interface CreateMobileAgentSyncUrlInput {
	appOrigin: string;
	env: HyperliquidEnvName;
	userAddress: string;
	agentPrivateKey: string;
	agentName?: string;
	agentValidUntilMs?: number;
	nowMs?: number;
	routePath?: string;
}

export interface CreateMobileAgentSyncUrlResult {
	url: string;
	/** base64url of the AES key embedded in the URL fragment — kept so callers can persist it. */
	encodedKey: string;
	envelope: MobileSyncEnvelope;
	agentAddress: Address;
	agentName: string;
	agentValidUntilMs: number;
	expiresAtMs: number;
	syncId: string;
}

export interface DecryptMobileAgentSyncOptions {
	nowMs?: number;
	currentOrigin?: string;
	expectedUserAddress?: string;
	expectedEnv?: HyperliquidEnvName;
	allowedOrigins?: string[];
}

/** A parsed phone-sync link: the encrypted envelope plus the AES key carried in the URL fragment. */
export interface ParsedMobileSync {
	envelope: MobileSyncEnvelope;
	keyBytes: Uint8Array;
	/** base64url of the AES key, as carried in the fragment — for persisting/restoring drafts. */
	encodedKey: string;
}

export interface MobileSyncLocationLike {
	href: string;
	pathname: string;
	search: string;
	hash: string;
}

export interface MobileSyncHistoryLike {
	replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export interface MobileSyncNavigationLike {
	replace(url: string | URL): void;
}

export class MobileSyncCleanNavigationRequiredError extends Error {
	constructor() {
		super("A clean full-page navigation is required before mobile access can be imported.");
		this.name = "MobileSyncCleanNavigationRequiredError";
	}
}

type JsonRecord = Record<string, unknown>;

export async function createMobileAgentSyncUrl(
	input: CreateMobileAgentSyncUrlInput,
): Promise<CreateMobileAgentSyncUrlResult> {
	const nowMs = input.nowMs ?? Date.now();
	const expiresAtMs = nowMs + MOBILE_SYNC_PAYLOAD_TTL_MS;
	const appOrigin = normalizeOrigin(input.appOrigin);
	const userAddress = normalizeAddress(input.userAddress, "invalid_plaintext");
	const agentPrivateKey = normalizePrivateKey(input.agentPrivateKey);
	const agentAddress = privateKeyToAccount(agentPrivateKey).address;
	const agentValidUntilMs = input.agentValidUntilMs ?? nowMs + MOBILE_AGENT_VALIDITY_MS;
	const agentName = input.agentName ?? createMobileAgentName(agentValidUntilMs);
	assertValidAgentApproval(agentName, agentValidUntilMs, nowMs);
	const crypto = getCrypto();

	const keyBytes = createSyncKeyBytes(crypto);
	const envelopeWithoutCiphertext = createEnvelopeWithoutCiphertext(nowMs, expiresAtMs, crypto);
	const plaintext: MobileAgentSyncPlaintext = {
		v: MOBILE_SYNC_VERSION,
		issuerOrigin: appOrigin,
		env: input.env,
		userAddress,
		agentPrivateKey,
		agentValidUntilMs,
	};

	const key = await importRawKey(keyBytes, crypto);
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: toBufferSource(base64UrlToBytes(envelopeWithoutCiphertext.cipher.iv)),
			additionalData: toBufferSource(createEnvelopeAdditionalData(envelopeWithoutCiphertext)),
			tagLength: AES_GCM_TAG_LENGTH,
		},
		key,
		toBufferSource(utf8Encode(canonicalJson(plaintext))),
	);
	const envelope: MobileSyncEnvelope = {
		...envelopeWithoutCiphertext,
		ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
	};
	const encodedKey = bytesToBase64Url(keyBytes);
	const url = buildMobileSyncUrl(appOrigin, input.routePath ?? MOBILE_SYNC_ROUTE_PATH, envelope, encodedKey);

	return {
		url,
		encodedKey,
		envelope,
		agentAddress,
		agentName,
		agentValidUntilMs,
		expiresAtMs,
		syncId: envelope.syncId,
	};
}

export function createSyncKeyBytes(crypto: Crypto = getCrypto()): Uint8Array {
	const bytes = new Uint8Array(SYNC_KEY_BYTES);
	crypto.getRandomValues(bytes);
	return bytes;
}

export function decodeSyncKey(encoded: string): Uint8Array {
	const keyBytes = base64UrlToBytes(encoded);
	if (keyBytes.length !== SYNC_KEY_BYTES) {
		throw new MobileSyncError("invalid_payload_encoding");
	}
	return keyBytes;
}

export function parseMobileSyncUrl(urlInput: string | URL): ParsedMobileSync {
	const url = typeof urlInput === "string" ? new URL(urlInput) : urlInput;

	if (url.searchParams.has(MOBILE_SYNC_FRAGMENT_KEY)) {
		throw new MobileSyncError("sync_payload_in_query");
	}
	if (decodeURIComponent(url.pathname).includes(MOBILE_SYNC_FRAGMENT_KEY)) {
		throw new MobileSyncError("sync_payload_in_path");
	}

	const rawHash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
	if (!rawHash) {
		throw new MobileSyncError("missing_sync_fragment");
	}

	const params = new URLSearchParams(rawHash);
	for (const [key] of params.entries()) {
		if (key !== MOBILE_SYNC_FRAGMENT_KEY && key !== MOBILE_SYNC_KEY_FRAGMENT_KEY) {
			throw new MobileSyncError("unknown_fragment_key");
		}
	}

	const encoded = params.get(MOBILE_SYNC_FRAGMENT_KEY);
	if (!encoded) {
		throw new MobileSyncError("missing_sync_fragment");
	}
	const encodedKey = params.get(MOBILE_SYNC_KEY_FRAGMENT_KEY);
	if (!encodedKey) {
		throw new MobileSyncError("missing_sync_key");
	}

	const envelope = decodeMobileSyncEnvelope(encoded);
	const keyBytes = decodeSyncKey(encodedKey);
	return { envelope, keyBytes, encodedKey };
}

export function readAndClearMobileSyncEnvelope(
	location: MobileSyncLocationLike = window.location,
	history: MobileSyncHistoryLike = window.history,
	navigation: MobileSyncNavigationLike = window.location,
): ParsedMobileSync {
	const href = location.href;
	const cleanUrl = getMobileSyncCleanUrl(location);

	try {
		history.replaceState(null, "", cleanUrl);
	} catch {
		navigateToCleanMobileSyncUrl(navigation, cleanUrl);
	}
	if (!isMobileSyncLocationClean(location, cleanUrl)) {
		navigateToCleanMobileSyncUrl(navigation, cleanUrl);
	}

	return parseMobileSyncUrl(href);
}

export function getMobileSyncCleanUrl(location: Pick<MobileSyncLocationLike, "pathname" | "search">): string {
	const pathname =
		location.pathname === MOBILE_SYNC_ROUTE_PATH || location.pathname === `${MOBILE_SYNC_ROUTE_PATH}/`
			? location.pathname
			: MOBILE_SYNC_ROUTE_PATH;
	const searchParams = new URLSearchParams(location.search);
	searchParams.delete(MOBILE_SYNC_FRAGMENT_KEY);
	searchParams.delete(MOBILE_SYNC_KEY_FRAGMENT_KEY);
	const search = searchParams.toString();
	return `${pathname}${search ? `?${search}` : ""}`;
}

export function isMobileSyncCleanNavigationRequiredError(
	error: unknown,
): error is MobileSyncCleanNavigationRequiredError {
	return error instanceof MobileSyncCleanNavigationRequiredError;
}

function isMobileSyncLocationClean(location: MobileSyncLocationLike, cleanUrl: string): boolean {
	const expected = new URL(cleanUrl, "https://mobile-sync.invalid");
	const searchParams = new URLSearchParams(location.search);
	return (
		location.pathname === expected.pathname &&
		location.search === expected.search &&
		location.hash === "" &&
		!searchParams.has(MOBILE_SYNC_FRAGMENT_KEY) &&
		!searchParams.has(MOBILE_SYNC_KEY_FRAGMENT_KEY)
	);
}

function navigateToCleanMobileSyncUrl(navigation: MobileSyncNavigationLike, cleanUrl: string): never {
	try {
		navigation.replace(cleanUrl);
	} catch {}
	throw new MobileSyncCleanNavigationRequiredError();
}

export async function decryptMobileAgentSyncEnvelope(
	envelope: MobileSyncEnvelope,
	keyBytes: Uint8Array,
	options: DecryptMobileAgentSyncOptions = {},
): Promise<ImportedMobileAgent> {
	const validEnvelope = validateMobileSyncEnvelope(envelope);
	const nowMs = options.nowMs ?? Date.now();
	assertEnvelopeNotExpired(validEnvelope, nowMs);

	let plaintextBytes: ArrayBuffer;
	try {
		const crypto = getCrypto();
		const envelopeWithoutCiphertext = removeCiphertext(validEnvelope);
		const key = await importRawKey(keyBytes, crypto);
		plaintextBytes = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: toBufferSource(base64UrlToBytes(validEnvelope.cipher.iv)),
				additionalData: toBufferSource(createEnvelopeAdditionalData(envelopeWithoutCiphertext)),
				tagLength: AES_GCM_TAG_LENGTH,
			},
			key,
			toBufferSource(base64UrlToBytes(validEnvelope.ciphertext)),
		);
	} catch (error) {
		if (error instanceof MobileSyncError) throw error;
		throw new MobileSyncError("decrypt_failed");
	}

	let plaintext: unknown;
	try {
		plaintext = JSON.parse(utf8Decode(new Uint8Array(plaintextBytes)));
	} catch {
		throw new MobileSyncError("invalid_plaintext");
	}

	return validateMobileAgentSyncPlaintext(plaintext, validEnvelope, {
		...options,
		nowMs,
	});
}

export async function importMobileAgentSyncUrl(
	urlInput: string | URL,
	options: DecryptMobileAgentSyncOptions = {},
): Promise<ImportedMobileAgent> {
	const { envelope, keyBytes } = parseMobileSyncUrl(urlInput);
	return decryptMobileAgentSyncEnvelope(envelope, keyBytes, options);
}

export function validateMobileAgentSyncPlaintext(
	plaintextInput: unknown,
	envelope: MobileSyncEnvelope,
	options: DecryptMobileAgentSyncOptions = {},
): ImportedMobileAgent {
	const plaintext = asRecord(plaintextInput, "invalid_plaintext");
	const nowMs = options.nowMs ?? Date.now();

	if (plaintext.v !== MOBILE_SYNC_VERSION) {
		throw new MobileSyncError("invalid_plaintext");
	}

	const issuerOrigin = asString(plaintext.issuerOrigin, "invalid_plaintext");
	validateOrigin(issuerOrigin, options.currentOrigin, options.allowedOrigins);

	const env = plaintext.env;
	if (env !== "Mainnet" && env !== "Testnet") {
		throw new MobileSyncError("invalid_plaintext");
	}
	if (options.expectedEnv && env !== options.expectedEnv) {
		throw new MobileSyncError("env_mismatch");
	}

	const userAddress = normalizeAddress(plaintext.userAddress, "invalid_plaintext");
	if (
		options.expectedUserAddress &&
		userAddress !== normalizeAddress(options.expectedUserAddress, "account_mismatch")
	) {
		throw new MobileSyncError("account_mismatch");
	}

	const agentPrivateKey = normalizePrivateKey(plaintext.agentPrivateKey);
	let agentAddress: Address;
	try {
		agentAddress = normalizeAddress(privateKeyToAccount(agentPrivateKey).address, "agent_key_mismatch");
	} catch (error) {
		if (error instanceof MobileSyncError) throw error;
		throw new MobileSyncError("agent_key_mismatch");
	}

	const agentValidUntilMs = asSafeInteger(plaintext.agentValidUntilMs, "invalid_plaintext");
	if (agentValidUntilMs <= nowMs) {
		throw new MobileSyncError("invalid_plaintext");
	}
	if (agentValidUntilMs > envelope.createdAtMs + MOBILE_AGENT_VALIDITY_MS + MOBILE_SYNC_PAYLOAD_TTL_MS) {
		throw new MobileSyncError("invalid_plaintext");
	}

	return {
		env,
		userAddress,
		agentAddress,
		agentPrivateKey,
		agentNameBase: MOBILE_AGENT_NAME_BASE,
		agentName: createMobileAgentName(agentValidUntilMs),
		agentValidUntilMs,
		importedAtMs: nowMs,
		syncId: envelope.syncId,
	};
}

export function encodeMobileSyncEnvelope(envelope: MobileSyncEnvelope): string {
	const valid = validateMobileSyncEnvelope(envelope);
	const ciphertext = base64UrlToBytes(valid.ciphertext);
	const bytes = new Uint8Array(ENVELOPE_HEADER_BYTES + ciphertext.length);
	bytes.set(buildEnvelopeHeader(valid), 0);
	bytes.set(ciphertext, ENVELOPE_HEADER_BYTES);
	return bytesToBase64Url(bytes);
}

export function decodeMobileSyncEnvelope(encoded: string): MobileSyncEnvelope {
	const bytes = base64UrlToBytes(encoded);
	if (bytes.length <= ENVELOPE_HEADER_BYTES + AES_GCM_TAG_LENGTH / 8) {
		throw new MobileSyncError("invalid_envelope");
	}
	if (bytes[0] !== MOBILE_SYNC_VERSION) {
		throw new MobileSyncError("invalid_envelope");
	}

	return validateMobileSyncEnvelope({
		v: MOBILE_SYNC_VERSION,
		type: MOBILE_SYNC_ENVELOPE_TYPE,
		syncId: bytesToBase64Url(bytes.subarray(ENVELOPE_SYNC_ID_OFFSET, ENVELOPE_SYNC_ID_OFFSET + SYNC_ID_BYTES)),
		createdAtMs: readUint64BE(bytes, ENVELOPE_CREATED_AT_OFFSET),
		expiresAtMs: readUint64BE(bytes, ENVELOPE_EXPIRES_AT_OFFSET),
		cipher: {
			name: "AES-GCM",
			length: AES_GCM_KEY_LENGTH,
			iv: bytesToBase64Url(bytes.subarray(ENVELOPE_IV_OFFSET, ENVELOPE_HEADER_BYTES)),
			tagLength: AES_GCM_TAG_LENGTH,
		},
		ciphertext: bytesToBase64Url(bytes.subarray(ENVELOPE_HEADER_BYTES)),
	});
}

export function isMobileSyncError(error: unknown): error is MobileSyncError {
	return error instanceof MobileSyncError;
}

function buildMobileSyncUrl(
	appOrigin: string,
	routePath: string,
	envelope: MobileSyncEnvelope,
	encodedKey: string,
): string {
	const url = new URL(routePath, appOrigin);
	url.hash = `${MOBILE_SYNC_FRAGMENT_KEY}=${encodeMobileSyncEnvelope(envelope)}&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${encodedKey}`;
	return url.toString();
}

function createEnvelopeWithoutCiphertext(
	createdAtMs: number,
	expiresAtMs: number,
	crypto: Crypto,
): Omit<MobileSyncEnvelope, "ciphertext"> {
	const syncIdBytes = new Uint8Array(SYNC_ID_BYTES);
	const ivBytes = new Uint8Array(AES_GCM_IV_BYTES);
	crypto.getRandomValues(syncIdBytes);
	crypto.getRandomValues(ivBytes);

	return {
		v: MOBILE_SYNC_VERSION,
		type: MOBILE_SYNC_ENVELOPE_TYPE,
		syncId: bytesToBase64Url(syncIdBytes),
		createdAtMs,
		expiresAtMs,
		cipher: {
			name: "AES-GCM",
			length: AES_GCM_KEY_LENGTH,
			iv: bytesToBase64Url(ivBytes),
			tagLength: AES_GCM_TAG_LENGTH,
		},
	};
}

function assertValidAgentApproval(agentName: string, agentValidUntilMs: number, nowMs: number): void {
	if (
		!Number.isSafeInteger(agentValidUntilMs) ||
		agentValidUntilMs <= nowMs ||
		agentName !== createMobileAgentName(agentValidUntilMs)
	) {
		throw new MobileSyncError("invalid_plaintext");
	}
}

function importRawKey(keyBytes: Uint8Array, crypto: Crypto): Promise<CryptoKey> {
	if (keyBytes.length !== SYNC_KEY_BYTES) {
		throw new MobileSyncError("decrypt_failed");
	}
	return crypto.subtle.importKey(
		"raw",
		toBufferSource(keyBytes),
		{ name: "AES-GCM", length: AES_GCM_KEY_LENGTH },
		false,
		["encrypt", "decrypt"],
	);
}

function validateMobileSyncEnvelope(envelopeInput: unknown): MobileSyncEnvelope {
	const envelope = asRecord(envelopeInput, "invalid_envelope");
	if (envelope.v !== MOBILE_SYNC_VERSION || envelope.type !== MOBILE_SYNC_ENVELOPE_TYPE) {
		throw new MobileSyncError("invalid_envelope");
	}

	const createdAtMs = asSafeInteger(envelope.createdAtMs, "invalid_envelope");
	const expiresAtMs = asSafeInteger(envelope.expiresAtMs, "invalid_envelope");
	if (expiresAtMs <= createdAtMs || expiresAtMs - createdAtMs > MOBILE_SYNC_PAYLOAD_TTL_MS || createdAtMs <= 0) {
		throw new MobileSyncError("invalid_envelope");
	}

	const syncId = asString(envelope.syncId, "invalid_envelope");
	if (base64UrlToBytes(syncId).length !== SYNC_ID_BYTES) {
		throw new MobileSyncError("invalid_envelope");
	}

	const cipher = asRecord(envelope.cipher, "invalid_envelope");
	if (cipher.name !== "AES-GCM" || cipher.length !== AES_GCM_KEY_LENGTH || cipher.tagLength !== AES_GCM_TAG_LENGTH) {
		throw new MobileSyncError("invalid_envelope");
	}
	const iv = asString(cipher.iv, "invalid_envelope");
	if (base64UrlToBytes(iv).length !== AES_GCM_IV_BYTES) {
		throw new MobileSyncError("invalid_envelope");
	}

	const ciphertext = asString(envelope.ciphertext, "invalid_envelope");
	if (base64UrlToBytes(ciphertext).length <= AES_GCM_TAG_LENGTH / 8) {
		throw new MobileSyncError("invalid_envelope");
	}

	return {
		v: MOBILE_SYNC_VERSION,
		type: MOBILE_SYNC_ENVELOPE_TYPE,
		syncId,
		createdAtMs,
		expiresAtMs,
		cipher: {
			name: "AES-GCM",
			length: AES_GCM_KEY_LENGTH,
			iv,
			tagLength: AES_GCM_TAG_LENGTH,
		},
		ciphertext,
	};
}

function assertEnvelopeNotExpired(envelope: MobileSyncEnvelope, nowMs: number): void {
	if (nowMs > envelope.expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS) {
		throw new MobileSyncError("expired_payload");
	}
}

function removeCiphertext(envelope: MobileSyncEnvelope): Omit<MobileSyncEnvelope, "ciphertext"> {
	return {
		v: envelope.v,
		type: envelope.type,
		syncId: envelope.syncId,
		createdAtMs: envelope.createdAtMs,
		expiresAtMs: envelope.expiresAtMs,
		cipher: envelope.cipher,
	};
}

function buildEnvelopeHeader(envelope: Omit<MobileSyncEnvelope, "ciphertext">): Uint8Array {
	const header = new Uint8Array(ENVELOPE_HEADER_BYTES);
	header[0] = MOBILE_SYNC_VERSION;
	writeUint64BE(header, ENVELOPE_CREATED_AT_OFFSET, envelope.createdAtMs);
	writeUint64BE(header, ENVELOPE_EXPIRES_AT_OFFSET, envelope.expiresAtMs);
	header.set(base64UrlToBytes(envelope.syncId), ENVELOPE_SYNC_ID_OFFSET);
	header.set(base64UrlToBytes(envelope.cipher.iv), ENVELOPE_IV_OFFSET);
	return header;
}

function createEnvelopeAdditionalData(envelope: Omit<MobileSyncEnvelope, "ciphertext">): Uint8Array {
	const prefix = utf8Encode(ENVELOPE_AAD_PREFIX);
	const header = buildEnvelopeHeader(envelope);
	const aad = new Uint8Array(prefix.length + header.length);
	aad.set(prefix, 0);
	aad.set(header, prefix.length);
	return aad;
}

function writeUint64BE(bytes: Uint8Array, offset: number, value: number): void {
	new DataView(bytes.buffer, bytes.byteOffset).setBigUint64(offset, BigInt(value));
}

function readUint64BE(bytes: Uint8Array, offset: number): number {
	const value = Number(new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(offset));
	if (!Number.isSafeInteger(value)) {
		throw new MobileSyncError("invalid_envelope");
	}
	return value;
}

function validateOrigin(issuerOrigin: string, currentOrigin: string | undefined, allowedOrigins: string[] | undefined) {
	const normalizedIssuer = normalizeOrigin(issuerOrigin);
	const allowed = new Set((allowedOrigins ?? []).map(normalizeOrigin));
	if (currentOrigin) allowed.add(normalizeOrigin(currentOrigin));
	if (allowed.size > 0 && !allowed.has(normalizedIssuer)) {
		throw new MobileSyncError("origin_mismatch");
	}
}

function normalizeOrigin(origin: string): string {
	try {
		const url = new URL(origin);
		return url.origin;
	} catch {
		throw new MobileSyncError("invalid_plaintext");
	}
}

function normalizeAddress(value: unknown, errorCode: MobileSyncErrorCode): Address {
	if (typeof value !== "string" || !isAddress(value)) {
		throw new MobileSyncError(errorCode);
	}
	return getAddress(value).toLowerCase() as Address;
}

function normalizePrivateKey(value: unknown): Hex {
	if (typeof value !== "string" || !HEX_PRIVATE_KEY_RE.test(value)) {
		throw new MobileSyncError("invalid_plaintext");
	}
	return value.toLowerCase() as Hex;
}

function asRecord(value: unknown, errorCode: MobileSyncErrorCode): JsonRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new MobileSyncError(errorCode);
	}
	return value as JsonRecord;
}

function asString(value: unknown, errorCode: MobileSyncErrorCode): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new MobileSyncError(errorCode);
	}
	return value;
}

function asSafeInteger(value: unknown, errorCode: MobileSyncErrorCode): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value)) {
		throw new MobileSyncError(errorCode);
	}
	return value;
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (!value || typeof value !== "object") return value;
	const sorted: JsonRecord = {};
	for (const key of Object.keys(value).sort()) {
		sorted[key] = sortJsonValue((value as JsonRecord)[key]);
	}
	return sorted;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(input: string): Uint8Array {
	if (!/^[A-Za-z0-9_-]+$/.test(input)) {
		throw new MobileSyncError("invalid_payload_encoding");
	}
	const padded = input
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(input.length / 4) * 4, "=");
	let binary: string;
	try {
		binary = atob(padded);
	} catch {
		throw new MobileSyncError("invalid_payload_encoding");
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function utf8Encode(input: string): Uint8Array {
	return new TextEncoder().encode(input);
}

function utf8Decode(input: Uint8Array): string {
	return new TextDecoder().decode(input);
}

function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy;
}

function getCrypto(): Crypto {
	const crypto = globalThis.crypto;
	if (!crypto?.subtle) {
		throw new MobileSyncError("invalid_envelope");
	}
	return crypto;
}

function getMobileSyncErrorMessage(code: MobileSyncErrorCode): string {
	if (code === "expired_payload") return "This mobile trading link has expired.";
	return "Invalid mobile sync payload.";
}
