// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeTab } from "@/components/trade/tradebox/bridge/bridge-tab";
import { createI18nRoot } from "./harness/react";

const WALLET_ADDRESS = "0x1111111111111111111111111111111111111111";
const ROUTE_WALLET_MISMATCH = msg`The active wallet does not match this bridge route.`;
const BRIDGING_TO_HYPERLIQUID = msg`Bridging to Hyperliquid...`;

const testState = vi.hoisted(() => ({
	bridge: { status: "idle" } as Record<string, unknown>,
	continueBridgeInBackground: vi.fn(),
	restoreBridgeInForeground: vi.fn(),
	initLiFi: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@/lib/lifi/config", () => ({ initLiFi: testState.initLiFi }));
vi.mock("@/config/lifi-bridge", () => ({
	LIFI_BRIDGE_FEATURES: { createNewRoute: true },
}));
vi.mock("@/lib/lifi/use-bridge", () => ({
	useBridgeExecutor: () => ({
		...testState.bridge,
		execute: vi.fn(),
		retry: vi.fn(),
		reset: vi.fn(),
		continueInBackground: testState.continueBridgeInBackground,
		restoreInForeground: testState.restoreBridgeInForeground,
	}),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: true,
		walletAddress: WALLET_ADDRESS,
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
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.bridge = { status: "idle" };
		testState.continueBridgeInBackground.mockReset();
		testState.initLiFi.mockReset();
		testState.restoreBridgeInForeground.mockReset();
	});

	afterEach(() => {
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.clearAllMocks();
	});

	it("moves any active route to background execution when the bridge view unmounts", () => {
		act(() => root.render(createElement(BridgeTab)));
		expect(testState.initLiFi).toHaveBeenCalledOnce();
		expect(testState.restoreBridgeInForeground).toHaveBeenCalledOnce();

		act(() => root.unmount());

		expect(testState.continueBridgeInBackground).toHaveBeenCalledOnce();
	});

	it("renders a stored bridge failure in the active language and follows a language switch", () => {
		testState.bridge = {
			status: "error",
			error: ROUTE_WALLET_MISMATCH,
			recoveryWarning: null,
			retryMode: null,
			canAbandon: true,
			sourceAddress: WALLET_ADDRESS,
		};
		act(() => root.render(createElement(BridgeTab)));
		expect(container.textContent).toContain("The active wallet does not match this bridge route.");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [ROUTE_WALLET_MISMATCH.id]: "当前钱包与此跨链路线不匹配。" },
			}),
		);
		expect(container.textContent).toContain("当前钱包与此跨链路线不匹配。");
		expect(container.textContent).not.toContain("The active wallet does not match this bridge route.");

		act(() => root.unmount());
	});

	it("renders an unrecognised bridge failure as a translated generic message instead of its raw text", () => {
		testState.bridge = {
			status: "error",
			error: { kind: "action-error", code: "unknown" },
			recoveryWarning: null,
			retryMode: null,
			canAbandon: true,
			sourceAddress: WALLET_ADDRESS,
		};
		act(() => root.render(createElement(BridgeTab)));

		expect(container.textContent).toContain("The request could not be completed. Try again.");

		act(() => root.unmount());
	});

	it("renders bridge progress in the active language", () => {
		testState.bridge = {
			status: "executing",
			statusText: BRIDGING_TO_HYPERLIQUID,
			txHash: null,
			recoveryWarning: null,
			sourceAddress: WALLET_ADDRESS,
		};
		act(() => root.render(createElement(BridgeTab)));
		expect(container.textContent).toContain("Bridging to Hyperliquid...");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [BRIDGING_TO_HYPERLIQUID.id]: "正在跨链到 Hyperliquid…" },
			}),
		);
		expect(container.textContent).toContain("正在跨链到 Hyperliquid…");

		act(() => root.unmount());
	});
});
