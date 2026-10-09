// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const NOW_MS = 1_779_364_227_000;
const PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;

const testState = vi.hoisted(() => ({
	cleanupAgentRegistrationIfMatches: vi.fn(),
	localAgent: null as unknown,
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		builderConfig: undefined,
		clientKey: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@sairn/hl-react/hooks/useInfo", () => ({
	useInfo: () => ({
		data: [],
		error: null,
		isFetching: false,
		isLoading: false,
		dataUpdatedAt: 1_779_364_227_000,
		refetch: vi.fn(async () => ({ data: [] })),
	}),
}));

vi.mock("@sairn/hl-react/signing/agent-registration-session", () => ({
	cleanupAgentRegistrationIfMatches: testState.cleanupAgentRegistrationIfMatches,
}));

vi.mock("@sairn/hl-react/signing/agent-storage", () => ({
	readAgentFromStorage: () => testState.localAgent,
	useAgentWalletStorage: () => testState.localAgent,
	useInvalidAgentStorageRecord: () => false,
}));

import { createMobileAgentWalletRecord } from "@sairn/hl-react/signing/mobile-agent";
import { subscribeMobileAgentEnded } from "@sairn/hl-react/signing/mobile-agent-events";
import { useAgentStatus } from "@sairn/hl-react/signing/use-agent-status";

describe("useAgentStatus Mobile Agent removal notice", () => {
	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
		const validUntil = NOW_MS + 24 * 60 * 60 * 1000;
		testState.localAgent = createMobileAgentWalletRecord({
			privateKey: PRIVATE_KEY,
			publicKey: privateKeyToAccount(PRIVATE_KEY).address,
			agentName: `Mobile QR valid_until ${validUntil}`,
			agentValidUntilMs: validUntil,
			importedAtMs: NOW_MS - 60_000,
		});
		testState.cleanupAgentRegistrationIfMatches.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function renderStatus() {
		const root = createRoot(document.createElement("div"));
		function Probe() {
			useAgentStatus();
			return null;
		}
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Probe)));
		});
		await act(async () => {
			await Promise.resolve();
		});
		return root;
	}

	it("announces once Hyperliquid no longer lists the imported key and it was removed", async () => {
		testState.cleanupAgentRegistrationIfMatches.mockResolvedValue({
			status: "cleaned",
			activeOwnerCleanupIncomplete: false,
		});
		const listener = vi.fn();
		const unsubscribe = subscribeMobileAgentEnded(listener);

		const root = await renderStatus();

		expect(testState.cleanupAgentRegistrationIfMatches).toHaveBeenCalledWith("Mainnet", OWNER, {
			kind: "public-key",
			publicKey: privateKeyToAccount(PRIVATE_KEY).address.toLowerCase(),
		});
		expect(listener).toHaveBeenCalledWith({ env: "Mainnet", owner: OWNER, reason: "missing_remote" });
		unsubscribe();
		act(() => root.unmount());
	});

	it("stays quiet when the cleanup did not remove the key", async () => {
		testState.cleanupAgentRegistrationIfMatches.mockResolvedValue({ status: "skipped" });
		const listener = vi.fn();
		const unsubscribe = subscribeMobileAgentEnded(listener);

		const root = await renderStatus();

		expect(testState.cleanupAgentRegistrationIfMatches).toHaveBeenCalled();
		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
		act(() => root.unmount());
	});
});
