// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";

const testState = vi.hoisted(() => ({
	clearOwner: vi.fn(),
	removeAgent: vi.fn(),
}));

vi.mock("@gatu/hl-react/provider", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		builderConfig: undefined,
		clientKey: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@gatu/hl-react/hooks/useInfo", () => ({
	useInfo: () => ({
		data: undefined,
		error: null,
		isFetching: true,
		isLoading: true,
		dataUpdatedAt: 0,
		refetch: vi.fn(async () => ({ data: undefined })),
	}),
}));

vi.mock("@gatu/hl-react/signing/agent-session", () => ({
	clearActiveAgentOwnerIfMatches: testState.clearOwner,
}));

vi.mock("@gatu/hl-react/signing/agent-storage", () => ({
	removeAgentFromStorageAndVerify: testState.removeAgent,
	useAgentWalletStorage: () => null,
	useInvalidAgentStorageRecord: () => true,
}));

import { useAgentStatus } from "@gatu/hl-react/signing/use-agent-status";

describe("useAgentStatus invalid storage cleanup", () => {
	beforeEach(() => {
		testState.clearOwner.mockReset();
		testState.clearOwner.mockReturnValue(true);
		testState.removeAgent.mockReset();
		testState.removeAgent.mockReturnValue({ status: "removed" });
	});

	it("clears the active owner and invalid key without waiting for extraAgents", async () => {
		const container = document.createElement("div");
		const root = createRoot(container);
		function Probe() {
			useAgentStatus();
			return null;
		}

		await act(async () => {
			root.render(createElement(Probe));
		});

		expect(testState.clearOwner).toHaveBeenCalledWith("Mainnet", OWNER);
		expect(testState.removeAgent).toHaveBeenCalledWith("Mainnet", OWNER);
		expect(testState.clearOwner.mock.invocationCallOrder[0]).toBeLessThan(
			testState.removeAgent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
		act(() => root.unmount());
	});
});
