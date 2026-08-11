// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartPanel } from "@/components/trade/chart/chart-panel";

vi.mock("@/lib/hyperliquid", () => ({
	useSelectedMarketInfo: () => ({ data: undefined }),
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: () => undefined,
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useTheme: () => "light",
}));

describe("ChartPanel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("shows an explicit loading state while market or chart code is unavailable", () => {
		act(() => root.render(<ChartPanel />));

		const status = container.querySelector("output");
		expect(status).not.toBeNull();
		expect(status?.getAttribute("aria-live")).toBe("polite");
		expect(status?.textContent).toContain("Loading...");
	});
});
