// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeErrorScreen } from "@/components/trade/tradebox/bridge/bridge-error-screen";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("LI.FI bridge error actions", () => {
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

	it("labels committed recovery as status tracking", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<BridgeErrorScreen error="Tracking paused" retryMode="track" onRetry={vi.fn()} />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("Resume tracking");
		expect(container.textContent).not.toContain("Try Again");
	});

	it("does not render a retry action when the route cannot be retried", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<BridgeErrorScreen error="Bridge creation is paused" onBack={vi.fn()} />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("Back");
		expect(container.textContent).not.toContain("Try Again");
		expect(container.textContent).not.toContain("Resume tracking");
	});
});
