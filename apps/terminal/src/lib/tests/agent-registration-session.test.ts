// @vitest-environment jsdom

import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	ExchangeRequestScheduler,
	type ExchangeRequestStartGate,
} from "@gatu/hl-react/internal/exchange/request-scheduler";
import {
	AgentRegistrationPreExecutionGuardTimeoutError,
	activateAgentOwnerForRegistration,
	activateAgentRegistrationSession,
	cancelAgentRegistrationEpochAndRemove,
	captureAgentRegistrationEpoch,
	captureAgentRegistrationExecutionLease,
	cleanupAgentRegistrationIfMatches,
	closeAgentRegistrationSession,
	closeAgentRegistrationSessionAndRemove,
	isAgentRegistrationEpochCurrent,
	persistAgentForRegistration,
	restoreAgentRegistrationSession,
	startAgentRegistrationExecution,
	startAgentRegistrationSubmission,
	verifyAgentRegistrationOrRemove,
} from "@gatu/hl-react/signing/agent-registration-session";
import {
	clearActiveAgentOwner,
	getActiveAgentOwner,
	setActiveAgentOwnerAndVerify,
} from "@gatu/hl-react/signing/agent-session";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER_OWNER = "0x2222222222222222222222222222222222222222";
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER}`;
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;
const SESSION_LOCK_NAME = `hyperliquid_agent_registration_session:Mainnet:${OWNER}`;
const ACTIVE_OWNER_STORAGE_KEY = "hyperliquid_active_agent_owner";
const ACTIVE_OWNER_LOCK_NAME = `${ACTIVE_OWNER_STORAGE_KEY}:lock`;

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

	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: manager,
	});
}

async function prepareAgentExecutionLease() {
	expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
	const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
	expect(captured.status).toBe("ready");
	if (captured.status !== "ready") throw new Error("Expected registration epoch");

	const privateKey = generatePrivateKey();
	const publicKey = privateKeyToAccount(privateKey).address;
	expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({
		status: "stored",
	});
	expect(await activateAgentOwnerForRegistration(captured.epoch, publicKey)).toEqual({
		status: "current",
	});

	const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, {
		agentPublicKey: publicKey,
		requireActiveOwner: true,
	});
	expect(lease).not.toBeNull();
	if (!lease) throw new Error("Expected execution lease");
	return { lease, privateKey, publicKey };
}

async function prepareUserExecutionLease() {
	await prepareAgentExecutionLease();
	const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER);
	expect(lease).not.toBeNull();
	if (!lease) throw new Error("Expected user execution lease");
	return lease;
}

function createExecutionGate(
	lease: NonNullable<ReturnType<typeof captureAgentRegistrationExecutionLease>>,
): ExchangeRequestStartGate {
	return async (start) => {
		const guarded = await startAgentRegistrationExecution(
			lease,
			() => true,
			() => Promise.resolve(start()),
		);
		return guarded.status === "started" ? await guarded.execution : { status: "invalidated" };
	};
}

describe("Agent registration session coordination", () => {
	beforeEach(() => {
		window.localStorage.clear();
		installExclusiveLockManager();
	});

	afterEach(() => {
		clearActiveAgentOwner();
		window.localStorage.clear();
		vi.restoreAllMocks();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
	});

	it("invalidates a captured epoch and removes its Agent atomically on logout", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");

		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({
			status: "stored",
		});
		expect(await activateAgentOwnerForRegistration(captured.epoch, publicKey)).toEqual({
			status: "current",
		});

		const shutdown = await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER);
		expect(shutdown.status).toBe("closed");
		expect(await isAgentRegistrationEpochCurrent(captured.epoch)).toBe(false);
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});
		expect(getActiveAgentOwner()).toBeNull();
		expect(await activateAgentOwnerForRegistration(captured.epoch, publicKey)).toEqual({
			status: "cancelled",
		});
		expect(getActiveAgentOwner()).toBeNull();
	});

	it("preserves an active Agent owner for a different identity during lifecycle cleanup", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({
			status: "stored",
		});
		expect(setActiveAgentOwnerAndVerify("Mainnet", OTHER_OWNER)).toBe(true);

		expect((await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).status).toBe("closed");
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OTHER_OWNER });
	});

	it("serializes cross-owner cleanup and activation so a newer owner cannot be cleared", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const firstCapture = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(firstCapture.status).toBe("ready");
		if (firstCapture.status !== "ready") throw new Error("Expected first registration epoch");
		const firstPrivateKey = generatePrivateKey();
		const firstPublicKey = privateKeyToAccount(firstPrivateKey).address;
		expect(await persistAgentForRegistration(firstCapture.epoch, firstPrivateKey, firstPublicKey)).toEqual({
			status: "stored",
		});
		expect(await activateAgentOwnerForRegistration(firstCapture.epoch, firstPublicKey)).toEqual({
			status: "current",
		});

		expect(await activateAgentRegistrationSession("Mainnet", OTHER_OWNER)).toBe(true);
		const secondCapture = await captureAgentRegistrationEpoch("Mainnet", OTHER_OWNER);
		expect(secondCapture.status).toBe("ready");
		if (secondCapture.status !== "ready") throw new Error("Expected second registration epoch");
		const secondPrivateKey = generatePrivateKey();
		const secondPublicKey = privateKeyToAccount(secondPrivateKey).address;
		expect(await persistAgentForRegistration(secondCapture.epoch, secondPrivateKey, secondPublicKey)).toEqual({
			status: "stored",
		});

		const [shutdown, activation] = await Promise.all([
			closeAgentRegistrationSessionAndRemove("Mainnet", OWNER),
			activateAgentOwnerForRegistration(secondCapture.epoch, secondPublicKey),
		]);

		expect(shutdown.status).toBe("closed");
		expect(activation).toEqual({ status: "current" });
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(`hyperliquid_agent_Mainnet_${OTHER_OWNER}`) ?? "{}")).toMatchObject({
			privateKey: secondPrivateKey,
			publicKey: secondPublicKey.toLowerCase(),
		});
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OTHER_OWNER });
	});

	it("does not let an old epoch remove a newer session's exact Agent key", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const oldCapture = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(oldCapture.status).toBe("ready");
		if (oldCapture.status !== "ready") throw new Error("Expected old registration epoch");

		const shutdown = await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER);
		expect(shutdown.status).toBe("closed");
		if (shutdown.status !== "closed") throw new Error("Expected closed registration session");
		expect(await restoreAgentRegistrationSession(shutdown.epoch)).toBe(false);
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const newCapture = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(newCapture.status).toBe("ready");
		if (newCapture.status !== "ready") throw new Error("Expected new registration epoch");

		const newPrivateKey = generatePrivateKey();
		const newPublicKey = privateKeyToAccount(newPrivateKey).address;
		expect(await persistAgentForRegistration(newCapture.epoch, newPrivateKey, newPublicKey)).toEqual({
			status: "stored",
		});
		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(true);

		expect(await verifyAgentRegistrationOrRemove(oldCapture.epoch, newPublicKey)).toEqual({
			status: "cancelled",
		});
		expect(await cancelAgentRegistrationEpochAndRemove(oldCapture.epoch, newPublicKey)).toEqual({
			status: "cancelled",
		});
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			privateKey: newPrivateKey,
			publicKey: newPublicKey.toLowerCase(),
		});
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });
		expect(await isAgentRegistrationEpochCurrent(newCapture.epoch)).toBe(true);
	});

	it("does not let a stale public-key cleanup remove or disconnect a newer registration", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const oldCapture = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(oldCapture.status).toBe("ready");
		if (oldCapture.status !== "ready") throw new Error("Expected old registration epoch");

		const oldPrivateKey = generatePrivateKey();
		const oldPublicKey = privateKeyToAccount(oldPrivateKey).address;
		expect(await persistAgentForRegistration(oldCapture.epoch, oldPrivateKey, oldPublicKey)).toEqual({
			status: "stored",
		});

		const newCapture = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(newCapture.status).toBe("ready");
		if (newCapture.status !== "ready") throw new Error("Expected new registration epoch");
		const newPrivateKey = generatePrivateKey();
		const newPublicKey = privateKeyToAccount(newPrivateKey).address;
		expect(await persistAgentForRegistration(newCapture.epoch, newPrivateKey, newPublicKey)).toEqual({
			status: "stored",
		});
		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(true);

		expect(
			await cleanupAgentRegistrationIfMatches("Mainnet", OWNER, {
				kind: "public-key",
				publicKey: oldPublicKey,
			}),
		).toEqual({ status: "skipped" });
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			privateKey: newPrivateKey,
			publicKey: newPublicKey.toLowerCase(),
		});
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });
		expect(await isAgentRegistrationEpochCurrent(newCapture.epoch)).toBe(true);
	});

	it("revalidates an invalid-record cleanup and preserves a newer valid registration", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		window.localStorage.setItem(AGENT_STORAGE_KEY, "{invalid");

		const newCapture = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(newCapture.status).toBe("ready");
		if (newCapture.status !== "ready") throw new Error("Expected new registration epoch");
		const newPrivateKey = generatePrivateKey();
		const newPublicKey = privateKeyToAccount(newPrivateKey).address;
		expect(await persistAgentForRegistration(newCapture.epoch, newPrivateKey, newPublicKey)).toEqual({
			status: "stored",
		});
		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(true);

		expect(
			await cleanupAgentRegistrationIfMatches("Mainnet", OWNER, {
				kind: "invalid-record",
			}),
		).toEqual({ status: "skipped" });
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			privateKey: newPrivateKey,
			publicKey: newPublicKey.toLowerCase(),
		});
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });
		expect(await isAgentRegistrationEpochCurrent(newCapture.epoch)).toBe(true);
	});

	it("does not clear a submitted boundary when its local Agent record becomes invalid", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => undefined,
		);
		if (submission.status !== "started") throw new Error("Expected started submission");
		await submission.execution;
		const shared = window.localStorage.getItem(SESSION_STORAGE_KEY);
		window.localStorage.setItem(AGENT_STORAGE_KEY, "{invalid");

		expect(
			await cleanupAgentRegistrationIfMatches("Mainnet", OWNER, {
				kind: "invalid-record",
			}),
		).toEqual({ status: "skipped" });
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe("{invalid");
		expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe(shared);
		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "registration_reset_required",
		});
	});

	it("atomically removes a matching stale Agent and its active owner", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({
			status: "stored",
		});
		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(true);

		expect(
			await cleanupAgentRegistrationIfMatches("Mainnet", OWNER, {
				kind: "public-key",
				publicKey,
			}),
		).toEqual({ status: "cleaned", activeOwnerCleanupIncomplete: false });
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(getActiveAgentOwner()).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});
	});

	it("rejects persistence when logout closes the captured generation before its write", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");

		expect((await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).status).toBe("closed");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({
			status: "failed",
			reason: "registration_cancelled",
		});
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("preserves validated Mobile Agent metadata through the locked writer", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");

		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		const importedAtMs = 1_779_364_227_000;
		const agentValidUntilMs = importedAtMs + 60_000;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "mobile-sync",
				agentNameBase: "Mobile",
				agentName: `Mobile valid_until ${agentValidUntilMs}`,
				agentValidUntilMs,
				importedAtMs,
				syncId: "mobile-sync-test",
			}),
		).toEqual({ status: "stored" });
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			source: "mobile-sync",
			agentNameBase: "Mobile",
			agentName: `Mobile valid_until ${agentValidUntilMs}`,
			agentValidUntilMs,
			importedAtMs,
			syncId: "mobile-sync-test",
		});
	});

	it("moves a current cancelled import to closed only after verified key removal", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({ status: "stored" });

		expect(await cancelAgentRegistrationEpochAndRemove(captured.epoch, publicKey)).toEqual({
			status: "cancelled",
		});
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});
	});

	it("closes an aborted pre-persistence capture and allows a later capture", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");

		expect(await cancelAgentRegistrationEpochAndRemove(captured.epoch)).toEqual({
			status: "cancelled",
		});
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});
		expect((await captureAgentRegistrationEpoch("Mainnet", OWNER)).status).toBe("ready");
	});

	it("closes the current pre-submission epoch when its exact expected Agent slot is already absent", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		window.localStorage.removeItem(AGENT_STORAGE_KEY);

		expect(
			await cancelAgentRegistrationEpochAndRemove(captured.epoch, publicKey, {
				preserveIfSubmissionStarted: true,
			}),
		).toEqual({ status: "cancelled" });
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});
		expect((await captureAgentRegistrationEpoch("Mainnet", OWNER)).status).toBe("ready");
	});

	it("keeps closing when an absent Agent slot does not match the coordinated cancellation target", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		window.localStorage.removeItem(AGENT_STORAGE_KEY);
		const differentPublicKey = privateKeyToAccount(generatePrivateKey()).address;

		expect(
			await cancelAgentRegistrationEpochAndRemove(captured.epoch, differentPublicKey, {
				preserveIfSubmissionStarted: true,
			}),
		).toEqual({ status: "failed", reason: "unsafe_cleanup_target" });
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closing",
			version: 1,
		});
	});

	it("keeps closing without deleting when the stored key is not the cancellation target", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({ status: "stored" });

		const differentPublicKey = privateKeyToAccount(generatePrivateKey()).address;
		expect(await cancelAgentRegistrationEpochAndRemove(captured.epoch, differentPublicKey)).toEqual({
			status: "failed",
			reason: "unsafe_cleanup_target",
		});
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			privateKey,
			publicKey: publicKey.toLowerCase(),
		});
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closing",
			version: 1,
		});
	});

	it("keeps a closing tombstone when lifecycle cleanup fails without restoration", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({ status: "stored" });

		const originalRemoveItem = Storage.prototype.removeItem;
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
			if (key === AGENT_STORAGE_KEY) throw new Error("remove blocked");
			originalRemoveItem.call(this, key);
		});

		expect(
			await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER, {
				restoreOnFailure: false,
			}),
		).toEqual({ status: "failed", reason: "remove_failed" });
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closing",
			version: 1,
		});
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(false);
	});

	it("allows authenticated activation or capture to reopen a verified closed tombstone", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		expect((await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).status).toBe("closed");
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});

		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		expect((await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).status).toBe("closed");
		expect((await captureAgentRegistrationEpoch("Mainnet", OWNER)).status).toBe("ready");
	});

	it("restores only the exact generation of an unresolved closing tombstone", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		expect(await closeAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const closing = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}") as {
			epoch: string;
			state: string;
		};
		expect(closing.state).toBe("closing");

		expect(
			await restoreAgentRegistrationSession({
				env: "Mainnet",
				owner: OWNER,
				epoch: "22222222-2222-4222-8222-222222222222",
			}),
		).toBe(false);
		expect(
			await restoreAgentRegistrationSession({
				env: "Mainnet",
				owner: OWNER,
				epoch: closing.epoch,
			}),
		).toBe(true);
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "active",
			version: 1,
		});
	});

	it("restores an active generation after explicit logout cleanup fails by default", async () => {
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(await persistAgentForRegistration(captured.epoch, privateKey, publicKey)).toEqual({ status: "stored" });

		const originalRemoveItem = Storage.prototype.removeItem;
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
			if (key === AGENT_STORAGE_KEY) throw new Error("remove blocked");
			originalRemoveItem.call(this, key);
		});

		expect(await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "remove_failed",
		});
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "active",
			version: 1,
		});
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
	});

	it("blocks queued SDK entry when another tab closes the session before its storage event arrives", async () => {
		const { lease } = await prepareAgentExecutionLease();
		const scheduler = new ExchangeRequestScheduler();
		const generation = captureExchangeRequestGeneration("Mainnet", OWNER, "agent-only", {
			registrationEpoch: lease.epoch.epoch,
			agentPublicKey: lease.agentPublicKey,
			activeOwnerActivationEpoch: lease.activeOwner?.activationEpoch,
		});
		let releaseStarted: (() => void) | undefined;
		const startedGate = new Promise<void>((resolve) => {
			releaseStarted = resolve;
		});
		const startedRun = vi.fn(async () => {
			await startedGate;
			return "started";
		});
		const queuedRun = vi.fn(async () => "queued");

		const started = scheduler.schedule("normal", startedRun, generation);
		await vi.waitFor(() => expect(startedRun).toHaveBeenCalledOnce());
		const queued = scheduler.schedule("normal", queuedRun, generation, createExecutionGate(lease));
		const queuedRejection = expect(queued).rejects.toBeInstanceOf(ExchangeRequestInvalidatedError);

		await window.navigator.locks.request(SESSION_LOCK_NAME, { mode: "exclusive" }, () => {
			window.localStorage.setItem(
				SESSION_STORAGE_KEY,
				JSON.stringify({
					version: 1,
					epoch: "22222222-2222-4222-8222-222222222222",
					state: "closing",
				}),
			);
		});

		releaseStarted?.();
		await expect(started).resolves.toBe("started");
		await queuedRejection;
		expect(queuedRun).not.toHaveBeenCalled();
	});

	it("blocks SDK entry when another tab replaces the Agent key without delivering a storage event", async () => {
		const { lease } = await prepareAgentExecutionLease();
		const replacementPrivateKey = generatePrivateKey();
		const replacementPublicKey = privateKeyToAccount(replacementPrivateKey).address;

		await window.navigator.locks.request(SESSION_LOCK_NAME, { mode: "exclusive" }, () => {
			window.localStorage.setItem(
				AGENT_STORAGE_KEY,
				JSON.stringify({
					privateKey: replacementPrivateKey,
					publicKey: replacementPublicKey.toLowerCase(),
					source: "local-registration",
				}),
			);
		});

		const execute = vi.fn(async () => "unexpected");
		expect(await startAgentRegistrationExecution(lease, () => true, execute)).toEqual({
			status: "invalidated",
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("marks the exact pending Agent before starting submission and preserves it during ambiguous cleanup", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		const approvalPendingAtMs = Date.now();
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs,
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		expect(lease).not.toBeNull();
		if (!lease) throw new Error("Expected exact registration lease");

		const execute = vi.fn(async () => "submitted");
		const submission = await startAgentRegistrationSubmission(lease, () => true, execute);
		expect(submission.status).toBe("started");
		if (submission.status !== "started") throw new Error("Expected started submission");
		await expect(submission.execution).resolves.toBe("submitted");
		expect(execute).toHaveBeenCalledOnce();
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs,
			approvalSubmissionStartedAtMs: expect.any(Number),
			publicKey: publicKey.toLowerCase(),
		});

		expect(
			await cancelAgentRegistrationEpochAndRemove(captured.epoch, publicKey, {
				preserveIfSubmissionStarted: true,
			}),
		).toEqual({ status: "current" });
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).not.toBeNull();
		expect(await isAgentRegistrationEpochCurrent(captured.epoch)).toBe(true);
		expect(
			await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER, {
				preserveIfSubmissionStarted: true,
			}),
		).toEqual({ status: "preserved", epoch: captured.epoch });
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).not.toBeNull();
		expect(await isAgentRegistrationEpochCurrent(captured.epoch)).toBe(true);
	});

	it("preserves a submitted Agent when only the shared submission boundary remains readable", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => undefined,
		);
		if (submission.status !== "started") throw new Error("Expected started submission");
		await submission.execution;

		const stored = JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
		delete stored.approvalSubmissionStartedAtMs;
		window.localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(stored));

		expect(
			await cancelAgentRegistrationEpochAndRemove(captured.epoch, publicKey, {
				preserveIfSubmissionStarted: true,
			}),
		).toEqual({ status: "current" });
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).not.toBeNull();
		expect(await isAgentRegistrationEpochCurrent(captured.epoch)).toBe(true);
	});

	it("allows only an explicit exact-key reconciliation to reuse shared pending coordination", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		const approvalPendingAtMs = Date.now();
		expect(
			await persistAgentForRegistration(
				captured.epoch,
				privateKey,
				publicKey,
				{ source: "local-registration", approvalPendingAtMs },
				{ scope: "session" },
			),
		).toEqual({ status: "stored" });

		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "registration_in_progress",
		});
		expect(
			await captureAgentRegistrationEpoch("Mainnet", OWNER, {
				resumePublicKey: publicKey,
			}),
		).toEqual(captured);
		const sharedRecord = window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "";
		expect(sharedRecord).toContain(publicKey.toLowerCase());
		expect(sharedRecord).not.toContain(privateKey.slice(2));

		window.sessionStorage.clear();
		expect(
			await captureAgentRegistrationEpoch("Mainnet", OWNER, {
				resumePublicKey: publicKey,
			}),
		).toEqual({ status: "failed", reason: "registration_in_progress" });
	});

	it("requires an explicit reset when a session-scoped submitted key is lost", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(
				captured.epoch,
				privateKey,
				publicKey,
				{ source: "local-registration", approvalPendingAtMs: Date.now() },
				{ scope: "session" },
			),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => "submitted",
		);
		expect(submission.status).toBe("started");
		if (submission.status !== "started") throw new Error("Expected started submission");
		await expect(submission.execution).resolves.toBe("submitted");

		window.sessionStorage.clear();
		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER, { resumePublicKey: publicKey })).toEqual({
			status: "failed",
			reason: "registration_reset_required",
		});

		expect(await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).toMatchObject({ status: "closed" });
		expect((await captureAgentRegistrationEpoch("Mainnet", OWNER)).status).toBe("ready");
	});

	it("surfaces a reset requirement when submission marker rollback also fails", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");

		const originalSetItem = Storage.prototype.setItem;
		let agentMarkerFailed = false;
		const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
			this: Storage,
			key: string,
			value: string,
		) {
			if (key === AGENT_STORAGE_KEY && value.includes("approvalSubmissionStartedAtMs")) {
				agentMarkerFailed = true;
				throw new Error("Agent marker write blocked");
			}
			if (agentMarkerFailed && key === SESSION_STORAGE_KEY) throw new Error("Coordination rollback blocked");
			originalSetItem.call(this, key, value);
		});
		const execute = vi.fn(async () => "unexpected");
		await expect(startAgentRegistrationSubmission(lease, () => true, execute)).rejects.toThrow(
			"could not be rolled back safely",
		);
		expect(execute).not.toHaveBeenCalled();
		storageWrite.mockRestore();

		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER, { resumePublicKey: publicKey })).toEqual({
			status: "failed",
			reason: "registration_reset_required",
		});
		expect(await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).toMatchObject({ status: "closed" });
	});

	it("treats the shared submission boundary as one-shot and preserves it against a stale pending write", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		const approvalPendingAtMs = Date.now();
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs,
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		expect(lease).not.toBeNull();
		if (!lease) throw new Error("Expected exact registration lease");

		const firstExecute = vi.fn(async () => "submitted");
		const first = await startAgentRegistrationSubmission(lease, () => true, firstExecute);
		expect(first.status).toBe("started");
		if (first.status !== "started") throw new Error("Expected first submission");
		await expect(first.execution).resolves.toBe("submitted");
		const secondExecute = vi.fn(async () => "duplicate");
		expect(await startAgentRegistrationSubmission(lease, () => true, secondExecute)).toEqual({
			status: "invalidated",
		});
		expect(secondExecute).not.toHaveBeenCalled();

		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs,
			}),
		).toEqual({ status: "stored" });
		const stored = JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
		const shared = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
		expect(stored.approvalSubmissionStartedAtMs).toBeTypeOf("number");
		expect(shared.registrationSubmissionStartedAtMs).toBe(stored.approvalSubmissionStartedAtMs);
		vi.spyOn(Date, "now").mockReturnValue(Number(stored.approvalSubmissionStartedAtMs) + 10 * 60_000);
		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "registration_in_progress",
		});
	});

	it("rejects expired-pending cleanup when submission wins the registration lock", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		const approvalPendingAtMs = Date.now() - 5 * 60_000;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs,
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");

		let markLockAcquired = () => {};
		let releaseLock = () => {};
		const lockAcquired = new Promise<void>((resolve) => {
			markLockAcquired = resolve;
		});
		const lockRelease = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const heldLock = window.navigator.locks.request(SESSION_LOCK_NAME, { mode: "exclusive" }, async () => {
			markLockAcquired();
			await lockRelease;
		});
		await lockAcquired;

		const submissionPromise = startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => "submitted",
		);
		const staleCleanupPromise = persistAgentForRegistration(
			captured.epoch,
			privateKey,
			publicKey,
			{ source: "local-registration" },
			{ pendingResolution: "expired-unsubmitted" },
		);
		releaseLock();
		await heldLock;

		const submission = await submissionPromise;
		expect(submission.status).toBe("started");
		if (submission.status !== "started") throw new Error("Expected started submission");
		await expect(submission.execution).resolves.toBe("submitted");
		expect(await staleCleanupPromise).toEqual({ status: "failed", reason: "registration_cancelled" });
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs,
			approvalSubmissionStartedAtMs: expect.any(Number),
			publicKey: publicKey.toLowerCase(),
		});
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			registrationPublicKey: publicKey.toLowerCase(),
			registrationPendingAtMs: approvalPendingAtMs,
			registrationSubmissionStartedAtMs: expect.any(Number),
		});
	});

	it("never lets a different registration entry point replace a submitted local Agent", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => undefined,
		);
		expect(submission.status).toBe("started");
		if (submission.status === "started") await submission.execution;

		const importedPrivateKey = generatePrivateKey();
		const importedPublicKey = privateKeyToAccount(importedPrivateKey).address;
		const importedAtMs = Date.now();
		const agentValidUntilMs = importedAtMs + 60_000;
		expect(
			await persistAgentForRegistration(captured.epoch, importedPrivateKey, importedPublicKey, {
				source: "mobile-sync",
				agentNameBase: "Mobile",
				agentName: `Mobile valid_until ${agentValidUntilMs}`,
				agentValidUntilMs,
				importedAtMs,
				syncId: "different-entry-point",
			}),
		).toEqual({ status: "failed", reason: "registration_in_progress" });
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			privateKey,
			publicKey: publicKey.toLowerCase(),
			approvalSubmissionStartedAtMs: expect.any(Number),
		});
	});

	it("keeps submitted coordination when logout storage cleanup cannot be verified", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => undefined,
		);
		if (submission.status === "started") await submission.execution;

		const originalRemoveItem = Storage.prototype.removeItem;
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
			if (key === AGENT_STORAGE_KEY) throw new Error("remove blocked");
			originalRemoveItem.call(this, key);
		});
		expect(await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "remove_failed",
		});
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "active",
			registrationPublicKey: publicKey.toLowerCase(),
			registrationSubmissionStartedAtMs: expect.any(Number),
		});
		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "registration_reset_required",
		});
	});

	it("invalidates a signed submission boundary when another tab replaced the exact pending key", async () => {
		const captured = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(captured.status).toBe("ready");
		if (captured.status !== "ready") throw new Error("Expected registration epoch");
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		expect(
			await persistAgentForRegistration(captured.epoch, privateKey, publicKey, {
				source: "local-registration",
				approvalPendingAtMs: Date.now(),
			}),
		).toEqual({ status: "stored" });
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		expect(lease).not.toBeNull();
		if (!lease) throw new Error("Expected exact registration lease");

		const replacementPrivateKey = generatePrivateKey();
		const replacementPublicKey = privateKeyToAccount(replacementPrivateKey).address;
		window.localStorage.setItem(
			AGENT_STORAGE_KEY,
			JSON.stringify({
				approvalPendingAtMs: Date.now(),
				privateKey: replacementPrivateKey,
				publicKey: replacementPublicKey.toLowerCase(),
				source: "local-registration",
			}),
		);
		const execute = vi.fn(async () => "unexpected");

		expect(await startAgentRegistrationSubmission(lease, () => true, execute)).toEqual({ status: "invalidated" });
		expect(execute).not.toHaveBeenCalled();
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).not.toHaveProperty(
			"approvalSubmissionStartedAtMs",
		);
	});

	it("runs the pre-execution guard only after acquiring the signing-session lock", async () => {
		const lease = await prepareUserExecutionLease();
		let markLockAcquired = () => {};
		let releaseLock = () => {};
		const lockAcquired = new Promise<void>((resolve) => {
			markLockAcquired = resolve;
		});
		const lockRelease = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const heldLock = window.navigator.locks.request(SESSION_LOCK_NAME, { mode: "exclusive" }, async () => {
			markLockAcquired();
			await lockRelease;
		});
		await lockAcquired;

		let routeAllowed = true;
		const guard = vi.fn(async () => {
			if (!routeAllowed) throw new Error("The withdrawal route changed before signing");
		});
		const execute = vi.fn(async () => "unexpected");
		const execution = startAgentRegistrationExecution(lease, () => true, execute, guard);
		await Promise.resolve();
		expect(guard).not.toHaveBeenCalled();

		routeAllowed = false;
		releaseLock();
		await heldLock;
		await expect(execution).rejects.toThrow("The withdrawal route changed before signing");
		expect(guard).toHaveBeenCalledOnce();
		expect(execute).not.toHaveBeenCalled();
	});

	it("aborts a stalled pre-execution guard and releases the signing-session lock", async () => {
		const lease = await prepareUserExecutionLease();
		vi.useFakeTimers();
		try {
			let guardSignal: AbortSignal | undefined;
			const guard = vi.fn(
				(signal: AbortSignal) =>
					new Promise<void>((_resolve, reject) => {
						guardSignal = signal;
						signal.addEventListener("abort", () => reject(signal.reason), { once: true });
					}),
			);
			const execute = vi.fn(async () => "unexpected");
			const execution = startAgentRegistrationExecution(lease, () => true, execute, guard);
			await vi.advanceTimersByTimeAsync(0);
			expect(guard).toHaveBeenCalledOnce();

			const rejection = expect(execution).rejects.toBeInstanceOf(AgentRegistrationPreExecutionGuardTimeoutError);
			await vi.advanceTimersByTimeAsync(10_000);
			await rejection;
			expect(guardSignal?.aborted).toBe(true);
			expect(execute).not.toHaveBeenCalled();

			await expect(window.navigator.locks.request(SESSION_LOCK_NAME, { mode: "exclusive" }, () => true)).resolves.toBe(
				true,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("revalidates the execution lease after an asynchronous pre-execution guard", async () => {
		const lease = await prepareUserExecutionLease();
		let markGuardStarted = () => {};
		let releaseGuard = () => {};
		const guardStarted = new Promise<void>((resolve) => {
			markGuardStarted = resolve;
		});
		const guardRelease = new Promise<void>((resolve) => {
			releaseGuard = resolve;
		});
		const guard = vi.fn(async () => {
			markGuardStarted();
			await guardRelease;
		});
		const execute = vi.fn(async () => "unexpected");
		const execution = startAgentRegistrationExecution(lease, () => true, execute, guard);
		await guardStarted;

		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				epoch: "55555555-5555-4555-8555-555555555555",
				state: "active",
			}),
		);
		releaseGuard();

		await expect(execution).resolves.toEqual({ status: "invalidated" });
		expect(guard).toHaveBeenCalledOnce();
		expect(execute).not.toHaveBeenCalled();
	});

	it("rejects pre-execution guards for active Agent-owner leases", async () => {
		const { lease } = await prepareAgentExecutionLease();
		const guard = vi.fn(async () => {});
		const execute = vi.fn(async () => "unexpected");

		await expect(startAgentRegistrationExecution(lease, () => true, execute, guard)).rejects.toThrow(
			"Pre-execution guards cannot run with an active Agent-owner execution lease",
		);
		expect(guard).not.toHaveBeenCalled();
		expect(execute).not.toHaveBeenCalled();
	});

	it("blocks an old owner lease after a cross-tab A-to-B-to-A activation cycle", async () => {
		const { lease } = await prepareAgentExecutionLease();
		const current = JSON.parse(window.localStorage.getItem(ACTIVE_OWNER_STORAGE_KEY) ?? "null") as Record<
			string,
			unknown
		>;
		expect(current.activationEpoch).toEqual(lease.activeOwner?.activationEpoch);

		await window.navigator.locks.request(ACTIVE_OWNER_LOCK_NAME, { mode: "exclusive" }, () => {
			window.localStorage.setItem(
				ACTIVE_OWNER_STORAGE_KEY,
				JSON.stringify({
					version: 1,
					env: "Mainnet",
					address: OTHER_OWNER,
					activationEpoch: "33333333-3333-4333-8333-333333333333",
				}),
			);
			window.localStorage.setItem(
				ACTIVE_OWNER_STORAGE_KEY,
				JSON.stringify({
					version: 1,
					env: "Mainnet",
					address: OWNER,
					activationEpoch: "44444444-4444-4444-8444-444444444444",
				}),
			);
		});

		const execute = vi.fn(async () => "unexpected");
		expect(await startAgentRegistrationExecution(lease, () => true, execute)).toEqual({
			status: "invalidated",
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("fails closed instead of silently racing when Web Locks are unavailable", async () => {
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});

		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "lock_unavailable",
		});
		expect(await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "lock_unavailable",
		});
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("fails closed without overwriting a malformed persisted epoch", async () => {
		window.localStorage.setItem(SESSION_STORAGE_KEY, '{"version":1,"epoch":"","state":"active"}');

		expect(await captureAgentRegistrationEpoch("Mainnet", OWNER)).toEqual({
			status: "failed",
			reason: "invalid_session",
		});
		expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe('{"version":1,"epoch":"","state":"active"}');
	});
});
