// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveScope, ExchangeScopeProvider, useExchangeScope } from "@/providers/exchange-scope";

const routerMocks = vi.hoisted(() => ({
	location: { pathname: "/trade/HYPE", search: { scope: "all" as "all" | undefined } },
}));

vi.mock("@tanstack/react-router", () => ({
	useLocation: () => routerMocks.location,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("exchange scope routing", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		routerMocks.location = { pathname: "/trade/HYPE", search: { scope: "all" } };
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("derives concrete market scopes from trade URLs", () => {
		expect(deriveScope("/trade/HYPE")).toMatchObject({ scope: "perp", marketName: "HYPE" });
		expect(deriveScope("/trade/ETH/USDH")).toMatchObject({ scope: "spot", marketName: "ETH/USDH" });
		expect(deriveScope("/trade/xyz:SILVER")).toMatchObject({
			scope: "builders-perp",
			dex: "xyz",
			marketName: "xyz:SILVER",
		});
	});

	it("keeps the addressable all-market scope across a refresh", () => {
		expect(deriveScope("/trade/HYPE", "all")).toMatchObject({ scope: "all", marketName: "HYPE" });
		expect(deriveScope("/trade/xyz:SILVER", "all")).toMatchObject({
			scope: "all",
			dex: "xyz",
			marketName: "xyz:SILVER",
		});
	});

	it("resets runtime scope when the route identity changes", () => {
		let scopeState: ReturnType<typeof useExchangeScope> | undefined;

		function Consumer() {
			scopeState = useExchangeScope();
			return null;
		}

		function renderProvider() {
			root.render(createElement(ExchangeScopeProvider, null, createElement(Consumer)));
		}

		act(renderProvider);
		expect(scopeState?.scope).toBe("all");

		act(() => scopeState?.setScope("spot", undefined, "ETH/USDC"));
		expect(scopeState?.scope).toBe("spot");

		routerMocks.location = { pathname: "/trade/BTC", search: { scope: undefined } };
		act(renderProvider);

		expect(scopeState).toMatchObject({
			scope: "perp",
			dex: undefined,
			marketName: undefined,
			routeScope: "perp",
			routeMarketName: "BTC",
		});
	});
});
