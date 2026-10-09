// @vitest-environment jsdom

import type { UserRoleResponse } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	userRole: vi.fn(),
	localAgent: {
		privateKey: `0x${"ab".repeat(32)}`,
		publicKey: "0x2222222222222222222222222222222222222222",
		source: "local-registration" as const,
	} as { privateKey: `0x${string}`; publicKey: `0x${string}`; source: "local-registration" } | null,
}));

const transport = vi.hoisted(() => ({
	env: "Mainnet" as const,
	isTestnet: false,
	info: { userRole: (...args: unknown[]) => testState.userRole(...args) },
	subscription: {},
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		env: transport.env,
		builderConfig: undefined,
		clientKey: OWNER,
		info: transport.info,
	}),
}));

vi.mock("@sairn/hl-react/transport-provider", () => ({
	useHyperliquidTransport: () => transport,
}));

vi.mock("@sairn/hl-react/signing/agent-storage", () => ({
	readAgentFromStorage: () => testState.localAgent,
	useAgentWalletStorage: () => testState.localAgent,
	useInvalidAgentStorageRecord: () => false,
}));

import { infoKey } from "@sairn/hl-react/query/info";
import { useAgentStatus } from "@sairn/hl-react/signing/use-agent-status";

const KEY = infoKey("userRole", { user: AGENT }, "Mainnet");

function agentRole(user: string): UserRoleResponse {
	return { role: "agent", data: { user: user as `0x${string}` } };
}

