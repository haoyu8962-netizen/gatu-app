// @vitest-environment jsdom

import {
	type AgentApprovalMutateAsync,
	type AgentApprovalOptions,
	HyperliquidAgentApprovalProvider,
} from "@sairn/hl-react/signing/agent-approval-provider";
import {
	activateAgentRegistrationSession,
	captureAgentRegistrationEpoch,
	captureAgentRegistrationExecutionLease,
	closeAgentRegistrationSessionAndRemove,
	persistAgentForRegistration,
	startAgentRegistrationSubmission,
} from "@sairn/hl-react/signing/agent-registration-session";
import { type AgentRegistrationOptions, useAgentRegistration } from "@sairn/hl-react/signing/use-agent-registration";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER_OWNER = "0x2222222222222222222222222222222222222222";
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER}`;
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;

const testState = vi.hoisted(() => ({
	agentMissingReason: "remote_key_replaced" as "approval_unconfirmed" | "remote_key_replaced",
	approveAgent: vi.fn(),
	approveBuilderFee: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111" as Address | "disconnected",
	coordinatedSubmission: false,
	env: "Mainnet" as "Mainnet" | "Testnet",
	refetchAgent: vi.fn(),
	submissionStarted: true,
	storageInspectionCount: 0,
	storageInspectionMode: "real" as "real" | "failed" | "invalid" | "pending_then_verified",
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		agentName: "sairn",
		builderConfig: {},
		clientKey: testState.clientKey,
		env: testState.env,
	}),
}));

vi.mock("@sairn/hl-react/signing/agent-storage", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@sairn/hl-react/signing/agent-storage")>();
	return {
		...actual,
		inspectAgentStorageRecord: (...args: Parameters<typeof actual.inspectAgentStorageRecord>) => {
			testState.storageInspectionCount += 1;
			if (testState.storageInspectionMode === "failed") {
				return { status: "failed" as const, reason: "storage_unavailable" as const };
			}
			if (testState.storageInspectionMode === "invalid") return { status: "invalid" as const };
			if (testState.storageInspectionMode === "pending_then_verified" && testState.storageInspectionCount === 2) {
				const raw = window.localStorage.getItem(AGENT_STORAGE_KEY);
				if (!raw) throw new Error("Expected pending Agent record");
				const verified = JSON.parse(raw) as Record<string, unknown>;
				delete verified.approvalPendingAtMs;
				window.localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(verified));
			}
			return actual.inspectAgentStorageRecord(...args);
		},
	};
});

vi.mock("@sairn/hl-react/signing/use-agent-status", () => ({
	useAgentStatus: () => ({
		agentAddress: null,
		agentMissingReason: testState.agentMissingReason,
		isLoading: false,
		isReady: false,
		needsAgent: true,
		needsBuilderFee: false,
		refetchAgent: testState.refetchAgent,
		signaturesRequired: 1,
	}),
}));

function deferred<T>() {
	let resolve = (_value: T) => {};
	let reject = (_error: unknown) => {};
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

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

let registrationPromise: Promise<Address> | undefined;
let registrationOptions: AgentRegistrationOptions | undefined;
let resetConnectionPromise: Promise<void> | undefined;

function RegistrationButtonContent() {
	const { agentMissingReason, canResetConnection, error, failurePhase, register, reset, resetConnection } =
		useAgentRegistration();

	return createElement(
		"div",
		null,
		createElement(
			"button",
			{
				onClick: () => {
					registrationPromise = register(registrationOptions);
					registrationPromise.catch(() => {});
				},
				type: "button",
			},
			"Register",
		),
		createElement("button", { onClick: reset, type: "button" }, "Reset"),
		createElement(
			"button",
			{
				onClick: () => {
					resetConnectionPromise = resetConnection();
					resetConnectionPromise.catch(() => {});
				},
				type: "button",
			},
			"Reset Connection",
		),
		createElement("output", { "data-testid": "missing-reason" }, agentMissingReason),
		createElement("output", { "data-testid": "can-reset" }, String(canResetConnection)),
		createElement("output", { "data-testid": "error-name" }, error?.name),
		createElement("output", { "data-testid": "failure-phase" }, failurePhase),
	);
}

function markMockSubmissionStarted(agentAddress: Address): void {
	if (!testState.submissionStarted) return;
	const storage = window.sessionStorage.getItem(AGENT_STORAGE_KEY) ? window.sessionStorage : window.localStorage;
	const raw = storage.getItem(AGENT_STORAGE_KEY);
	if (!raw) throw new Error("Expected pre-saved Agent candidate");
	const agent = JSON.parse(raw) as Record<string, unknown>;
	if (String(agent.publicKey).toLowerCase() !== agentAddress.toLowerCase()) {
		throw new Error("Expected exact pre-saved Agent candidate");
	}
	const submissionStartedAtMs = Date.now();
	agent.approvalSubmissionStartedAtMs = submissionStartedAtMs;
	storage.setItem(AGENT_STORAGE_KEY, JSON.stringify(agent));
	const registration = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
	registration.registrationSubmissionStartedAtMs = submissionStartedAtMs;
	window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(registration));
}

const defaultApproval: AgentApprovalMutateAsync = async (params, _options?: AgentApprovalOptions) => {
	if (testState.coordinatedSubmission) {
		if (testState.clientKey === "disconnected") throw new Error("Expected connected owner");
		const agentAddress = params.agentAddress as Address;
		const lease = captureAgentRegistrationExecutionLease(testState.env, testState.clientKey, {
			agentPublicKey: agentAddress,
		});
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => testState.approveAgent(params),
		);
		if (submission.status !== "started") throw new Error("Agent approval submission was invalidated");
		return submission.execution;
	}
	markMockSubmissionStarted(params.agentAddress as Address);
	return testState.approveAgent(params);
};

function RegistrationButton() {
	return createElement(
		HyperliquidAgentApprovalProvider,
		{ mutateAsync: defaultApproval },
		createElement(RegistrationButtonContent),
	);
}

async function flushMicrotasks() {
	await act(async () => {
		for (let index = 0; index < 12; index += 1) await Promise.resolve();
	});
}

describe("useAgentRegistration logout races", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.useFakeTimers();
		window.localStorage.clear();
		window.sessionStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
				queries: { retry: false },
			},
		});
		registrationPromise = undefined;
		registrationOptions = undefined;
		resetConnectionPromise = undefined;
		testState.clientKey = OWNER;
		testState.agentMissingReason = "remote_key_replaced";
		testState.coordinatedSubmission = false;
		testState.env = "Mainnet";
		testState.approveAgent.mockReset();
		testState.approveBuilderFee.mockReset();
		testState.approveBuilderFee.mockResolvedValue(undefined);
		testState.refetchAgent.mockReset();
		testState.submissionStarted = true;
		testState.storageInspectionCount = 0;
		testState.storageInspectionMode = "real";
		testState.refetchAgent.mockImplementation(async (agentAddressOverride?: Address) => ({
			isAgentReady: !!agentAddressOverride,
			isBuilderFeeReady: true,
			isReady: !!agentAddressOverride,
			needsAgent: !agentAddressOverride,
			needsBuilderFee: false,
			signaturesRequired: agentAddressOverride ? 0 : 1,
		}));
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		window.sessionStorage.clear();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("stores a successfully approved Agent through the verified epoch path", async () => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		if (!registrationPromise) throw new Error("Expected registration promise");
		const registeredAddress = await registrationPromise;
		expect(testState.approveAgent).toHaveBeenCalledWith({
			agentAddress: registeredAddress,
			agentName: "sairn",
		});
		expect(testState.approveBuilderFee).not.toHaveBeenCalled();
		expect(testState.refetchAgent).toHaveBeenLastCalledWith(registeredAddress);
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			publicKey: registeredAddress.toLowerCase(),
			source: "local-registration",
		});
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).not.toHaveProperty(
			"approvalPendingAtMs",
		);
	});

	it("uses the nearest host Agent approval override", async () => {
		const outerApproval = vi.fn().mockResolvedValue(undefined);
		const innerApproval = vi.fn().mockResolvedValue(undefined);
		testState.approveAgent.mockResolvedValue(undefined);

		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(
						HyperliquidAgentApprovalProvider,
						{ mutateAsync: outerApproval },
						createElement(
							HyperliquidAgentApprovalProvider,
							{ mutateAsync: innerApproval },
							createElement(RegistrationButtonContent),
						),
					),
				),
			);
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		if (!registrationPromise) throw new Error("Expected registration promise");
		const registeredAddress = await registrationPromise;
		expect(innerApproval).toHaveBeenCalledWith(
			{
				agentAddress: registeredAddress,
				agentName: "sairn",
			},
			expect.objectContaining({
				registrationPublicKey: registeredAddress,
				signal: expect.any(AbortSignal),
			}),
		);
		expect(outerApproval).not.toHaveBeenCalled();
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("fails closed without a host Agent approval provider", async () => {
		await act(async () => {
			root.render(
				createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButtonContent)),
			);
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("A host Agent approval provider is required");
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(window.sessionStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("forwards a confirmed application review only to the host approval override", async () => {
		registrationOptions = { approval: { applicationReview: "confirmed" } };
		const approval = vi.fn().mockResolvedValue(undefined);
		testState.approveAgent.mockResolvedValue(undefined);

		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(
						HyperliquidAgentApprovalProvider,
						{ mutateAsync: approval },
						createElement(RegistrationButtonContent),
					),
				),
			);
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		if (!registrationPromise) throw new Error("Expected registration promise");
		const registeredAddress = await registrationPromise;
		expect(approval).toHaveBeenCalledWith(
			{
				agentAddress: registeredAddress,
				agentName: "sairn",
			},
			expect.objectContaining({
				applicationReview: "confirmed",
				registrationPublicKey: registeredAddress,
				signal: expect.any(AbortSignal),
			}),
		);
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("does not sign when the initial Agent status cannot be loaded", async () => {
		testState.refetchAgent.mockRejectedValue(new Error("Could not load agent status"));

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Could not load agent status");
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(container.querySelector('[data-testid="failure-phase"]')?.textContent).toBe("preflight");
		expect(container.querySelector('[data-testid="missing-reason"]')?.textContent).toBe("remote_key_replaced");
	});

	it("uses a fresh cross-tab Agent key during the final preflight", async () => {
		const freshPrivateKey = generatePrivateKey();
		const freshPublicKey = privateKeyToAccount(freshPrivateKey).address;

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		window.localStorage.setItem(
			AGENT_STORAGE_KEY,
			JSON.stringify({
				privateKey: freshPrivateKey,
				publicKey: freshPublicKey.toLowerCase(),
				source: "local-registration",
			}),
		);
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).resolves.toBe(freshPublicKey.toLowerCase());
		expect(testState.refetchAgent).toHaveBeenLastCalledWith(freshPublicKey.toLowerCase());
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("drops a stale pending snapshot when another tab verifies the same key during lease capture", async () => {
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		window.localStorage.setItem(
			AGENT_STORAGE_KEY,
			JSON.stringify({
				approvalPendingAtMs: Date.now(),
				privateKey,
				publicKey: publicKey.toLowerCase(),
				source: "local-registration",
			}),
		);
		testState.storageInspectionMode = "pending_then_verified";

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).resolves.toBe(publicKey.toLowerCase());
		expect(testState.refetchAgent).toHaveBeenLastCalledWith(publicKey.toLowerCase());
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("keeps a conflicting pending registration in the preflight phase", async () => {
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
		const replacementKey = privateKeyToAccount(generatePrivateKey()).address;
		const shared = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
		shared.registrationPublicKey = replacementKey.toLowerCase();
		window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(shared));

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("already being established in another tab");
		expect(container.querySelector('[data-testid="failure-phase"]')?.textContent).toBe("preflight");
		expect(container.querySelector('[data-testid="can-reset"]')?.textContent).toBe("false");
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("explicitly resets an orphaned submitted connection before creating a replacement", async () => {
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
			async () => undefined,
		);
		if (submission.status !== "started") throw new Error("Expected started submission");
		await submission.execution;
		window.sessionStorage.clear();

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => container.querySelector<HTMLButtonElement>("button")?.click());
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toThrow("already being established in another tab");
		expect(container.querySelector('[data-testid="can-reset"]')?.textContent).toBe("false");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5 * 60_000);
		});
		act(() => container.querySelector<HTMLButtonElement>("button")?.click());
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toMatchObject({ name: "AgentRegistrationResetRequiredError" });
		expect(container.querySelector('[data-testid="failure-phase"]')?.textContent).toBe("preflight");
		expect(container.querySelector('[data-testid="can-reset"]')?.textContent).toBe("true");

		const resetButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Reset Connection",
		);
		await act(async () => {
			resetButton?.click();
			await resetConnectionPromise;
		});
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({ state: "closed" });

		act(() => container.querySelector<HTMLButtonElement>("button")?.click());
		await flushMicrotasks();
		await expect(registrationPromise).resolves.toMatch(/^0x[0-9a-f]{40}$/i);
		expect(testState.approveAgent).toHaveBeenCalledOnce();
	});

	it("closes the current epoch after an Agent submission marker readback mismatch rolls coordination back", async () => {
		registrationOptions = { persistConnection: false };
		testState.coordinatedSubmission = true;
		testState.approveAgent.mockResolvedValue(undefined);
		const originalGetItem = Storage.prototype.getItem;
		let markerReadbackFailed = false;
		const storageRead = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
			this: Storage,
			key: string,
		) {
			const raw = originalGetItem.call(this, key);
			if (
				!markerReadbackFailed &&
				this === window.sessionStorage &&
				key === AGENT_STORAGE_KEY &&
				raw?.includes('"approvalSubmissionStartedAtMs"')
			) {
				markerReadbackFailed = true;
				return null;
			}
			return raw;
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => container.querySelector<HTMLButtonElement>("button")?.click());
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Agent approval submission state could not be stored safely");
		storageRead.mockRestore();
		expect(markerReadbackFailed).toBe(true);
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(window.sessionStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});
		expect(container.querySelector('[data-testid="failure-phase"]')?.textContent).toBe("approval");
		expect(container.querySelector('[data-testid="can-reset"]')?.textContent).toBe("false");
		expect((await captureAgentRegistrationEpoch("Mainnet", OWNER)).status).toBe("ready");
	});

	it("reconciles the same pending key after an approval response is lost and the hook remounts", async () => {
		registrationOptions = { persistConnection: true };
		const lostResponse = new Error("fetch failed after request submission");
		lostResponse.name = "HttpRequestError";
		testState.approveAgent.mockRejectedValue(lostResponse);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toBe(lostResponse);
		const approvedAddress = testState.approveAgent.mock.calls[0]?.[0]?.agentAddress as Address;
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs: expect.any(Number),
			publicKey: approvedAddress.toLowerCase(),
		});

		act(() => root.unmount());
		root = createRoot(container);
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).resolves.toBe(approvedAddress.toLowerCase());
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).not.toHaveProperty(
			"approvalPendingAtMs",
		);
	});

	it("removes a pre-saved candidate after the owner explicitly rejects approval", async () => {
		registrationOptions = { persistConnection: true };
		testState.submissionStarted = false;
		const rejection = Object.assign(new Error("User rejected the request"), { code: 4001 });
		testState.approveAgent.mockRejectedValue(rejection);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toBe(rejection);
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "closed",
			version: 1,
		});
	});

	it.each([
		["an API error response", Object.assign(new Error("Agent approval rejected"), { name: "ApiRequestError" })],
		[
			"an HTTP 400 response",
			Object.assign(new Error("Bad request"), { name: "HttpRequestError", response: { status: 400 } }),
		],
		[
			"an HTTP 429 response",
			Object.assign(new Error("Rate limited"), { name: "HttpRequestError", response: { status: 429 } }),
		],
	])("removes a submitted candidate after %s definitively rejects it", async (_label, rejection) => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockRejectedValueOnce(rejection).mockResolvedValueOnce(undefined);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toBe(rejection);
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(window.sessionStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();

		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).resolves.toBeDefined();
		expect(testState.approveAgent).toHaveBeenCalledTimes(2);
	});

	it("preserves a submitted candidate after an HTTP 500 leaves the result uncertain", async () => {
		registrationOptions = { persistConnection: true };
		const failure = Object.assign(new Error("Service unavailable"), {
			name: "HttpRequestError",
			response: { status: 500 },
		});
		testState.approveAgent.mockRejectedValue(failure);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toBe(failure);
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs: expect.any(Number),
			approvalSubmissionStartedAtMs: expect.any(Number),
		});
	});

	it("removes an arbitrary pre-submission failure without relying on its error message", async () => {
		registrationOptions = { persistConnection: true };
		testState.submissionStarted = false;
		const legalFailure = new Error("Legal status refresh failed with an implementation-specific cause");
		testState.approveAgent.mockRejectedValue(legalFailure);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toBe(legalFailure);
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(window.sessionStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("does not inherit a host mutation retry policy for wallet approval", async () => {
		queryClient.clear();
		queryClient = new QueryClient({
			defaultOptions: { mutations: { retry: 2 }, queries: { retry: false } },
		});
		testState.submissionStarted = false;
		testState.approveAgent.mockRejectedValue(new Error("Pre-submission failure"));

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Pre-submission failure");
		expect(testState.approveAgent).toHaveBeenCalledOnce();
	});

	it("reconciles a timed-out approval immediately without issuing a second approval", async () => {
		registrationOptions = { persistConnection: true };
		const lateApproval = deferred<void>();
		testState.approveAgent.mockReturnValue(lateApproval.promise);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		const approvedAddress = testState.approveAgent.mock.calls[0]?.[0]?.agentAddress as Address;
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs: expect.any(Number),
			publicKey: approvedAddress.toLowerCase(),
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000);
		});
		await expect(registrationPromise).rejects.toThrow("Wallet approval timed out");

		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).resolves.toBe(approvedAddress.toLowerCase());
		expect(testState.approveAgent).toHaveBeenCalledOnce();

		lateApproval.resolve();
		await flushMicrotasks();
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			publicKey: approvedAddress.toLowerCase(),
		});
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).not.toHaveProperty(
			"approvalPendingAtMs",
		);
	});

	it("does not report success until extraAgents confirms the newly generated public key", async () => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);
		testState.refetchAgent.mockResolvedValue({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		const approvedAddress = testState.approveAgent.mock.calls[0]?.[0]?.agentAddress as Address;
		expect(testState.refetchAgent).toHaveBeenLastCalledWith(approvedAddress);
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs: expect.any(Number),
			publicKey: approvedAddress.toLowerCase(),
		});
	});

	it("keeps an approved key inert when post-approval verification is temporarily unavailable", async () => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);
		testState.refetchAgent.mockImplementation(async (agentAddressOverride?: Address) => {
			if (agentAddressOverride) throw new Error("Could not load agent status");
			return {
				isAgentReady: false,
				isBuilderFeeReady: true,
				isReady: false,
				needsAgent: true,
				needsBuilderFee: false,
				signaturesRequired: 1,
			};
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Could not load agent status");
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-testid="failure-phase"]')?.textContent).toBe("verification");
		const approvedAddress = testState.approveAgent.mock.calls[0]?.[0]?.agentAddress as Address;
		expect(testState.refetchAgent).toHaveBeenLastCalledWith(approvedAddress);
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs: expect.any(Number),
			publicKey: approvedAddress.toLowerCase(),
		});
	});

	it("rechecks an ambiguously approved stored key without creating a replacement Agent", async () => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);
		let verificationAttempts = 0;
		testState.refetchAgent.mockImplementation(async (agentAddressOverride?: Address) => {
			if (!agentAddressOverride) {
				return {
					isAgentReady: false,
					isBuilderFeeReady: true,
					isReady: false,
					needsAgent: true,
					needsBuilderFee: false,
					signaturesRequired: 1,
				};
			}
			verificationAttempts += 1;
			const isReady = verificationAttempts >= 3;
			return {
				isAgentReady: isReady,
				isBuilderFeeReady: true,
				isReady,
				needsAgent: !isReady,
				needsBuilderFee: false,
				signaturesRequired: isReady ? 0 : 1,
			};
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		const approvedAddress = testState.approveAgent.mock.calls[0]?.[0]?.agentAddress as Address;

		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		expect(testState.approveAgent).toHaveBeenCalledOnce();

		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).resolves.toBe(approvedAddress.toLowerCase());
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(testState.refetchAgent).toHaveBeenLastCalledWith(approvedAddress.toLowerCase());
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			publicKey: approvedAddress.toLowerCase(),
		});
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).not.toHaveProperty(
			"approvalPendingAtMs",
		);
	});

	it("reconciles the same ambiguous Agent after the hook is remounted", async () => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);
		testState.refetchAgent.mockResolvedValue({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		const approvedAddress = testState.approveAgent.mock.calls[0]?.[0]?.agentAddress as Address;

		act(() => root.unmount());
		root = createRoot(container);
		testState.refetchAgent.mockImplementation(async (agentAddressOverride?: Address) => ({
			isAgentReady: !!agentAddressOverride,
			isBuilderFeeReady: true,
			isReady: !!agentAddressOverride,
			needsAgent: !agentAddressOverride,
			needsBuilderFee: false,
			signaturesRequired: agentAddressOverride ? 0 : 1,
		}));
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).resolves.toBe(approvedAddress.toLowerCase());
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(testState.refetchAgent).toHaveBeenLastCalledWith(approvedAddress.toLowerCase());
	});

	it("never replaces a submitted Agent solely because remote reconciliation is still missing", async () => {
		registrationOptions = { persistConnection: true };
		testState.agentMissingReason = "approval_unconfirmed";
		testState.approveAgent.mockResolvedValue(undefined);
		testState.refetchAgent.mockResolvedValue({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toHaveProperty("approvalPendingAtMs");
		expect(container.querySelector('[data-testid="can-reset"]')?.textContent).toBe("false");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5 * 60_000);
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		expect(testState.approveAgent).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-testid="can-reset"]')?.textContent).toBe("true");
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			approvalPendingAtMs: expect.any(Number),
			approvalSubmissionStartedAtMs: expect.any(Number),
		});
	});

	it("clears only an expired pending candidate that never reached the submission boundary", async () => {
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		window.localStorage.setItem(
			AGENT_STORAGE_KEY,
			JSON.stringify({
				approvalPendingAtMs: Date.now() - 5 * 60_000,
				privateKey,
				publicKey: publicKey.toLowerCase(),
				source: "local-registration",
			}),
		);
		testState.refetchAgent.mockResolvedValue({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).not.toHaveProperty(
			"approvalPendingAtMs",
		);
	});

	it("preserves an expired pending candidate when another tab submits during reconciliation", async () => {
		registrationOptions = { persistConnection: true };
		const privateKey = generatePrivateKey();
		const publicKey = privateKeyToAccount(privateKey).address;
		const approvalPendingAtMs = Date.now() - 5 * 60_000;
		window.localStorage.setItem(
			AGENT_STORAGE_KEY,
			JSON.stringify({
				approvalPendingAtMs,
				privateKey,
				publicKey: publicKey.toLowerCase(),
				source: "local-registration",
			}),
		);
		const reconciliation = deferred<{
			isAgentReady: boolean;
			isBuilderFeeReady: boolean;
			isReady: boolean;
			needsAgent: boolean;
			needsBuilderFee: boolean;
			signaturesRequired: number;
		}>();
		testState.refetchAgent.mockReturnValue(reconciliation.promise);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		expect(testState.refetchAgent).toHaveBeenCalledWith(publicKey.toLowerCase());

		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER, { agentPublicKey: publicKey });
		if (!lease) throw new Error("Expected exact registration lease");
		const submission = await startAgentRegistrationSubmission(
			lease,
			() => true,
			async () => undefined,
		);
		if (submission.status !== "started") throw new Error("Expected started submission");
		await submission.execution;
		reconciliation.resolve({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		expect(testState.approveAgent).not.toHaveBeenCalled();
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

	it.each([
		["failed", "Agent key storage could not be verified"],
		["invalid", "Stored Agent key is invalid"],
	] as const)("fails closed when an ambiguous Agent storage record is %s", async (mode, expectedError) => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);
		testState.refetchAgent.mockResolvedValue({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		const approvedAddress = testState.approveAgent.mock.calls[0]?.[0]?.agentAddress as Address;

		testState.storageInspectionMode = mode;
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toThrow(expectedError);
		expect(testState.approveAgent).toHaveBeenCalledOnce();

		testState.storageInspectionMode = "real";
		testState.refetchAgent.mockImplementation(async (agentAddressOverride?: Address) => ({
			isAgentReady: !!agentAddressOverride,
			isBuilderFeeReady: true,
			isReady: !!agentAddressOverride,
			needsAgent: !agentAddressOverride,
			needsBuilderFee: false,
			signaturesRequired: agentAddressOverride ? 0 : 1,
		}));
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).resolves.toBe(approvedAddress.toLowerCase());
		expect(testState.approveAgent).toHaveBeenCalledOnce();
	});

	it.each([
		[false, true, "local"],
		[true, false, "session"],
	] as const)(
		"moves an ambiguous Agent from persist=%s to persist=%s before completing verification",
		async (initialPersist, retryPersist, expectedScope) => {
			registrationOptions = { persistConnection: initialPersist };
			testState.approveAgent.mockResolvedValue(undefined);
			let verificationAttempts = 0;
			testState.refetchAgent.mockImplementation(async (agentAddressOverride?: Address) => {
				if (!agentAddressOverride) {
					return {
						isAgentReady: false,
						isBuilderFeeReady: true,
						isReady: false,
						needsAgent: true,
						needsBuilderFee: false,
						signaturesRequired: 1,
					};
				}
				verificationAttempts += 1;
				const isReady = verificationAttempts >= 2;
				return {
					isAgentReady: isReady,
					isBuilderFeeReady: true,
					isReady,
					needsAgent: !isReady,
					needsBuilderFee: false,
					signaturesRequired: isReady ? 0 : 1,
				};
			});

			await act(async () => {
				root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
			});
			act(() => {
				container.querySelector("button")?.click();
			});
			await flushMicrotasks();
			await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");

			registrationOptions = { persistConnection: retryPersist };
			act(() => {
				container.querySelector("button")?.click();
			});
			await flushMicrotasks();
			await expect(registrationPromise).resolves.toBeDefined();
			expect(testState.approveAgent).toHaveBeenCalledOnce();
			expect(window.localStorage.getItem(AGENT_STORAGE_KEY) !== null).toBe(expectedScope === "local");
			expect(window.sessionStorage.getItem(AGENT_STORAGE_KEY) !== null).toBe(expectedScope === "session");
		},
	);

	it.each([
		["network", "Testnet", OWNER],
		["owner", "Mainnet", OTHER_OWNER],
	] as const)(
		"preserves a submitted candidate when the %s changes during an ambiguous retry",
		async (_kind, nextEnv, nextOwner) => {
			registrationOptions = { persistConnection: true };
			testState.approveAgent.mockResolvedValue(undefined);
			testState.refetchAgent.mockResolvedValue({
				isAgentReady: false,
				isBuilderFeeReady: true,
				isReady: false,
				needsAgent: true,
				needsBuilderFee: false,
				signaturesRequired: 1,
			});

			await act(async () => {
				root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
			});
			act(() => {
				container.querySelector("button")?.click();
			});
			await flushMicrotasks();
			await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");

			const retryVerification = deferred<{
				isAgentReady: boolean;
				isBuilderFeeReady: boolean;
				isReady: boolean;
				needsAgent: boolean;
				needsBuilderFee: boolean;
				signaturesRequired: number;
			}>();
			testState.refetchAgent.mockImplementation(async () => retryVerification.promise);
			act(() => {
				container.querySelector("button")?.click();
			});
			await flushMicrotasks();
			const nextRegistration = await captureAgentRegistrationEpoch(nextEnv, nextOwner);
			expect(nextRegistration.status).toBe("ready");
			if (nextRegistration.status !== "ready") throw new Error("Expected next registration epoch");
			const nextPrivateKey = generatePrivateKey();
			const nextPublicKey = privateKeyToAccount(nextPrivateKey).address;
			expect(await persistAgentForRegistration(nextRegistration.epoch, nextPrivateKey, nextPublicKey)).toEqual({
				status: "stored",
			});

			testState.env = nextEnv;
			testState.clientKey = nextOwner;
			await act(async () => {
				root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
			});
			retryVerification.resolve({
				isAgentReady: true,
				isBuilderFeeReady: true,
				isReady: true,
				needsAgent: false,
				needsBuilderFee: false,
				signaturesRequired: 0,
			});
			await flushMicrotasks();

			await expect(registrationPromise).rejects.toThrow("Wallet or network changed during registration");
			expect(testState.approveAgent).toHaveBeenCalledOnce();
			expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
				approvalPendingAtMs: expect.any(Number),
				approvalSubmissionStartedAtMs: expect.any(Number),
			});
			expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
				registrationSubmissionStartedAtMs: expect.any(Number),
				state: "active",
				version: 1,
			});
			const nextAgentStorageKey = `hyperliquid_agent_${nextEnv}_${nextOwner.toLowerCase()}`;
			const nextSessionStorageKey = `hyperliquid_agent_registration_session_${nextEnv}_${nextOwner.toLowerCase()}`;
			expect(JSON.parse(window.localStorage.getItem(nextAgentStorageKey) ?? "{}")).toMatchObject({
				publicKey: nextPublicKey.toLowerCase(),
			});
			expect(container.querySelector('[data-testid="error-name"]')?.textContent).toBe("");
			expect(container.querySelector('[data-testid="failure-phase"]')?.textContent).toBe("");
			expect(container.querySelector('[data-testid="can-reset"]')?.textContent).toBe("false");

			const resetButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
				(button) => button.textContent === "Reset Connection",
			);
			act(() => resetButton?.click());
			await expect(resetConnectionPromise).rejects.toThrow("reset is not currently required");
			expect(JSON.parse(window.localStorage.getItem(nextAgentStorageKey) ?? "{}")).toMatchObject({
				publicKey: nextPublicKey.toLowerCase(),
			});
			expect(JSON.parse(window.localStorage.getItem(nextSessionStorageKey) ?? "{}")).toMatchObject({
				state: "active",
				version: 1,
			});
		},
	);

	it("stores a non-persistent connection only for the current browser session", async () => {
		registrationOptions = { persistConnection: false };
		testState.approveAgent.mockResolvedValue(undefined);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).resolves.toBeDefined();
		expect(window.sessionStorage.getItem(AGENT_STORAGE_KEY)).not.toBeNull();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("reset clears only mutation UI state and preserves the established key", async () => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		if (!registrationPromise) throw new Error("Expected registration promise");
		await registrationPromise;
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).not.toBeNull();

		const resetButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Reset");
		act(() => resetButton?.click());
		await flushMicrotasks();

		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).not.toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "active",
			version: 1,
		});
		expect((await captureAgentRegistrationEpoch("Mainnet", OWNER)).status).toBe("ready");
	});

	it("reset never deletes a submitted candidate whose server result is still uncertain", async () => {
		registrationOptions = { persistConnection: true };
		testState.approveAgent.mockResolvedValue(undefined);
		testState.refetchAgent.mockResolvedValue({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();
		await expect(registrationPromise).rejects.toThrow("Agent approval could not be confirmed");
		const beforeReset = window.localStorage.getItem(AGENT_STORAGE_KEY);
		const coordinationBeforeReset = window.localStorage.getItem(SESSION_STORAGE_KEY);

		const resetButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Reset");
		act(() => resetButton?.click());
		await flushMicrotasks();

		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBe(beforeReset);
		expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe(coordinationBeforeReset);
	});

	it("returns an actionable error without signing when Web Locks are unavailable", async () => {
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow(
			"Secure Agent registration requires Web Locks support. Update your browser and try again.",
		);
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("rejects an in-flight approval after logout closes its persisted epoch", async () => {
		const approval = deferred<void>();
		testState.approveAgent.mockReturnValue(approval.promise);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect((await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER)).status).toBe("closed");

		approval.resolve();
		await flushMicrotasks();

		await expect(registrationPromise).rejects.toThrow("Agent registration session changed");
		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
	});

	it("rejects a timed-out late approval without deleting a newer session's key", async () => {
		const lateApproval = deferred<void>();
		testState.approveAgent.mockReturnValue(lateApproval.promise);

		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(RegistrationButton)));
		});
		act(() => {
			container.querySelector("button")?.click();
		});
		await flushMicrotasks();

		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000);
		});
		await expect(registrationPromise).rejects.toThrow("Wallet approval timed out");

		const shutdown = await closeAgentRegistrationSessionAndRemove("Mainnet", OWNER);
		expect(shutdown.status).toBe("closed");
		if (shutdown.status !== "closed") throw new Error("Expected closed registration session");
		expect(await activateAgentRegistrationSession("Mainnet", OWNER)).toBe(true);
		const newSession = await captureAgentRegistrationEpoch("Mainnet", OWNER);
		expect(newSession.status).toBe("ready");
		if (newSession.status !== "ready") throw new Error("Expected new registration epoch");

		const newPrivateKey = generatePrivateKey();
		const newPublicKey = privateKeyToAccount(newPrivateKey).address;
		expect(await persistAgentForRegistration(newSession.epoch, newPrivateKey, newPublicKey)).toEqual({
			status: "stored",
		});

		lateApproval.resolve();
		await flushMicrotasks();

		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			privateKey: newPrivateKey,
			publicKey: newPublicKey.toLowerCase(),
		});
	});
});
