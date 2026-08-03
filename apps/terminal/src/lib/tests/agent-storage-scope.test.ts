// @vitest-environment jsdom

import {
	PERSIST_TRADING_CONNECTION_STORAGE_KEY,
	readAgentFromStorage,
	readPersistTradingConnection,
	removeAgentFromStorageAndVerify,
	writeAgentToStorageAndVerify,
	writePersistTradingConnection,
} from "@gatu/hl-react/signing/agent-storage";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER}`;
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
