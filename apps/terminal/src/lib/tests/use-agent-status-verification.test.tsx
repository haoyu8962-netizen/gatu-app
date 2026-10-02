// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";
const NEXT_AGENT = "0x3333333333333333333333333333333333333333";

const testState = vi.hoisted(() => ({
	data: [] as Array<{ address: `0x${string}`; name: string; validUntil: number | null }> | undefined,
	error: null as Error | null,
	isFetching: false,
	localAgent: {
		privateKey: `0x${"ab".repeat(32)}`,
		publicKey: "0x2222222222222222222222222222222222222222",
		source: "local-registration" as const,
	} as {
		privateKey: `0x${string}`;
		publicKey: `0x${string}`;
		source: "local-registration";
	} | null,
	refetchData: [] as Array<{ address: `0x${string}`; name: string; validUntil: number | null }> | undefined,
	refetchError: null as Error | null,
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		builderConfig: undefined,
		clientKey: OWNER,
		agentName: "sairn-dev",
	}),
}));

vi.mock("@sairn/hl-react/hooks/useInfo", () => ({
	useInfo: (method: string) =>
		method === "extraAgents"
			? {
					data: testState.data,
					dataUpdatedAt: 1,
					error: testState.error,
					isFetching: testState.isFetching,
					isLoading: testState.isFetching && testState.data === undefined,
					refetch: vi.fn(async () => ({ data: testState.refetchData, error: testState.refetchError })),
				}
			: {
					data: undefined,
					dataUpdatedAt: 0,
					error: null,
					isFetching: false,
					isLoading: false,
					refetch: vi.fn(),
				},
}));

vi.mock("@sairn/hl-react/signing/agent-storage", () => ({
	readAgentFromStorage: () => testState.localAgent,
	useAgentWalletStorage: () => testState.localAgent,
	useInvalidAgentStorageRecord: () => false,
}));

import { AgentStatusError, useAgentStatus } from "@sairn/hl-react/signing/use-agent-status";

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

describe("useAgentStatus definitive verification", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.data = [];
		testState.error = null;
		testState.isFetching = false;
		testState.localAgent = {
			privateKey: `0x${"ab".repeat(32)}`,
			publicKey: AGENT,
			source: "local-registration",
		};
		testState.refetchData = [];
		testState.refetchError = null;
		observedStatus = undefined;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderProbe() {
		act(() => root.render(createElement(Probe)));
		return container.querySelector("output");
	}

	it("does not request registration from a cached miss while refreshing", () => {
		testState.isFetching = true;
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
		testState.data = undefined;
		testState.isFetching = true;
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("loading");
		expect(probe?.getAttribute("data-loading")).toBe("true");
		expect(probe?.getAttribute("data-total-loading")).toBe("true");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("fails closed instead of trusting cached data after an error", () => {
		testState.data = [{ address: AGENT, name: "sairn", validUntil: null }];
		testState.error = new Error("network unavailable");
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("error");
		expect(probe?.getAttribute("data-missing-reason")).toBe("none");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("requests registration only after a settled successful miss", () => {
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-missing-reason")).toBe("local_key_not_approved");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("true");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("keeps an exact unexpired Agent ready during background verification", () => {
		testState.data = [{ address: AGENT, name: "sairn-dev", validUntil: null }];
		testState.isFetching = true;
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("ready");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("true");
		expect(probe?.getAttribute("data-total-ready")).toBe("true");
	});

	it("requires the Provider deployment name for the stored Agent", () => {
		testState.data = [{ address: AGENT, name: "sairn", validUntil: null }];
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-missing-reason")).toBe("agent_name_mismatch");
		expect(probe?.getAttribute("data-needs-agent")).toBe("true");
		expect(probe?.getAttribute("data-ready")).toBe("false");
	});

	it("exposes an absent local key only after a definitive remote result", () => {
		testState.localAgent = null;
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-missing-reason")).toBe("no_local_key");
	});

	it("warns when an absent local key would replace a same-name remote Agent", () => {
		testState.localAgent = null;
		testState.data = [{ address: "0x3333333333333333333333333333333333333333", name: "sairn-dev", validUntil: null }];
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-missing-reason")).toBe("remote_named_agent_exists");
	});

	it("preserves a rate-limit cause when refetching only Agent status", async () => {
		const cause = Object.assign(new Error("Too many requests"), { response: { status: 429 } });
		testState.refetchError = cause;
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
		testState.refetchData = [{ address: NEXT_AGENT, name: "sairn-dev", validUntil: null }];

		await expect(observedStatus?.refetchAgent()).resolves.toMatchObject({
			isAgentReady: true,
			needsAgent: false,
		});
	});

	it("preserves a service failure cause when refetching all requirements", async () => {
		const cause = Object.assign(new Error("Service unavailable"), { response: { status: 503 } });
		testState.refetchError = cause;
		renderProbe();

		const result = observedStatus?.refetch();
		await expect(result).rejects.toMatchObject({
			name: "AgentStatusError",
			reason: "service_unavailable",
			cause,
		});
	});
});