function deferred<T>() {
	let resolve = (_value: T) => {};
	let reject = (_error: unknown) => {};
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

let observedStatus: ReturnType<typeof useAgentStatus> | undefined;

function Probe() {
	const status = useAgentStatus();
	observedStatus = status;
	return createElement("output", { "data-status": status.agentVerificationStatus });
}

describe("useAgentStatus with the real query cache", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;
	let queryClient: QueryClient;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		testState.userRole.mockReset();
		testState.localAgent = {
			privateKey: `0x${"ab".repeat(32)}`,
			publicKey: AGENT,
			source: "local-registration",
		};
		observedStatus = undefined;
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
	});

	function renderProbe(client = queryClient) {
		act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
		return container.querySelector("output");
	}

	async function waitForStatus(status: string) {
		await vi.waitFor(() => expect(container.querySelector("output")?.getAttribute("data-status")).toBe(status));
	}

	it("sends a new userRole request for the post-approval check even while the hook's miss is still fresh", async () => {
		testState.userRole.mockResolvedValueOnce({ role: "missing" });
		renderProbe();
		await waitForStatus("missing");
		expect(testState.userRole).toHaveBeenCalledTimes(1);

		testState.userRole.mockResolvedValue(agentRole(OWNER));
		await expect(observedStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: true, needsAgent: false });
		expect(testState.userRole).toHaveBeenCalledTimes(2);
		expect(queryClient.getQueryData(KEY)).toEqual(agentRole(OWNER));
		await waitForStatus("ready");
	});

	it("does not reuse an answer that was already in flight when the approval completed", async () => {
		const stale = deferred<UserRoleResponse>();
		testState.userRole.mockReturnValueOnce(stale.promise).mockResolvedValue(agentRole(OWNER));
		renderProbe();
		await vi.waitFor(() => expect(testState.userRole).toHaveBeenCalledTimes(1));
		setTimeout(() => stale.resolve({ role: "missing" }), 50);

		await expect(observedStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: true, needsAgent: false });
		expect(testState.userRole).toHaveBeenCalledTimes(2);
		await waitForStatus("ready");
		await new Promise((resolve) => setTimeout(resolve, 80));
		expect(queryClient.getQueryData(KEY)).toEqual(agentRole(OWNER));
		expect(container.querySelector("output")?.getAttribute("data-status")).toBe("ready");
	});

	it("hands an overtaken check the newest answer and keeps that answer in the cache", async () => {
		const first = deferred<UserRoleResponse>();
		testState.userRole
			.mockResolvedValueOnce({ role: "missing" })
			.mockReturnValueOnce(first.promise)
			.mockResolvedValue(agentRole(OWNER));
		renderProbe();
		await waitForStatus("missing");

		let firstSettled = false;
		const firstCheck = observedStatus?.refetchAgent(AGENT).finally(() => {
			firstSettled = true;
		});
		await vi.waitFor(() => expect(testState.userRole).toHaveBeenCalledTimes(2));
		await expect(observedStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: true, needsAgent: false });
		expect(testState.userRole).toHaveBeenCalledTimes(3);
		expect(firstSettled).toBe(false);
		expect(queryClient.getQueryData(KEY)).toEqual(agentRole(OWNER));
		await waitForStatus("ready");

		first.resolve({ role: "missing" });
		await expect(firstCheck).resolves.toMatchObject({ isAgentReady: true, needsAgent: false });
		expect(queryClient.getQueryData(KEY)).toEqual(agentRole(OWNER));
		expect(container.querySelector("output")?.getAttribute("data-status")).toBe("ready");
	});

	it("gives an overtaken check the later answer that found the key gone, not its own stale approval", async () => {
		const first = deferred<UserRoleResponse>();
		testState.userRole
			.mockResolvedValueOnce(agentRole(OWNER))
			.mockReturnValueOnce(first.promise)
			.mockResolvedValue({ role: "missing" });
		renderProbe();
		await waitForStatus("ready");

		const firstCheck = observedStatus?.refetchAgent(AGENT);
		await vi.waitFor(() => expect(testState.userRole).toHaveBeenCalledTimes(2));
		await expect(observedStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: false, needsAgent: true });
		await waitForStatus("missing");

		first.resolve(agentRole(OWNER));
		await expect(firstCheck).resolves.toMatchObject({ isAgentReady: false, needsAgent: true });
		expect(queryClient.getQueryData(KEY)).toEqual({ role: "missing" });
		expect(container.querySelector("output")?.getAttribute("data-status")).toBe("missing");
	});

	it("gives an overtaken check whose own request failed the newest answer", async () => {
		const first = deferred<UserRoleResponse>();
		testState.userRole
			.mockResolvedValueOnce({ role: "missing" })
			.mockReturnValueOnce(first.promise)
			.mockResolvedValue(agentRole(OWNER));
		renderProbe();
		await waitForStatus("missing");

		const firstCheck = observedStatus?.refetchAgent(AGENT);
		await vi.waitFor(() => expect(testState.userRole).toHaveBeenCalledTimes(2));
		await expect(observedStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: true });
		first.reject(Object.assign(new Error("Service unavailable"), { response: { status: 503 } }));
		await expect(firstCheck).resolves.toMatchObject({ isAgentReady: true, needsAgent: false });
		await waitForStatus("ready");
	});

	it("fails every waiting check when the newest check fails, and resets the cached approval", async () => {
		const cause = Object.assign(new Error("Service unavailable"), { response: { status: 503 } });
		const first = deferred<UserRoleResponse>();
		testState.userRole
			.mockResolvedValueOnce(agentRole(OWNER))
			.mockReturnValueOnce(first.promise)
			.mockRejectedValue(cause);
		renderProbe();
		await waitForStatus("ready");

		const firstCheck = observedStatus?.refetchAgent(AGENT);
		await vi.waitFor(() => expect(testState.userRole).toHaveBeenCalledTimes(2));
		await expect(observedStatus?.refetchAgent(AGENT)).rejects.toMatchObject({ name: "AgentStatusError", cause });
		expect(queryClient.getQueryData(KEY)).toBeUndefined();
		await vi.waitFor(() => expect(container.querySelector("output")?.getAttribute("data-status")).not.toBe("ready"));
		first.resolve(agentRole(OWNER));
		await expect(firstCheck).rejects.toMatchObject({ name: "AgentStatusError", cause });
		await waitForStatus("error");
		expect(observedStatus?.isAgentReady).toBe(false);
	});

	it("keeps the definitive checks of separate QueryClients apart", async () => {
		const otherClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const otherContainer = document.createElement("div");
		document.body.appendChild(otherContainer);
		const otherRoot = createRoot(otherContainer);
		let otherStatus: ReturnType<typeof useAgentStatus> | undefined;
		function OtherProbe() {
			const status = useAgentStatus();
			otherStatus = status;
			return createElement("output", { "data-status": status.agentVerificationStatus });
		}
		testState.userRole.mockResolvedValue({ role: "missing" });
		renderProbe();
		act(() => otherRoot.render(createElement(QueryClientProvider, { client: otherClient }, createElement(OtherProbe))));
		await waitForStatus("missing");
		await vi.waitFor(() => expect(otherContainer.querySelector("output")?.getAttribute("data-status")).toBe("missing"));

		const first = deferred<UserRoleResponse>();
		testState.userRole.mockReturnValueOnce(first.promise).mockResolvedValue(agentRole(OWNER));
		const firstCheck = observedStatus?.refetchAgent(AGENT);
		await vi.waitFor(() => expect(testState.userRole).toHaveBeenCalledTimes(3));
		await expect(otherStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: true });
		first.resolve(agentRole(OWNER));
		await expect(firstCheck).resolves.toMatchObject({ isAgentReady: true });
		expect(queryClient.getQueryData(KEY)).toEqual(agentRole(OWNER));
		expect(otherClient.getQueryData(KEY)).toEqual(agentRole(OWNER));
		await waitForStatus("ready");
		await vi.waitFor(() => expect(otherContainer.querySelector("output")?.getAttribute("data-status")).toBe("ready"));

		act(() => otherRoot.unmount());
		otherClient.clear();
		otherContainer.remove();
	});

	it("leaves no private check query behind in the cache", async () => {
		testState.userRole.mockResolvedValue(agentRole(OWNER));
		renderProbe();
		await waitForStatus("ready");

		await observedStatus?.refetchAgent(AGENT);
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(
			queryClient
				.getQueryCache()
				.findAll({ queryKey: KEY })
				.map((query) => query.queryKey),
		).toEqual([KEY]);
	});

	it("inherits the host QueryClient's retry policy for the post-approval check", async () => {
		const retryingClient = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
		testState.userRole
			.mockResolvedValueOnce({ role: "missing" })
			.mockRejectedValueOnce(Object.assign(new Error("Service unavailable"), { response: { status: 503 } }))
			.mockResolvedValue(agentRole(OWNER));
		renderProbe(retryingClient);
		await waitForStatus("missing");

		await expect(observedStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: true });
		expect(testState.userRole).toHaveBeenCalledTimes(3);
		retryingClient.clear();
	});

	it("wraps a failed post-approval check in an AgentStatusError that keeps the cause", async () => {
		const cause = Object.assign(new Error("Too many requests"), { response: { status: 429 } });
		testState.userRole.mockResolvedValueOnce({ role: "missing" }).mockRejectedValue(cause);
		renderProbe();
		await waitForStatus("missing");

		await expect(observedStatus?.refetchAgent(AGENT)).rejects.toMatchObject({
			name: "AgentStatusError",
			reason: "rate_limited",
			cause,
		});
	});
});
