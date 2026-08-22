// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	data: [] as Array<{ address: `0x${string}`; name: string; validUntil: number | null }> | undefined,
	error: null as Error | null,
	isFetching: false,
}));

vi.mock("@gatu/hl-react/provider", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		builderConfig: undefined,
		clientKey: OWNER,
		agentName: "gatu-dev",
	}),
}));

vi.mock("@gatu/hl-react/hooks/useInfo", () => ({
	useInfo: (method: string) =>
		method === "extraAgents"
			? {
					data: testState.data,
					dataUpdatedAt: 1,
					error: testState.error,
					isFetching: testState.isFetching,
					isLoading: testState.isFetching && testState.data === undefined,
					refetch: vi.fn(),
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

vi.mock("@gatu/hl-react/signing/agent-storage", () => ({
	useAgentWalletStorage: () => ({
		privateKey: `0x${"ab".repeat(32)}`,
		publicKey: AGENT,
		source: "local-registration",
	}),
	useInvalidAgentStorageRecord: () => false,
}));

import { useAgentStatus } from "@gatu/hl-react/signing/use-agent-status";

function Probe() {
	const status = useAgentStatus();
	return createElement("output", {
		"data-status": status.agentVerificationStatus,
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
		testState.data = [{ address: AGENT, name: "HypeTerminal", validUntil: null }];
		testState.error = new Error("network unavailable");
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("error");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("false");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("requests registration only after a settled successful miss", () => {
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-loading")).toBe("false");
		expect(probe?.getAttribute("data-total-loading")).toBe("false");
		expect(probe?.getAttribute("data-needs-agent")).toBe("true");
		expect(probe?.getAttribute("data-ready")).toBe("false");
		expect(probe?.getAttribute("data-total-ready")).toBe("false");
	});

	it("keeps an exact unexpired Agent ready during background verification", () => {
		testState.data = [{ address: AGENT, name: "gatu-dev", validUntil: null }];
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
		testState.data = [{ address: AGENT, name: "gatu", validUntil: null }];
		const probe = renderProbe();

		expect(probe?.getAttribute("data-status")).toBe("missing");
		expect(probe?.getAttribute("data-needs-agent")).toBe("true");
		expect(probe?.getAttribute("data-ready")).toBe("false");
	});
});
