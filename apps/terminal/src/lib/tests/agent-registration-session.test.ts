// @vitest-environment jsdom

import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	ExchangeRequestScheduler,
	type ExchangeRequestStartGate,
} from "@gatu/hl-react/internal/exchange/request-scheduler";
import {
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
