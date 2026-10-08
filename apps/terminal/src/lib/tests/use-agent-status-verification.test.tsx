// @vitest-environment jsdom

import type { UserRoleResponse } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";
const NEXT_AGENT = "0x3333333333333333333333333333333333333333";
const MOBILE_PRIVATE_KEY = `0x${"11".repeat(32)}` as const;

type LocalAgent = {
	privateKey: `0x${string}`;
	publicKey: `0x${string}`;
	source: "local-registration" | "mobile-sync";
	agentNameBase?: string;
	agentName?: string;
	agentValidUntilMs?: number;
	importedAtMs?: number;
};

const testState = vi.hoisted(() => ({
	keyRole: undefined as UserRoleResponse | undefined,
	keyRoleError: null as Error | null,
	keyRoleFetching: false,
	extraAgents: undefined as Array<{ address: `0x${string}`; name: string; validUntil: number | null }> | undefined,
	extraAgentsFetching: false,
	localAgent: null as LocalAgent | null,
	queries: [] as Array<{ method: string; user: string | undefined; enabled: boolean | undefined }>,
	userRoleRequests: [] as Array<{ user: string }>,
	userRoleAnswer: vi.fn(),
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		builderConfig: undefined,
		clientKey: OWNER,
		info: {
			userRole: async (params: { user: string }) => {
				testState.userRoleRequests.push(params);
				return testState.userRoleAnswer(params);
			},
		},
	}),
}));

vi.mock("@sairn/hl-react/hooks/useInfo", () => ({
	useInfo: (method: string, params: { user?: string }, options: { enabled?: boolean }) => {
		testState.queries.push({ method, user: params.user, enabled: options.enabled });
		if (method === "userRole") {
			return {
				data: options.enabled ? testState.keyRole : undefined,
				dataUpdatedAt: 1,
				error: options.enabled ? testState.keyRoleError : null,
				isFetching: options.enabled ? testState.keyRoleFetching : false,
				isLoading: options.enabled ? testState.keyRoleFetching && testState.keyRole === undefined : false,
				refetch: vi.fn(),
			};
		}
		if (method === "extraAgents") {
			return {
				data: options.enabled ? testState.extraAgents : undefined,
				dataUpdatedAt: 1,
				error: null,
				isFetching: options.enabled ? testState.extraAgentsFetching : false,
				isLoading: options.enabled ? testState.extraAgentsFetching && testState.extraAgents === undefined : false,
				refetch: vi.fn(async () => ({ data: testState.extraAgents, error: null })),
			};
		}
		return {
			data: undefined,
			dataUpdatedAt: 0,
			error: null,
			isFetching: false,
			isLoading: false,
			refetch: vi.fn(),
		};
	},
}));

vi.mock("@sairn/hl-react/signing/agent-storage", () => ({
	readAgentFromStorage: () => testState.localAgent,
	useAgentWalletStorage: () => testState.localAgent,
	useInvalidAgentStorageRecord: () => false,
}));

import { createMobileAgentWalletRecord } from "@sairn/hl-react/signing/mobile-agent";
import { AgentStatusError, useAgentStatus } from "@sairn/hl-react/signing/use-agent-status";
import { privateKeyToAccount } from "viem/accounts";

let observedStatus: ReturnType<typeof useAgentStatus> | undefined;

function Probe() {
	const status = useAgentStatus();
	observedStatus = status;
	return createElement("output", {
		"data-status": status.agentVerificationStatus,
		"data-missing-reason": status.agentMissingReason ?? "none",
		"data-loading": String(status.isAgentLoading),
		"data-total-loading": String(status.isLoading),
		"data-needs-agent": String(status.needsAgent),
		"data-ready": String(status.isAgentReady),
		"data-total-ready": String(status.isReady),
	});
}

function agentRole(user: string): UserRoleResponse {
	return { role: "agent", data: { user: user as `0x${string}` } };
}

