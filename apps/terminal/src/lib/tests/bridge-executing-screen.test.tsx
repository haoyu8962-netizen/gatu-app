// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutingScreen } from "@/components/trade/tradebox/bridge/executing-screen";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("LI.FI bridge execution recovery warning", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("keeps the current tracker visible and removes the close action when reload recovery could not be saved", () => {
		const warning = "Reload recovery could not be saved. Keep this tab open until the bridge completes.";
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ExecutingScreen
						address="0x1111111111111111111111111111111111111111"
						statusText="Bridging to Hyperliquid..."
						txHash="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
						onDone={vi.fn()}
						recoveryWarning={warning}
					/>
				</I18nProvider>,
			),
		);

		expect(container.querySelector('[role="alert"]')?.textContent).toBe(warning);
		expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Close")).toBe(
			false,
		);
		expect(container.textContent).toContain("Bridging to Hyperliquid...");
	});
});
