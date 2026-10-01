import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
	createMobileAgentSyncUrl,
	isMobileSyncPayloadExpired,
	MOBILE_SYNC_CLOCK_SKEW_MS,
	MOBILE_SYNC_PAYLOAD_TTL_MS,
	MOBILE_SYNC_ROUTE_PATH,
	MobileSyncError,
	parseMobileSyncFragment,
	parseMobileSyncUrl,
} from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const ORIGIN = "https://app.sairn.test";
const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
const AGENT_VALID_UNTIL_MS = NOW_MS + 30 * 24 * 60 * 60 * 1000;

function createLink(overrides: Partial<Parameters<typeof createMobileAgentSyncUrl>[0]> = {}) {
	return createMobileAgentSyncUrl({
		appOrigin: ORIGIN,
		env: "Mainnet",
		userAddress: USER_ADDRESS,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		agentValidUntilMs: AGENT_VALID_UNTIL_MS,
		nowMs: NOW_MS,
		...overrides,
	});
}

function encodeFragment(wire: Record<string, unknown>) {
	return `#sairn-mobile-sync=${Buffer.from(JSON.stringify(wire)).toString("base64url")}`;
}

function rejectionCode(run: () => unknown) {
	try {
		run();
	} catch (error) {
		if (error instanceof MobileSyncError) return error.code;
		throw error;
	}
	throw new Error("expected the payload to be rejected");
}

const VALID_WIRE = {
	v: 4,
	env: "Mainnet",
	owner: USER_ADDRESS,
	key: AGENT_PRIVATE_KEY,
	validUntil: AGENT_VALID_UNTIL_MS,
	createdAt: NOW_MS,
	expiresAt: NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS,
};

describe("mobile sync core", () => {
	it("puts a plain payload in the fragment of the pairing route and parses it back", () => {
		const { url, payload } = createLink();
		const parsedUrl = new URL(url);

		expect(parsedUrl.origin).toBe(ORIGIN);
		expect(parsedUrl.pathname).toBe(MOBILE_SYNC_ROUTE_PATH);
		expect(parsedUrl.search).toBe("");
		expect(parsedUrl.hash.startsWith("#sairn-mobile-sync=")).toBe(true);
		expect(parsedUrl.hash).not.toContain("k=");

		const imported = parseMobileSyncUrl(url, { expectedEnv: "Mainnet", nowMs: NOW_MS + 5_000 });
		expect(imported).toEqual(payload);
		expect(imported).toEqual({
			env: "Mainnet",
			userAddress: USER_ADDRESS,
			agentAddress: privateKeyToAccount(AGENT_PRIVATE_KEY).address.toLowerCase(),
			agentPrivateKey: AGENT_PRIVATE_KEY,
			agentNameBase: "Mobile",
			agentName: `Mobile valid_until ${AGENT_VALID_UNTIL_MS}`,
			agentValidUntilMs: AGENT_VALID_UNTIL_MS,
			createdAtMs: NOW_MS,
			expiresAtMs: NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS,
		});
	});

	it("rejects another network, a missing fragment, a query-string link and legacy fragments", () => {
		const { url } = createLink();

		expect(rejectionCode(() => parseMobileSyncUrl(url, { expectedEnv: "Testnet", nowMs: NOW_MS }))).toBe(
			"env_mismatch",
		);
		expect(rejectionCode(() => parseMobileSyncFragment("#", { nowMs: NOW_MS }))).toBe("missing_fragment");
		expect(rejectionCode(() => parseMobileSyncUrl(`${ORIGIN}/trade?link=abc`, { nowMs: NOW_MS }))).toBe(
			"missing_fragment",
		);
		expect(rejectionCode(() => parseMobileSyncFragment("#sairn-mobile-sync=abc&k=def", { nowMs: NOW_MS }))).toBe(
			"unsupported_version",
		);
		expect(
			rejectionCode(() => parseMobileSyncFragment(encodeFragment({ ...VALID_WIRE, v: 3 }), { nowMs: NOW_MS })),
		).toBe("unsupported_version");
	});

	it("rejects malformed payloads before deriving anything from them", () => {
		expect(rejectionCode(() => parseMobileSyncFragment("#sairn-mobile-sync=%%%", { nowMs: NOW_MS }))).toBe(
			"invalid_payload",
		);
		for (const wire of [
			{ ...VALID_WIRE, owner: "not-an-address" },
			{ ...VALID_WIRE, key: "0x1234" },
			{ ...VALID_WIRE, env: "Devnet" },
			{ ...VALID_WIRE, validUntil: NOW_MS + 31 * 24 * 60 * 60 * 1000 },
			{ ...VALID_WIRE, expiresAt: NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + 1 },
			{ ...VALID_WIRE, expiresAt: NOW_MS },
			{ ...VALID_WIRE, createdAt: "soon" },
		]) {
			expect(rejectionCode(() => parseMobileSyncFragment(encodeFragment(wire), { nowMs: NOW_MS }))).toBe(
				"invalid_payload",
			);
		}
	});

	it("keeps the payload usable for two minutes plus clock skew and no longer", () => {
		const { url, payload } = createLink();
		const lastValidMs = NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS;

		expect(parseMobileSyncUrl(url, { nowMs: lastValidMs })).toEqual(payload);
		expect(isMobileSyncPayloadExpired(payload, lastValidMs)).toBe(false);
		expect(rejectionCode(() => parseMobileSyncUrl(url, { nowMs: lastValidMs + 1 }))).toBe("expired_payload");
		expect(isMobileSyncPayloadExpired(payload, lastValidMs + 1)).toBe(true);
	});

	it("refuses a payload created ahead of this device beyond the clock skew", () => {
		const { url, payload } = createLink();

		expect(parseMobileSyncUrl(url, { nowMs: NOW_MS - MOBILE_SYNC_CLOCK_SKEW_MS })).toEqual(payload);
		expect(rejectionCode(() => parseMobileSyncUrl(url, { nowMs: NOW_MS - MOBILE_SYNC_CLOCK_SKEW_MS - 1 }))).toBe(
			"not_yet_valid",
		);
	});
});
