// @vitest-environment jsdom

import {
	captureAgentRegistrationEpoch,
	captureAgentRegistrationExecutionLease,
	closeAgentRegistrationSessionAndRemove,
	isAgentRegistrationEpochCurrent,
	persistAgentForRegistration,
	startAgentRegistrationSubmission,
} from "@sairn/hl-react/signing/agent-registration-session";
import { clearActiveAgentOwner } from "@sairn/hl-react/signing/agent-session";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;
const NEWER_FIELDS = { storedByVersion: 7, futureCoordination: { lane: "b" } };
const EPOCH = "0123456789abcdef-epoch";
const PUBLIC_KEY = "0x3333333333333333333333333333333333333333";

function installExclusiveLockManager() {
	const queues = new Map<string, Promise<void>>();
	const manager = {
		async request<T>(
			name: string,
			optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
			maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
			if (!callback) throw new Error("Missing lock callback");
			const previous = queues.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			queues.set(
				name,
				previous.then(() => current),
			);
			await previous;
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				release();
			}
		},
	} as unknown as LockManager;

	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

function storedSession(): Record<string, unknown> {
	return JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "null");
}

function addNewerFields(): void {
	window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...storedSession(), ...NEWER_FIELDS }));
}

async function captureEpoch() {
	const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
	if (captured.status !== "ready") throw new Error(`Expected a registration epoch, got ${captured.reason}`);
	return captured.epoch;
}

describe("Agent registration session records written by a newer version", () => {
	beforeEach(() => {
		window.localStorage.clear();
		installExclusiveLockManager();
	});

	afterEach(() => {
		clearActiveAgentOwner();
		window.localStorage.clear();
		vi.restoreAllMocks();
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
	});

	it("writes unknown fields back when the same epoch records its Agent", async () => {
		const epoch = await captureEpoch();
		addNewerFields();
		const privateKey = generatePrivateKey();

		expect(await persistAgentForRegistration(epoch, privateKey, privateKeyToAccount(privateKey).address)).toEqual({
			status: "stored",
		});

		expect(storedSession()).toEqual({ version: 1, epoch: epoch.epoch, state: "active", ...NEWER_FIELDS });
		expect(await isAgentRegistrationEpochCurrent(epoch)).toBe(true);
	});

	it("keeps unknown fields through the pending approval, its resumption and its submission marker", async () => {
		const epoch = await captureEpoch();
		addNewerFields();
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		const approvalPendingAtMs = Date.now();

		expect(
			await persistAgentForRegistration(epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs,
			}),
		).toEqual({ status: "stored" });
		expect(storedSession()).toMatchObject({
			registrationPublicKey: publicKey.toLowerCase(),
			registrationPendingAtMs: approvalPendingAtMs,
			...NEWER_FIELDS,
		});

		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER, { resumePublicKey: publicKey })).toEqual({
			status: "ready",
			epoch,
		});
		expect(storedSession()).toMatchObject(NEWER_FIELDS);

		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => "submitted",
		);
		expect(submission.status).toBe("started");
		expect(storedSession()).toMatchObject({
			registrationSubmissionStartedAtMs: expect.any(Number),
			...NEWER_FIELDS,
		});
	});

	it("does not carry unknown fields over to a new epoch", async () => {
		const epoch = await captureEpoch();
		addNewerFields();

		const next = await captureEpoch();
		expect(next.epoch).not.toBe(epoch.epoch);
		expect(storedSession()).toEqual({ version: 1, epoch: next.epoch, state: "active" });

		addNewerFields();
		const shutdown = await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER);
		expect(shutdown.status).toBe("closed");
		expect(storedSession()).toEqual({
			version: 1,
			epoch: shutdown.status === "closed" ? shutdown.epoch.epoch : undefined,
			state: "closed",
		});
	});

	it.each([
		["a newer record version", { version: 2, epoch: EPOCH, state: "active" }],
		["a short epoch", { version: 1, epoch: "short", state: "active" }],
		["an unknown state", { version: 1, epoch: EPOCH, state: "paused" }],
		[
			"registration metadata on a closed record",
			{ version: 1, epoch: EPOCH, state: "closed", registrationPublicKey: PUBLIC_KEY, registrationPendingAtMs: 5 },
		],
		["a malformed activity marker", { version: 1, epoch: EPOCH, state: "active", registrationActivityAtMs: "soon" }],
		[
			"a submission marker before the pending marker",
			{
				version: 1,
				epoch: EPOCH,
				state: "active",
				registrationPublicKey: PUBLIC_KEY,
				registrationPendingAtMs: 10,
				registrationSubmissionStartedAtMs: 5,
			},
		],
	])("still rejects %s next to unknown fields", async (_label, record) => {
		const serialized = JSON.stringify({ ...record, ...NEWER_FIELDS });
		window.localStorage.setItem(SESSION_STORAGE_KEY, serialized);

		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "invalid_session",
		});
		expect(captureAgentRegistrationExecutionLease("Mainnet", OWNER)).toBeNull();
		expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe(serialized);
	});

	it("does not let an unknown field shadow a validated one", async () => {
		window.localStorage.setItem(SESSION_STORAGE_KEY, `{"__proto__":{"state":"active"},"version":1,"epoch":"${EPOCH}"}`);

		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "invalid_session",
		});

		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			`{"__proto__":{"state":"closed"},"version":1,"epoch":"${EPOCH}","state":"active"}`,
		);
		const epoch = { env: "Mainnet" as const, owner: OWNER as `0x${string}`, epoch: EPOCH };
		const privateKey = generatePrivateKey();

		expect(await persistAgentForRegistration(epoch, privateKey, privateKeyToAccount(privateKey).address)).toEqual({
			status: "stored",
		});
		expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe(
			`{"__proto__":{"state":"closed"},"version":1,"epoch":"${EPOCH}","state":"active"}`,
		);
		expect(await isAgentRegistrationEpochCurrent(epoch)).toBe(true);
	});
});
