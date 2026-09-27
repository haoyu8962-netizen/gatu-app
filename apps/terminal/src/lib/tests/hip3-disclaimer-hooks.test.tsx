// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";

const testState = vi.hoisted(() => ({
	hasAccepted: false,
	markets: {} as Record<string, { kind: string; dex?: string } | undefined>,
	selectedMarket: undefined as { kind: string; dex?: string } | undefined,
}));

vi.mock("@/lib/hyperliquid/hooks/useMarketsInfo", () => ({
	useSelectedMarketInfo: () => ({ data: testState.selectedMarket }),
	useMarketsInfo: () => ({ getMarketInfo: (name: string) => testState.markets[name] }),
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	useHasAcceptedHip3Disclaimer: () => testState.hasAccepted,
}));

import {
	type Hip3DisclaimerRequirement,
	type Hip3DisclaimerTarget,
	useHip3DisclaimerRequirement,
} from "@/hooks/trade/use-hip3-disclaimer";
import { type Hip3DisclaimerExit, useHip3DisclaimerPresentation } from "@/hooks/trade/use-hip3-disclaimer-presentation";

const XYZ_DOCUMENTATION_URL = "https://docs.trade.xyz/consolidated-resources/specification-index";

function RequirementProbe({ target }: { target: Hip3DisclaimerTarget }) {
	return createElement("output", null, JSON.stringify(useHip3DisclaimerRequirement(target)));
}

function PresentationProbe({
	requirement,
	exit,
}: {
	requirement: Hip3DisclaimerRequirement;
	exit: Hip3DisclaimerExit;
}) {
	return createElement("output", null, JSON.stringify(useHip3DisclaimerPresentation(requirement, exit, 250)));
}

function market(kind: UnifiedMarketInfo["kind"], dex?: string) {
	return { kind, dex };
}

describe("HIP-3 disclaimer hooks", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.hasAccepted = false;
		testState.selectedMarket = market("builderPerp", "xyz");
		testState.markets = {
			BTC: market("perp"),
			"xyz:SP500": market("builderPerp", "xyz"),
			"para:TOTAL2": market("builderPerp", "para"),
		};
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderRequirement(target: Hip3DisclaimerTarget): Hip3DisclaimerRequirement {
		act(() => root.render(createElement(RequirementProbe, { target })));
		return JSON.parse(container.textContent ?? "null");
	}

	it("targets the selected market by default and nothing for null", () => {
		expect(renderRequirement(undefined)).toEqual({
			isRequired: true,
			dex: "xyz",
			documentationUrl: XYZ_DOCUMENTATION_URL,
		});
		expect(renderRequirement(null).isRequired).toBe(false);
	});

	it("resolves a list of markets to its first builder-deployed market", () => {
		expect(renderRequirement(["BTC", "xyz:SP500", "para:TOTAL2"])).toMatchObject({ isRequired: true, dex: "xyz" });
		expect(renderRequirement(["BTC"]).isRequired).toBe(false);
		expect(renderRequirement("para:TOTAL2")).toMatchObject({ isRequired: true, dex: "para" });
		expect(renderRequirement("missing").isRequired).toBe(false);
	});

	it("stops requiring the disclaimer once it is accepted", () => {
		testState.hasAccepted = true;
		expect(renderRequirement(undefined).isRequired).toBe(false);
		expect(renderRequirement(["xyz:SP500"]).isRequired).toBe(false);
	});

	it("keeps the disclaimer presented closed, with the same way out, for its exit transition", () => {
		vi.useFakeTimers();
		try {
			const required: Hip3DisclaimerRequirement = {
				isRequired: true,
				dex: "xyz",
				documentationUrl: XYZ_DOCUMENTATION_URL,
			};
			const released: Hip3DisclaimerRequirement = { isRequired: false, dex: undefined, documentationUrl: undefined };
			const present = (requirement: Hip3DisclaimerRequirement, exit: Hip3DisclaimerExit) => {
				act(() => root.render(createElement(PresentationProbe, { requirement, exit })));
				return JSON.parse(container.textContent ?? "null");
			};

			expect(present(released, "cancel")).toBeNull();
			expect(present(required, "cancel")).toEqual({
				open: true,
				dex: "xyz",
				exit: "cancel",
				documentationUrl: XYZ_DOCUMENTATION_URL,
			});

			expect(present(released, "leave-market")).toEqual({
				open: false,
				dex: "xyz",
				exit: "cancel",
				documentationUrl: XYZ_DOCUMENTATION_URL,
			});

			act(() => {
				vi.advanceTimersByTime(250);
			});
			expect(container.textContent).toBe("null");
			expect(present(required, "leave-market")).toMatchObject({ open: true, exit: "leave-market" });
		} finally {
			vi.useRealTimers();
		}
	});
});
