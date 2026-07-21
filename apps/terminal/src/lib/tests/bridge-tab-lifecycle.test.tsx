// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeTab } from "@/components/trade/tradebox/bridge/bridge-tab";

const testState = vi.hoisted(() => ({
	continueBridgeInBackground: vi.fn(),
	initLiFi: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@/lib/lifi/config", () => ({ initLiFi: testState.initLiFi }));
vi.mock("@/lib/lifi/use-bridge", () => ({
	continueBridgeInBackground: testState.continueBridgeInBackground,
	useBridgeExecutor: () => ({
		status: "idle",
		execute: vi.fn(),
		retry: vi.fn(),
		reset: vi.fn(),
		continueInBackground: testState.continueBridgeInBackground,
	}),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: true,
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));
vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ close: vi.fn() }),
}));
vi.mock("@/components/trade/tradebox/bridge/asset-selection-screen", () => ({
	AssetSelectionScreen: () => null,
}));

describe("BridgeTab lifecycle", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.continueBridgeInBackground.mockReset();
		testState.initLiFi.mockReset();
	});

	afterEach(() => {
		container.remove();
		vi.clearAllMocks();
	});

	it("moves any active route to background execution when the bridge view unmounts", () => {
		act(() => root.render(createElement(BridgeTab)));
		expect(testState.initLiFi).toHaveBeenCalledOnce();

		act(() => root.unmount());

		expect(testState.continueBridgeInBackground).toHaveBeenCalledOnce();
	});
});
