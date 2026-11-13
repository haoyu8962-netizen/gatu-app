// @vitest-environment jsdom

import {
	hasInvalidAgentStorageRecord,
	inspectAgentStorageRecord,
	markAgentApprovalSubmissionStartedAndVerify,
	readAgentFromStorage,
	writeAgentToStorage,
	writeAgentToStorageAndVerify,
} from "@sairn/hl-react/signing/agent-storage";
import { createMobileAgentName, MOBILE_AGENT_NAME_BASE } from "@sairn/hl-react/signing/mobile-agent";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER}`;
const PRIVATE_KEY = `0x${"31".repeat(32)}` as `0x${string}`;
const PUBLIC_KEY = privateKeyToAccount(PRIVATE_KEY).address.toLowerCase();
const OTHER_PRIVATE_KEY = `0x${"42".repeat(32)}` as `0x${string}`;
const OTHER_PUBLIC_KEY = privateKeyToAccount(OTHER_PRIVATE_KEY).address.toLowerCase();
const NEWER_FIELDS = { storedByVersion: 7, futureFlags: { pinned: true } };
const VALID_UNTIL_MS = 1_900_000_000_000;

function store(record: Record<string, unknown>, storage: Storage = window.localStorage): void {
	storage.setItem(STORAGE_KEY, JSON.stringify(record));
}

function stored(storage: Storage = window.localStorage): Record<string, unknown> {
	return JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
}

const localRecord = {
	privateKey: PRIVATE_KEY,
	publicKey: PUBLIC_KEY,
	source: "local-registration",
};

const mobileRecord = {
	privateKey: PRIVATE_KEY,
	publicKey: PUBLIC_KEY,
	source: "mobile-sync",
	agentNameBase: MOBILE_AGENT_NAME_BASE,
	agentName: createMobileAgentName(VALID_UNTIL_MS),
	agentValidUntilMs: VALID_UNTIL_MS,
	importedAtMs: VALID_UNTIL_MS - 1_000,
};

describe("Agent storage records written by a newer version", () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});

	it.each([
		["a locally registered Agent", localRecord],
		["a legacy Agent without a source", { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY }],
		["a linked mobile Agent", mobileRecord],
	])("keeps %s that carries fields this version does not know", (_label, record) => {
		store({ ...record, ...NEWER_FIELDS });

		expect(hasInvalidAgentStorageRecord("Mainnet", OWNER)).toBe(false);
		expect(inspectAgentStorageRecord("Mainnet", OWNER)).toEqual({ status: "valid", agent: record });
		expect(readAgentFromStorage("Mainnet", OWNER)).toEqual(record);
	});

	it.each([
		["an unknown source", { ...localRecord, source: "future-source" }],
		["a key pair mismatch", { ...localRecord, publicKey: OTHER_PUBLIC_KEY }],
		["a malformed private key", { ...localRecord, privateKey: "0x1234" }],
		["a malformed public key", { ...localRecord, publicKey: "0x1234" }],
		["mobile metadata on a local Agent", { ...localRecord, agentName: "Mobile QR" }],
		["approval metadata on a mobile Agent", { ...mobileRecord, approvalPendingAtMs: 1 }],
		["a mobile Agent without its expiry", { ...mobileRecord, agentValidUntilMs: undefined }],
		["a non-canonical mobile name", { ...mobileRecord, agentName: "Mobile QR" }],
		["a submission marker without a pending marker", { ...localRecord, approvalSubmissionStartedAtMs: 5 }],
	])("still rejects %s next to unknown fields", (_label, record) => {
		store({ ...record, ...NEWER_FIELDS });

		expect(hasInvalidAgentStorageRecord("Mainnet", OWNER)).toBe(true);
		expect(inspectAgentStorageRecord("Mainnet", OWNER)).toEqual({ status: "invalid" });
		expect(readAgentFromStorage("Mainnet", OWNER)).toBeNull();
	});

	it("does not let an unknown field shadow a validated one", () => {
		window.localStorage.setItem(
			STORAGE_KEY,
			`{"__proto__":{"source":"mobile-sync"},"privateKey":"${PRIVATE_KEY}","publicKey":"${PUBLIC_KEY}","source":"local-registration"}`,
		);

		expect(readAgentFromStorage("Mainnet", OWNER)).toEqual(localRecord);
		expect(Object.getPrototypeOf(readAgentFromStorage("Mainnet", OWNER))).toBe(Object.prototype);
	});

	it("writes unknown fields back when the approval submission is marked", () => {
		store({ ...localRecord, approvalPendingAtMs: 100, ...NEWER_FIELDS });

		const result = markAgentApprovalSubmissionStartedAndVerify("Mainnet", OWNER, PUBLIC_KEY as `0x${string}`, 200);

		expect(result).toEqual({
			status: "stored",
			agent: { ...localRecord, approvalPendingAtMs: 100, approvalSubmissionStartedAtMs: 200 },
		});
		expect(stored()).toEqual({
			...localRecord,
			approvalPendingAtMs: 100,
			approvalSubmissionStartedAtMs: 200,
			...NEWER_FIELDS,
		});
	});

	it("keeps unknown fields when the same Agent is rewritten in another scope", () => {
		store({ ...localRecord, approvalPendingAtMs: 100, ...NEWER_FIELDS });

		const result = writeAgentToStorageAndVerify(
			"Mainnet",
			OWNER,
			PRIVATE_KEY,
			PUBLIC_KEY,
			{ source: "local-registration" },
			{ scope: "session" },
		);

		expect(result).toEqual({ status: "stored", agent: localRecord });
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(stored(window.sessionStorage)).toEqual({ ...localRecord, ...NEWER_FIELDS });
	});

	it("keeps unknown fields through the unverified writer for the same Agent", () => {
		store({ ...localRecord, ...NEWER_FIELDS });

		writeAgentToStorage("Mainnet", OWNER, PRIVATE_KEY, PUBLIC_KEY, { source: "local-registration" });

		expect(stored()).toEqual({ ...localRecord, ...NEWER_FIELDS });
	});

	it("does not carry unknown fields over to a different Agent", () => {
		store({ ...localRecord, ...NEWER_FIELDS });

		const result = writeAgentToStorageAndVerify("Mainnet", OWNER, OTHER_PRIVATE_KEY, OTHER_PUBLIC_KEY, {
			source: "local-registration",
		});

		expect(result.status).toBe("stored");
		expect(stored()).toEqual({
			privateKey: OTHER_PRIVATE_KEY,
			publicKey: OTHER_PUBLIC_KEY,
			source: "local-registration",
		});
	});

	it("does not carry unknown fields over when the same key changes source", () => {
		store({ privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY, ...NEWER_FIELDS });

		writeAgentToStorageAndVerify("Mainnet", OWNER, PRIVATE_KEY, PUBLIC_KEY, { source: "local-registration" });

		expect(stored()).toEqual(localRecord);
	});
});
