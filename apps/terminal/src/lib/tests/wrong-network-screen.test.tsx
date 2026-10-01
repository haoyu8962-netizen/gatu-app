// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WrongNetworkScreen } from "@/components/trade/tradebox/deposit/wrong-network-screen";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { createI18nRoot } from "./harness/react";

const SWITCH_REJECTED = msg`Arbitrum network switch was rejected.`;

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({ children }: { children: ReactNode }) => createElement("div", { role: "dialog" }, children),
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

describe("WrongNetworkScreen", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function renderScreen(error: Error) {
		act(() =>
			root.render(
				createElement(WrongNetworkScreen, {
					open: true,
					onClose: vi.fn(),
					onSwitch: vi.fn(),
					isSwitching: false,
					error,
				}),
			),
		);
	}

	it("renders a switch failure in the active language and follows a language switch", () => {
		renderScreen(new LocalizedActionError(SWITCH_REJECTED));

		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Arbitrum network switch was rejected.");

		act(() =>
			i18n.loadAndActivate({ locale: "zh", messages: { [SWITCH_REJECTED.id]: "已拒绝切换到 Arbitrum 网络。" } }),
		);

		expect(container.querySelector('[role="alert"]')?.textContent).toBe("已拒绝切换到 Arbitrum 网络。");
	});

	it("shows the translated switch guidance instead of a raw wallet provider error", () => {
		renderScreen(new Error("Internal JSON-RPC error."));

		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"Unable to switch wallet to Arbitrum. Switch networks in your wallet and retry.",
		);
	});
});
