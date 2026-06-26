import { describe, expect, it, vi } from "vitest";
import {
	createMobileAgentName,
	createMobileAgentSyncUrl,
	decryptMobileAgentSyncEnvelope,
	getMobileSyncCleanUrl,
	importMobileAgentSyncUrl,
	MOBILE_AGENT_NAME_BASE,
	MOBILE_AGENT_VALIDITY_MS,
	MOBILE_SYNC_CLOCK_SKEW_MS,
	MOBILE_SYNC_FRAGMENT_KEY,
	MOBILE_SYNC_KEY_FRAGMENT_KEY,
	MOBILE_SYNC_PAYLOAD_TTL_MS,
	MOBILE_SYNC_ROUTE_PATH,
	type MobileAgentSyncPlaintext,
	type MobileSyncEnvelope,
	MobileSyncError,
	parseMobileSyncUrl,
	readAndClearMobileSyncEnvelope,
	validateMobileAgentSyncPlaintext,
} from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const APP_ORIGIN = "https://app.hypeterminal.com";
const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const OTHER_USER_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
// A syntactically valid 32-byte base64url key, used to satisfy the `&k=` fragment in URLs whose
// envelope payload is intentionally malformed.
const VALID_KEY = "A".repeat(43);

function expectMobileSyncError(error: unknown, code: string) {
	expect(error).toBeInstanceOf(MobileSyncError);
	expect(error).toMatchObject({ code });
}

async function createSyncFixture() {
	const sync = await createMobileAgentSyncUrl({
		appOrigin: APP_ORIGIN,
		env: "Mainnet",
		userAddress: USER_ADDRESS,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		nowMs: NOW_MS,
	});
	const { keyBytes } = parseMobileSyncUrl(sync.url);
	return { ...sync, keyBytes };
}