describe("useAgentStatus definitive verification", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;
	let queryClient: QueryClient;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		testState.keyRole = { role: "missing" };
		testState.keyRoleError = null;
		testState.keyRoleFetching = false;
		testState.extraAgents = undefined;
		testState.extraAgentsFetching = false;
		testState.localAgent = {
			privateKey: `0x${"ab".repeat(32)}`,
			publicKey: AGENT,
			source: "local-registration",
		};
		testState.queries = [];
		testState.userRoleRequests = [];
		testState.userRoleAnswer.mockReset().mockImplementation(async () => ({ role: "missing" }));
		observedStatus = undefined;
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
	});

	function renderProbe() {
		act(() => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe))));
		return container.querySelector("output");
	}

	function keyRoleQueries() {
		return testState.queries.filter(({ method }) => method === "userRole");
	}

	it("asks the exchange for the role of the stored key, never for the extra agents list", () => {
		renderProbe();

		expect(keyRoleQueries().every(({ user, enabled }) => user === AGENT && enabled === true)).toBe(true);
		expect(testState.queries.filter(({ method }) => method === "extraAgents").every(({ enabled }) => !enabled)).toBe(
			true,
		);
	});

	it("does not request registration from a cached miss while refreshing", () => {
		testState.keyRoleFetching = true;
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("loading");
		expect(probe?.getAttribute("data-missing-reason")).toBe("none");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("keeps the action loading state for the initial fetch only", () => {
		testState.keyRole = undefined;
		testState.keyRoleFetching = true;
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("loading");
		expect(probe?.getAttribute("data-loading")).toBe("true");
		expect(probe?.getAttribute("data-total-loading")).toBe("true");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("fails closed instead of trusting cached data after an error", () => {
		testState.keyRole = agentRole(OWNER);
		testState.keyRoleError = new Error("network unavailable");
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("error");
		expect(probe?.getAttribute("data-missing-reason")).toBe("none");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("requests registration only after a settled answer that the key is not an Agent", () => {
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-missing-reason")).toBe("local_key_not_approved");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("true");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("keeps an exact approved Agent ready during background verification", () => {
		testState.keyRole = agentRole(OWNER);
		testState.keyRoleFetching = true;
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("ready");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("true");
		expect(probe?.getAttribute("data-total-ready")).toBe("true");
	});

	it("rejects a key the exchange reports as an Agent of another owner", () => {
		testState.keyRole = agentRole(NEXT_AGENT);
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-missing-reason")).toBe("local_key_not_approved");
		expect(probe?.getAttribute("data-needs-agent")).toBe("true");
		expect(probe?.getAttribute("data-ready")).toBe("false");
	});

	it("needs a new connection without a local key and asks the exchange nothing", () => {
		testState.localAgent = null;
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-missing-reason")).toBe("no_local_key");
		expect(probe?.getAttribute("data-needs-agent")).toBe("true");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(keyRoleQueries().every(({ enabled }) => enabled === false)).toBe(true);
	});

	it("verifies a Mobile Agent through extraAgents only", () => {
		const publicKey = privateKeyToAccount(MOBILE_PRIVATE_KEY).address;
		const validUntil = Date.now() + 60_000;
		testState.localAgent = createMobileAgentWalletRecord({
			privateKey: MOBILE_PRIVATE_KEY,
			publicKey,
			agentName: `Mobile valid_until ${validUntil}`,
			agentValidUntilMs: validUntil,
			importedAtMs: Date.now() - 60_000,
		}) as LocalAgent;
		testState.keyRole = agentRole(OWNER);
		testState.extraAgents = [{ address: publicKey, name: "Mobile", validUntil }];
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("ready");
		expect(keyRoleQueries().every(({ enabled }) => enabled === false)).toBe(true);
		expect(testState.queries.some(({ method, enabled }) => method === "extraAgents" && enabled === true)).toBe(true);
	});

	it("confirms a freshly approved key with a fresh userRole request for that exact key", async () => {
		testState.userRoleAnswer.mockImplementation(async ({ user }: { user: string }) =>
			user === NEXT_AGENT.toLowerCase() ? agentRole(OWNER) : { role: "missing" },
		);
		renderProbe();

		await expect(observedStatus?.refetchAgent(NEXT_AGENT.toUpperCase() as `0x${string}`)).resolves.toMatchObject({
			isAgentReady: true,
			needsAgent: false,
		});
		expect(testState.userRoleRequests).toEqual([{ user: NEXT_AGENT.toLowerCase() }]);
		await expect(observedStatus?.refetchAgent()).resolves.toMatchObject({ isAgentReady: false, needsAgent: true });
		expect(testState.userRoleRequests).toEqual([{ user: NEXT_AGENT.toLowerCase() }, { user: AGENT }]);
	});

	it("does not accept an Agent of another owner when confirming a fresh key", async () => {
		testState.userRoleAnswer.mockResolvedValue(agentRole(NEXT_AGENT));
		renderProbe();

		await expect(observedStatus?.refetchAgent(AGENT)).resolves.toMatchObject({ isAgentReady: false, needsAgent: true });
	});

	it("preserves a rate-limit cause when refetching only Agent status", async () => {
		const cause = Object.assign(new Error("Too many requests"), { response: { status: 429 } });
		testState.userRoleAnswer.mockRejectedValue(cause);
		renderProbe();

		const result = observedStatus?.refetchAgent();
		await expect(result).rejects.toMatchObject({
			name: "AgentStatusError",
			reason: "rate_limited",
			cause,
		});
		await expect(result).rejects.toBeInstanceOf(AgentStatusError);
	});

	it("uses the latest stored Agent when a cross-tab write lands after render", async () => {
		testState.localAgent = null;
		renderProbe();
		testState.localAgent = {
			privateKey: `0x${"cd".repeat(32)}`,
			publicKey: NEXT_AGENT,
			source: "local-registration",
		};
		testState.userRoleAnswer.mockImplementation(async ({ user }: { user: string }) =>
			user === NEXT_AGENT ? agentRole(OWNER) : { role: "missing" },
		);

		await expect(observedStatus?.refetchAgent()).resolves.toMatchObject({
			isAgentReady: true,
			needsAgent: false,
		});
		expect(testState.userRoleRequests).toEqual([{ user: NEXT_AGENT }]);
	});

	it("needs a new Agent from a refetch without any local key, without asking the exchange", async () => {
		testState.localAgent = null;
		renderProbe();

		await expect(observedStatus?.refetchAgent()).resolves.toMatchObject({ isAgentReady: false, needsAgent: true });
		expect(testState.userRoleRequests).toEqual([]);
	});

	it("preserves a service failure cause when refetching all requirements", async () => {
		const cause = Object.assign(new Error("Service unavailable"), { response: { status: 503 } });
		testState.userRoleAnswer.mockRejectedValue(cause);
		renderProbe();

		const result = observedStatus?.refetch();
		await expect(result).rejects.toMatchObject({
			name: "AgentStatusError",
			reason: "service_unavailable",
			cause,
		});
	});
});
