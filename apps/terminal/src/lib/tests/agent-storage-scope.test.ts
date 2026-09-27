// @vitest-environment jsdom

import {
	PERSIST_TRADING_CONNECTION_STORAGE_KEY,
	readAgentFromStorage,
	readPersistTradingConnection,
	removeAgentFromStorageAndVerify,
	writeAgentToStorageAndVerify,
	writePersistTradingConnection,
} from "@gatu/hl-react/signing/agent-storage";
import { createMobileAgentName, MOBILE_AGENT_NAME_BASE } from "@gatu/hl-react/signing/mobile-agent";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER}`;
const REGISTRATION_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;
const PRIVATE_KEY = `0x${"31".repeat(32)}` as `0x${string}`;
const PUBLIC_KEY = privateKeyToAccount(PRIVATE_KEY).address;

describe("Agent storage scope", () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
		window.sessionStorage.clear();
	});

	it("stores an unpersisted trading connection in sessionStorage", () => {
		const result = writeAgentToStorageAndVerify(
			"Mainnet",
			OWNER,
			PRIVATE_KEY,
			PUBLIC_KEY,
			{ source: "local-registration" },
			{ scope: "session" },
		);

		expect(result.status).toBe("stored");
		expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(readAgentFromStorage("Mainnet", OWNER)?.publicKey).toBe(PUBLIC_KEY.toLowerCase());
	});

	it("uses the official persistent-connection preference key", () => {
		expect(readPersistTradingConnection()).toBe(false);
		expect(writePersistTradingConnection(true)).toBe(true);
		expect(window.localStorage.getItem(PERSIST_TRADING_CONNECTION_STORAGE_KEY)).toBe("true");
		expect(readPersistTradingConnection()).toBe(true);
		expect(writePersistTradingConnection(false)).toBe(true);
		expect(window.localStorage.getItem(PERSIST_TRADING_CONNECTION_STORAGE_KEY)).toBe("false");
		expect(readPersistTradingConnection()).toBe(false);
	});

	it("falls back to an unpersisted connection when preference storage is unavailable", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("Storage is unavailable");
		});

		expect(readPersistTradingConnection()).toBe(false);
	});

	it("moves a connection between scopes without leaving a stale key", () => {
		expect(
			writeAgentToStorageAndVerify(
				"Mainnet",
				OWNER,
				PRIVATE_KEY,
				PUBLIC_KEY,
				{ source: "local-registration" },
				{ scope: "session" },
			).status,
		).toBe("stored");

		expect(
			writeAgentToStorageAndVerify(
				"Mainnet",
				OWNER,
				PRIVATE_KEY,
				PUBLIC_KEY,
				{ source: "local-registration" },
				{ scope: "local" },
			).status,
		).toBe("stored");

		expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
		expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("rejects a submission marker that is not bound to an earlier pending marker", () => {
		expect(
			writeAgentToStorageAndVerify("Mainnet", OWNER, PRIVATE_KEY, PUBLIC_KEY, {
				source: "local-registration",
				approvalSubmissionStartedAtMs: Date.now(),
			}),
		).toEqual({ status: "failed", reason: "invalid_agent" });
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("does not expose a pending key when shared cross-tab coordination points elsewhere", () => {
		const approvalPendingAtMs = Date.now();
		expect(
			writeAgentToStorageAndVerify(
				"Mainnet",
				OWNER,
				PRIVATE_KEY,
				PUBLIC_KEY,
				{ source: "local-registration", approvalPendingAtMs },
				{ scope: "session" },
			).status,
		).toBe("stored");
		window.localStorage.setItem(
			REGISTRATION_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
				registrationPublicKey: `0x${"22".repeat(20)}`,
				registrationPendingAtMs: approvalPendingAtMs,
			}),
		);
		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();

		window.localStorage.setItem(
			REGISTRATION_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
				registrationPublicKey: PUBLIC_KEY.toLowerCase(),
				registrationPendingAtMs: approvalPendingAtMs,
			}),
		);
		expect(readAgentFromStorage("Mainnet", OWNER)?.publicKey).toBe(PUBLIC_KEY.toLowerCase());
	});

	it("does not expose a pending key without matching shared coordination", () => {
		expect(
			writeAgentToStorageAndVerify(
				"Mainnet",
				OWNER,
				PRIVATE_KEY,
				PUBLIC_KEY,
				{ source: "local-registration", approvalPendingAtMs: Date.now() },
				{ scope: "session" },
			).status,
		).toBe("stored");

		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();
	});

	it("does not expose a non-pending local Agent while another registration is coordinated", () => {
		expect(
			writeAgentToStorageAndVerify("Mainnet", OWNER, PRIVATE_KEY, PUBLIC_KEY, {
				source: "local-registration",
			}).status,
		).toBe("stored");
		window.localStorage.setItem(
			REGISTRATION_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
				registrationPublicKey: `0x${"22".repeat(20)}`,
				registrationPendingAtMs: Date.now(),
			}),
		);

		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();
	});

	it("does not expose a mobile Agent while a local registration is coordinated", () => {
		const importedAtMs = Date.now();
		const agentValidUntilMs = importedAtMs + 60_000;
		expect(
			writeAgentToStorageAndVerify("Mainnet", OWNER, PRIVATE_KEY, PUBLIC_KEY, {
				source: "mobile-sync",
				agentNameBase: MOBILE_AGENT_NAME_BASE,
				agentName: createMobileAgentName(agentValidUntilMs),
				agentValidUntilMs,
				importedAtMs,
			}).status,
		).toBe("stored");
		window.localStorage.setItem(
			REGISTRATION_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
				registrationPublicKey: `0x${"22".repeat(20)}`,
				registrationPendingAtMs: importedAtMs,
			}),
		);

		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();
	});

	it("requires the local and shared submission boundaries to match exactly", () => {
		const approvalPendingAtMs = Date.now();
		const approvalSubmissionStartedAtMs = approvalPendingAtMs + 1;
		expect(
			writeAgentToStorageAndVerify(
				"Mainnet",
				OWNER,
				PRIVATE_KEY,
				PUBLIC_KEY,
				{ source: "local-registration", approvalPendingAtMs, approvalSubmissionStartedAtMs },
				{ scope: "session" },
			).status,
		).toBe("stored");
		window.localStorage.setItem(
			REGISTRATION_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
				registrationPublicKey: PUBLIC_KEY.toLowerCase(),
				registrationPendingAtMs: approvalPendingAtMs,
			}),
		);

		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();
	});

	it.each([
		{ registrationPublicKey: PUBLIC_KEY.toLowerCase() },
		{ registrationPendingAtMs: 2 },
		{ registrationSubmissionStartedAtMs: 2 },
		{
			registrationPublicKey: PUBLIC_KEY.toLowerCase(),
			registrationPendingAtMs: 2,
			registrationSubmissionStartedAtMs: 1,
		},
	])("does not expose an Agent through malformed shared registration coordination", (coordination) => {
		expect(
			writeAgentToStorageAndVerify("Mainnet", OWNER, PRIVATE_KEY, PUBLIC_KEY, {
				source: "local-registration",
			}).status,
		).toBe("stored");
		window.localStorage.setItem(
			REGISTRATION_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
				...coordination,
			}),
		);

		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();
	});

	it("removes both storage scopes during verified shutdown", () => {
		const serialized = JSON.stringify({
			privateKey: PRIVATE_KEY,
			publicKey: PUBLIC_KEY.toLowerCase(),
			source: "local-registration",
		});
		window.localStorage.setItem(STORAGE_KEY, serialized);
		window.sessionStorage.setItem(STORAGE_KEY, serialized);

		expect(removeAgentFromStorageAndVerify("Mainnet", OWNER)).toEqual({ status: "removed" });
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();
	});
});
