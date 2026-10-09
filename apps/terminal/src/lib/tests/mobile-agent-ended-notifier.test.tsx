// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	sessionMode: "agent-only" as "agent-only" | "wallet" | "disconnected",
	warning: vi.fn(),
	dismiss: vi.fn(),
}));

vi.mock("@sairn/hl-react", async () => ({
	...(await import("@sairn/hl-react/signing/mobile-agent-events")),
	useHyperliquid: () => ({ clientKey: testState.clientKey, env: testState.env, sessionMode: testState.sessionMode }),
}));

vi.mock("sonner", () => ({
	toast: { warning: testState.warning, dismiss: testState.dismiss },
}));

import { notifyMobileAgentEnded } from "@sairn/hl-react/signing/mobile-agent-events";
import { MobileAgentEndedNotifier } from "@/components/trade/components/mobile-agent-ended-notifier";

describe("MobileAgentEndedNotifier", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.clientKey = OWNER;
		testState.env = "Mainnet";
		testState.sessionMode = "agent-only";
		testState.warning.mockReset();
		testState.dismiss.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render() {
		act(() => root.render(createElement(MobileAgentEndedNotifier)));
	}

	it("shows a persistent notice that names the account whose phone access ended", () => {
		render();
		act(() => notifyMobileAgentEnded({ env: "Mainnet", owner: OWNER, reason: "missing_remote" }));

		expect(testState.warning).toHaveBeenCalledOnce();
		const [title, options] = testState.warning.mock.calls[0] as [ReactNode, Record<string, unknown>];
		expect(options.id).toBe(`mobile-agent-ended:Mainnet:${OWNER}`);
		expect(options.duration).toBe(Number.POSITIVE_INFINITY);
		expect(options.closeButton).toBe(true);
		const titleRoot = document.createElement("div");
		const titleReactRoot = createI18nRoot(titleRoot);
		act(() => titleReactRoot.render(title));
		expect(titleRoot.textContent).toBe("Phone access ended for 0x1111...1111");
		act(() => titleReactRoot.unmount());
	});

	it("ignores an event from the other network", () => {
		render();
		act(() => notifyMobileAgentEnded({ env: "Testnet", owner: OWNER, reason: "expired_local" }));
		expect(testState.warning).not.toHaveBeenCalled();
	});

	it("keeps the notice while the device falls back, and withdraws it once a new phone key or network is active", () => {
		render();
		act(() => notifyMobileAgentEnded({ env: "Mainnet", owner: OWNER, reason: "missing_remote" }));

		testState.sessionMode = "disconnected";
		testState.clientKey = "disconnected";
		render();
		testState.sessionMode = "wallet";
		testState.clientKey = OTHER;
		render();
		expect(testState.dismiss).not.toHaveBeenCalled();

		testState.sessionMode = "agent-only";
		testState.clientKey = OTHER;
		render();
		expect(testState.dismiss).toHaveBeenCalledExactlyOnceWith(`mobile-agent-ended:Mainnet:${OWNER}`);

		testState.dismiss.mockReset();
		act(() => notifyMobileAgentEnded({ env: "Mainnet", owner: OTHER, reason: "expired_local" }));
		testState.env = "Testnet";
		testState.sessionMode = "disconnected";
		testState.clientKey = "disconnected";
		render();
		expect(testState.dismiss).toHaveBeenCalledExactlyOnceWith(`mobile-agent-ended:Mainnet:${OTHER}`);
	});
});