describe("mobile sync core", () => {
	it("creates a fragment-only encrypted QR URL with an embedded key and imports it", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);

		expect(url.origin).toBe(APP_ORIGIN);
		expect(url.pathname).toBe(MOBILE_SYNC_ROUTE_PATH);
		expect(url.search).toBe("");
		expect(url.hash.startsWith(`#${MOBILE_SYNC_FRAGMENT_KEY}=`)).toBe(true);
		expect(url.hash).toContain(`&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=`);
		expect("userAddress" in sync.envelope).toBe(false);
		expect(JSON.stringify(sync.envelope)).not.toContain("userAddress");
		expect(JSON.stringify(sync.envelope).toLowerCase()).not.toContain(USER_ADDRESS.toLowerCase());
		expect(sync.url).not.toContain(AGENT_PRIVATE_KEY);
		expect(sync.url.toLowerCase()).not.toContain(USER_ADDRESS.toLowerCase());
		expect(sync.agentName).toBe(createMobileAgentName(sync.agentValidUntilMs));

		const imported = await importMobileAgentSyncUrl(sync.url, {
			currentOrigin: APP_ORIGIN,
			expectedUserAddress: USER_ADDRESS,
			expectedEnv: "Mainnet",
			nowMs: NOW_MS,
		});

		expect(imported).toMatchObject({
			env: "Mainnet",
			userAddress: USER_ADDRESS,
			agentAddress: sync.agentAddress.toLowerCase(),
			agentPrivateKey: AGENT_PRIVATE_KEY,
			agentNameBase: MOBILE_AGENT_NAME_BASE,
			agentName: sync.agentName,
			agentValidUntilMs: NOW_MS + MOBILE_AGENT_VALIDITY_MS,
			importedAtMs: NOW_MS,
			syncId: sync.syncId,
		});
	});

	it("can start sync link expiry after an earlier wallet approval", async () => {
		const linkCreatedAtMs = NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + 1234;
		const approvedAgentValidUntilMs = NOW_MS + MOBILE_AGENT_VALIDITY_MS;
		const approvedAgentName = createMobileAgentName(approvedAgentValidUntilMs);

		const sync = await createMobileAgentSyncUrl({
			appOrigin: APP_ORIGIN,
			env: "Mainnet",
			userAddress: USER_ADDRESS,
			agentPrivateKey: AGENT_PRIVATE_KEY,
			agentName: approvedAgentName,
			agentValidUntilMs: approvedAgentValidUntilMs,
			nowMs: linkCreatedAtMs,
		});
		const { keyBytes } = parseMobileSyncUrl(sync.url);

		expect(sync.expiresAtMs).toBe(linkCreatedAtMs + MOBILE_SYNC_PAYLOAD_TTL_MS);
		expect(sync.agentName).toBe(approvedAgentName);
		expect(sync.agentValidUntilMs).toBe(approvedAgentValidUntilMs);

		const imported = await decryptMobileAgentSyncEnvelope(sync.envelope, keyBytes, {
			currentOrigin: APP_ORIGIN,
			expectedUserAddress: USER_ADDRESS,
			expectedEnv: "Mainnet",
			nowMs: linkCreatedAtMs,
		});

		expect(imported).toMatchObject({
			agentName: approvedAgentName,
			agentValidUntilMs: approvedAgentValidUntilMs,
			importedAtMs: linkCreatedAtMs,
		});
	});

	it("rejects sync payloads in query strings, paths, missing fragments, and unknown fragment keys", async () => {
		const sync = await createSyncFixture();
		const hash = new URL(sync.url).hash.slice(1);
		const params = new URLSearchParams(hash);
		const encoded = params.get(MOBILE_SYNC_FRAGMENT_KEY) ?? "";
		const encodedKey = params.get(MOBILE_SYNC_KEY_FRAGMENT_KEY) ?? "";

		expect(() =>
			parseMobileSyncUrl(`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}?${MOBILE_SYNC_FRAGMENT_KEY}=${encoded}`),
		).toThrow(MobileSyncError);
		expect(() => parseMobileSyncUrl(`${APP_ORIGIN}/${MOBILE_SYNC_FRAGMENT_KEY}/${encoded}`)).toThrow(MobileSyncError);
		expect(() => parseMobileSyncUrl(`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}`)).toThrow(MobileSyncError);
		expect(() =>
			parseMobileSyncUrl(
				`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}#other=${encoded}&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${encodedKey}`,
			),
		).toThrow(MobileSyncError);
		// envelope present but the embedded key missing
		expect(() =>
			parseMobileSyncUrl(`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}#${MOBILE_SYNC_FRAGMENT_KEY}=${encoded}`),
		).toThrow(MobileSyncError);
	});

	it("cleans the URL before parsing so invalid links are removed from history too", () => {
		const history = { replaceState: vi.fn() };
		const location = {
			href: `${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}?from=qr#${MOBILE_SYNC_FRAGMENT_KEY}=not*base64&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${VALID_KEY}`,
			pathname: MOBILE_SYNC_ROUTE_PATH,
			search: "?from=qr",
			hash: `#${MOBILE_SYNC_FRAGMENT_KEY}=not*base64&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${VALID_KEY}`,
		};

		expect(() => readAndClearMobileSyncEnvelope(location, history)).toThrow(MobileSyncError);
		expect(history.replaceState).toHaveBeenCalledWith(null, "", `${MOBILE_SYNC_ROUTE_PATH}?from=qr`);
		expect(getMobileSyncCleanUrl(location)).toBe(`${MOBILE_SYNC_ROUTE_PATH}?from=qr`);
	});

	it("rejects malformed payload encoding", () => {
		expect(() =>
			parseMobileSyncUrl(
				`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}#${MOBILE_SYNC_FRAGMENT_KEY}=not*base64&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${VALID_KEY}`,
			),
		).toThrow(MobileSyncError);
	});

	it("rejects expired payloads before attempting import", async () => {
		const sync = await createSyncFixture();

		await expect(
			decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
				currentOrigin: APP_ORIGIN,
				nowMs: NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS + 1,
			}),
		).rejects.toSatisfy((error) => {
			expectMobileSyncError(error, "expired_payload");
			return true;
		});
	});

	it("rejects a wrong decryption key without exposing which validation branch failed", async () => {
		const sync = await createSyncFixture();
		const wrongKey = new Uint8Array(32).fill(7);

		await expect(
			decryptMobileAgentSyncEnvelope(sync.envelope, wrongKey, {
				currentOrigin: APP_ORIGIN,
				nowMs: NOW_MS,
			}),
		).rejects.toSatisfy((error) => {
			expectMobileSyncError(error, "decrypt_failed");
			expect((error as Error).message).toBe("Invalid mobile sync payload.");
			return true;
		});
	});

	it("rejects wrong account, environment, and origin after decrypting", async () => {
		const sync = await createSyncFixture();

		await expect(
			decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
				currentOrigin: APP_ORIGIN,
				expectedUserAddress: OTHER_USER_ADDRESS,
				nowMs: NOW_MS,
			}),
		).rejects.toSatisfy((error) => {
			expectMobileSyncError(error, "account_mismatch");
			return true;
		});

		await expect(
			decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
				currentOrigin: APP_ORIGIN,
				expectedEnv: "Testnet",
				nowMs: NOW_MS,
			}),
		).rejects.toSatisfy((error) => {
			expectMobileSyncError(error, "env_mismatch");
			return true;
		});

		await expect(
			decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
				currentOrigin: "https://evil.example",
				nowMs: NOW_MS,
			}),
		).rejects.toSatisfy((error) => {
			expectMobileSyncError(error, "origin_mismatch");
			return true;
		});
	});

	it("rejects mismatched envelope/plaintext fields and agent private keys", async () => {
		const sync = await createSyncFixture();
		const plaintext: MobileAgentSyncPlaintext = {
			v: 1,
			type: "gatu.mobile-agent",
			syncId: sync.syncId,
			issuerOrigin: APP_ORIGIN,
			env: "Mainnet",
			userAddress: USER_ADDRESS,
			agentAddress: USER_ADDRESS,
			agentPrivateKey: AGENT_PRIVATE_KEY,
			agentNameBase: MOBILE_AGENT_NAME_BASE,
			agentName: sync.agentName,
			agentValidUntilMs: sync.agentValidUntilMs,
			createdAtMs: NOW_MS,
			expiresAtMs: sync.expiresAtMs,
		};

		expect(() =>
			validateMobileAgentSyncPlaintext(plaintext, sync.envelope, {
				currentOrigin: APP_ORIGIN,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncError);

		const mismatchedEnvelope: MobileSyncEnvelope = { ...sync.envelope, syncId: "AAAAAAAAAAAAAAAAAAAAAA" };
		expect(() =>
			validateMobileAgentSyncPlaintext({ ...plaintext, agentAddress: sync.agentAddress }, mismatchedEnvelope, {
				currentOrigin: APP_ORIGIN,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncError);
	});

	it("rejects malformed envelopes", async () => {
		const sync = await createSyncFixture();

		expect(() =>
			parseMobileSyncUrl(
				`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}#${MOBILE_SYNC_FRAGMENT_KEY}=${btoa(JSON.stringify({ ...sync.envelope, cipher: { ...sync.envelope.cipher, iv: "short" } }))}&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${VALID_KEY}`,
			),
		).toThrow(MobileSyncError);
	});
});
