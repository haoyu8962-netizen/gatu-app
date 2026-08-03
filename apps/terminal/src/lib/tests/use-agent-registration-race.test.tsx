// @vitest-environment jsdom

import {
	activateAgentRegistrationSession,
	captureAgentRegistrationEpoch,
	closeAgentRegistrationSessionAndRemove,
	persistAgentForRegistration,
} from "@gatu/hl-react/signing/agent-registration-session";
import { useAgentRegistration } from "@gatu/hl-react/signing/use-agent-registration";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER}`;
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;

const testState = vi.hoisted(() => ({
	approveAgent: vi.fn(),
	approveBuilderFee: vi.fn(),
	refetchAgent: vi.fn(),
}));

vi.mock("@gatu/hl-react/provider", () => ({
	useHyperliquid: () => ({
		agentName: "HypeTerminal",
		builderConfig: {},
		clientKey: OWNER,
		env: "Mainnet",
	}),
}));

vi.mock("@gatu/hl-react/hooks/useExchange", () => ({
	useExchange: (method: string) => ({
		mutateAsync: method === "approveAgent" ? testState.approveAgent : testState.approveBuilderFee,
	}),
}));

vi.mock("@gatu/hl-react/signing/use-agent-status", () => ({
	useAgentStatus: () => ({
		agentAddress: null,
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

function RegistrationButton() {
	const { register, reset } = useAgentRegistration();

	return createElement(
		"div",
		null,
		createElement(
			"button",
			{
				onClick: () => {
					registrationPromise = register();
					registrationPromise.catch(() => {});
				},
				type: "button",
			},
			"Register",
		),
		createElement("button", { onClick: reset, type: "button" }, "Reset"),
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
		testState.approveAgent.mockReset();
		testState.approveBuilderFee.mockReset();
		testState.approveBuilderFee.mockResolvedValue(undefined);
		testState.refetchAgent.mockReset();
		testState.refetchAgent.mockResolvedValue({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: true,
			needsBuilderFee: false,
			signaturesRequired: 1,
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("stores a successfully approved Agent through the verified epoch path", async () => {
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
			agentName: "HypeTerminal",
		});
		expect(testState.approveBuilderFee).not.toHaveBeenCalled();
		expect(JSON.parse(window.localStorage.getItem(AGENT_STORAGE_KEY) ?? "{}")).toMatchObject({
			publicKey: registeredAddress.toLowerCase(),
			source: "local-registration",
		});
	});

	it("explicit reset removes the key and restores only its exact closing generation", async () => {
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

		expect(window.localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
		expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}")).toMatchObject({
			state: "active",
			version: 1,
		});
		expect((await captureAgentRegistrationEpoch("Mainnet", OWNER)).status).toBe("ready");
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
