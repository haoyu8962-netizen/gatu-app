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
	MobileSyncCleanNavigationRequiredError,
	MobileSyncError,
	parseMobileSyncUrl,
	readAndClearMobileSyncEnvelope,
	validateMobileAgentSyncPlaintext,
} from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const APP_ORIGIN = "https://app.gatu.test";
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

function createMutableLocation(href: string) {
	const initialUrl = new URL(href);
	const location = {
		href: initialUrl.href,
		pathname: initialUrl.pathname,
		search: initialUrl.search,
		hash: initialUrl.hash,
	};
	const history = {
		replaceState: vi.fn((_data: unknown, _unused: string, nextUrl?: string | URL | null) => {
			if (nextUrl === undefined || nextUrl === null) return;
			const updatedUrl = new URL(String(nextUrl), location.href);
			location.href = updatedUrl.href;
			location.pathname = updatedUrl.pathname;
			location.search = updatedUrl.search;
			location.hash = updatedUrl.hash;
		}),
	};
	return { history, location };
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
		expect(sync.url.length).toBeLessThan(560);
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
		const { history, location } = createMutableLocation(
			`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}?from=qr#${MOBILE_SYNC_FRAGMENT_KEY}=not*base64&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${VALID_KEY}`,
		);
		const navigation = { replace: vi.fn() };

		expect(() => readAndClearMobileSyncEnvelope(location, history, navigation)).toThrow(MobileSyncError);
		expect(history.replaceState).toHaveBeenCalledWith(null, "", `${MOBILE_SYNC_ROUTE_PATH}?from=qr`);
		expect(navigation.replace).not.toHaveBeenCalled();
		expect(location.hash).toBe("");
		expect(getMobileSyncCleanUrl(location)).toBe(`${MOBILE_SYNC_ROUTE_PATH}?from=qr`);
	});

	it.each([
		[
			"fragment",
			`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}?from=qr#${MOBILE_SYNC_FRAGMENT_KEY}=secret-envelope&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=secret-key`,
			`${MOBILE_SYNC_ROUTE_PATH}?from=qr`,
		],
		[
			"query",
			`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}?from=qr&${MOBILE_SYNC_FRAGMENT_KEY}=secret-envelope&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=secret-key`,
			`${MOBILE_SYNC_ROUTE_PATH}?from=qr`,
		],
		[
			"path",
			`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}/${MOBILE_SYNC_FRAGMENT_KEY}=secret-envelope/${MOBILE_SYNC_KEY_FRAGMENT_KEY}=secret-key`,
			MOBILE_SYNC_ROUTE_PATH,
		],
	])("uses a clean full navigation when replaceState silently leaves the %s credential", (_part, href, cleanUrl) => {
		const initialUrl = new URL(href);
		const location = {
			href: initialUrl.href,
			pathname: initialUrl.pathname,
			search: initialUrl.search,
			hash: initialUrl.hash,
		};
		const history = { replaceState: vi.fn() };
		const navigation = { replace: vi.fn() };

		expect(() => readAndClearMobileSyncEnvelope(location, history, navigation)).toThrow(
			MobileSyncCleanNavigationRequiredError,
		);
		expect(navigation.replace).toHaveBeenCalledWith(cleanUrl);
	});

	it("fails closed and requests a clean full navigation when replaceState throws", () => {
		const href = `${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}#${MOBILE_SYNC_FRAGMENT_KEY}=secret-envelope&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=secret-key`;
		const initialUrl = new URL(href);
		const location = {
			href: initialUrl.href,
			pathname: initialUrl.pathname,
			search: initialUrl.search,
			hash: initialUrl.hash,
		};
		const history = {
			replaceState: vi.fn(() => {
				throw new DOMException("blocked", "SecurityError");
			}),
		};
		const navigation = {
			replace: vi.fn(() => {
				throw new DOMException("blocked", "SecurityError");
			}),
		};

		let caught: unknown;
		try {
			readAndClearMobileSyncEnvelope(location, history, navigation);
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(MobileSyncCleanNavigationRequiredError);
		expect((caught as Error).message).not.toContain("secret-envelope");
		expect(navigation.replace).toHaveBeenCalledWith(MOBILE_SYNC_ROUTE_PATH);
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

	it("rejects stale plaintext versions, invalid agent keys, and overlong validity", async () => {
		const sync = await createSyncFixture();
		const plaintext: MobileAgentSyncPlaintext = {
			v: 3,
			issuerOrigin: APP_ORIGIN,
			env: "Mainnet",
			userAddress: USER_ADDRESS,
			agentPrivateKey: AGENT_PRIVATE_KEY,
			agentValidUntilMs: sync.agentValidUntilMs,
		};

		expect(() =>
			validateMobileAgentSyncPlaintext({ ...plaintext, v: 2 }, sync.envelope, {
				currentOrigin: APP_ORIGIN,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncError);

		expect(() =>
			validateMobileAgentSyncPlaintext({ ...plaintext, agentPrivateKey: `0x${"ff".repeat(32)}` }, sync.envelope, {
				currentOrigin: APP_ORIGIN,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncError);

		expect(() =>
			validateMobileAgentSyncPlaintext(
				{
					...plaintext,
					agentValidUntilMs: sync.envelope.createdAtMs + MOBILE_AGENT_VALIDITY_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + 1,
				},
				sync.envelope,
				{ currentOrigin: APP_ORIGIN, nowMs: NOW_MS },
			),
		).toThrow(MobileSyncError);
	});

	it("rejects malformed and legacy-format envelopes", () => {
		// truncated binary payloads and a v1-era JSON envelope ("eyJ2IjoxfQ" = base64url of {"v":1})
		for (const encoded of ["Ag", "eyJ2IjoxfQ", "A".repeat(80)]) {
			expect(() =>
				parseMobileSyncUrl(
					`${APP_ORIGIN}${MOBILE_SYNC_ROUTE_PATH}#${MOBILE_SYNC_FRAGMENT_KEY}=${encoded}&${MOBILE_SYNC_KEY_FRAGMENT_KEY}=${VALID_KEY}`,
				),
			).toThrow(MobileSyncError);
		}
	});
});

it("generates a fresh local sync ID and binds it into authenticated encryption", async () => {
	const first = await createSyncFixture();
	const second = await createSyncFixture();
	expect(first.syncId).toMatch(/^[A-Za-z0-9_-]{21}[AQgw]$/);
	expect(second.syncId).not.toBe(first.syncId);
	expect(first.envelope.syncId).toBe(first.syncId);

	await expect(
		decryptMobileAgentSyncEnvelope({ ...first.envelope, syncId: second.syncId }, first.keyBytes, {
			currentOrigin: APP_ORIGIN,
			expectedEnv: "Mainnet",
			nowMs: NOW_MS,
		}),
	).rejects.toMatchObject({ code: "decrypt_failed" });
});

it("rejects envelopes from the retired ticket protocol with an upgrade error", async () => {
	const sync = await createSyncFixture();
	const url = new URL(sync.url);
	const params = new URLSearchParams(url.hash.slice(1));
	const bytes = Buffer.from(params.get(MOBILE_SYNC_FRAGMENT_KEY) ?? "", "base64url");
	expect(bytes[0]).toBe(3);

	for (const [version, code] of [
		[2, "unsupported_version"],
		[1, "unsupported_version"],
		[0, "invalid_envelope"],
		[4, "invalid_envelope"],
	] as const) {
		bytes[0] = version;
		params.set(MOBILE_SYNC_FRAGMENT_KEY, bytes.toString("base64url"));
		url.hash = params.toString();
		expect(() => parseMobileSyncUrl(url)).toThrow(expect.objectContaining({ code }));
	}
});

it("keeps the envelope usable for two minutes plus clock skew and no longer", async () => {
	expect(MOBILE_SYNC_PAYLOAD_TTL_MS).toBe(2 * 60 * 1000);
	const sync = await createSyncFixture();
	expect(sync.expiresAtMs).toBe(NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS);
	const options = { currentOrigin: APP_ORIGIN, expectedEnv: "Mainnet" as const };

	await expect(
		decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
			...options,
			nowMs: sync.expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS,
		}),
	).resolves.toMatchObject({ syncId: sync.syncId });
	await expect(
		decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
			...options,
			nowMs: sync.expiresAtMs + MOBILE_SYNC_CLOCK_SKEW_MS + 1,
		}),
	).rejects.toMatchObject({ code: "expired_payload" });
	await expect(
		decryptMobileAgentSyncEnvelope({ ...sync.envelope, expiresAtMs: sync.expiresAtMs + 1 }, sync.keyBytes, {
			...options,
			nowMs: NOW_MS,
		}),
	).rejects.toMatchObject({ code: "invalid_envelope" });
});

it("refuses an envelope whose creation time is ahead of this device beyond the clock skew", async () => {
	const sync = await createSyncFixture();
	const options = { currentOrigin: APP_ORIGIN, expectedEnv: "Mainnet" as const };

	await expect(
		decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
			...options,
			nowMs: sync.envelope.createdAtMs - MOBILE_SYNC_CLOCK_SKEW_MS,
		}),
	).resolves.toMatchObject({ syncId: sync.syncId });
	await expect(
		decryptMobileAgentSyncEnvelope(sync.envelope, sync.keyBytes, {
			...options,
			nowMs: sync.envelope.createdAtMs - MOBILE_SYNC_CLOCK_SKEW_MS - 1,
		}),
	).rejects.toMatchObject({ code: "not_yet_valid" });
});
