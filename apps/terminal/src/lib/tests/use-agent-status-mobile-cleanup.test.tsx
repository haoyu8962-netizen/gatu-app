// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";

const testState = vi.hoisted(() => ({
	cleanupAgentRegistrationIfMatches: vi.fn(),
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

vi.mock("@gatu/hl-react/signing/agent-registration-session", () => ({
	cleanupAgentRegistrationIfMatches: testState.cleanupAgentRegistrationIfMatches,
}));

vi.mock("@gatu/hl-react/signing/agent-storage", () => ({
	readAgentFromStorage: () => null,
	useAgentWalletStorage: () => null,
	useInvalidAgentStorageRecord: () => true,
}));

import { useAgentStatus } from "@gatu/hl-react/signing/use-agent-status";

describe("useAgentStatus invalid storage cleanup", () => {
	beforeEach(() => {
		testState.cleanupAgentRegistrationIfMatches.mockReset();
		testState.cleanupAgentRegistrationIfMatches.mockResolvedValue({
			status: "cleaned",
			activeOwnerCleanupIncomplete: false,
		});
	});

	it("revalidates and cleans an invalid key under the registration lock without waiting for extraAgents", async () => {
		const container = document.createElement("div");
		const root = createRoot(container);
		function Probe() {
			useAgentStatus();
			return null;
		}

		await act(async () => {
			root.render(createElement(Probe));
		});

		expect(testState.cleanupAgentRegistrationIfMatches).toHaveBeenCalledWith("Mainnet", OWNER, {
			kind: "invalid-record",
		});
		act(() => root.unmount());
	});
});
