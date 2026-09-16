// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { act, type ComponentType, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { StartupFallback } from "@/components/startup-fallback";
import { Route } from "@/routes/__root";

const state = vi.hoisted(() => ({
	pathname: "/trade/BTC",
	gateReady: false,
	runtimeReady: false,
	finishLocale: () => {},
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useRouterState: () => state.pathname,
	Outlet: () => <header>交易</header>,
}));
vi.mock("@/providers/root", () => ({
	ClientRuntimeGate: ({ children, fallback }: { children: ReactNode; fallback: ReactNode }) =>
		state.gateReady ? children : fallback,
}));
vi.mock("@/providers/client-runtime", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/providers/client-runtime")>()),
	useClientRuntimeReady: () => state.runtimeReady,
}));
vi.mock("@/providers/exchange-scope", () => ({
	ExchangeScopeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/hyperliquid/hooks/MarketsInfoProvider", () => ({
	MarketsInfoProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/i18n", () => ({
	getPersistedLocale: () => "zh",
	i18nReady: {
		finally: (callback: () => void) => {
			state.finishLocale = callback;
		},
	},
}));
vi.mock("@/bones/registry", () => ({}));
vi.mock("@/components/app-runtime-overlays", () => ({ AppRuntimeOverlays: () => null, DocumentOverlays: () => null }));
const RootComponent = Route.options.component as ComponentType;

beforeEach(() => {
	state.gateReady = false;
	state.runtimeReady = false;
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

it.each(["/trade/BTC", "/portfolio", "/vaults"])(
	"hydrates the identical empty application fallback at %s without recoverable errors",
	async (pathname) => {
		state.pathname = pathname;
		const host = document.createElement("div");
		const html = renderToString(<RootComponent />);
		expect(html).toBe(renderToString(<StartupFallback />));
		host.innerHTML = html;
		expect(host.querySelector("header,nav,footer,button,input")).toBeNull();
		expect(host.querySelectorAll("output")).toHaveLength(1);
		expect(host.querySelector("output")?.className).toBe("sr-only");
		expect(host.firstElementChild?.getAttribute("aria-busy")).toBe("true");
		const onRecoverableError = vi.fn();
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			await act(async () => {
				root = hydrateRoot(host, <RootComponent />, { onRecoverableError });
			});
			expect(onRecoverableError).not.toHaveBeenCalled();
			expect(host.innerHTML).toBe(html);
		} finally {
			act(() => root?.unmount());
		}
	},
);

it.each(["/trade/BTC", "/portfolio", "/vaults"])(
	"keeps %s empty through all gates and reveals only the persisted locale",
	(pathname) => {
		state.pathname = pathname;
		const host = document.createElement("div");
		const root = createRoot(host);
		function render() {
			act(() => root.render(<RootComponent key={`${state.gateReady}:${state.runtimeReady}`} />));
		}
		function expectEmpty() {
			expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
			expect(host.querySelector("nav,header,footer")).toBeNull();
		}
		try {
			render();
			expectEmpty();
			state.gateReady = true;
			render();
			expectEmpty();
			state.runtimeReady = true;
			render();
			expectEmpty();
			act(() => {
				i18n.loadAndActivate({ locale: "zh", messages: {} });
				state.finishLocale();
			});
			render();
			expect(host.textContent).toBe("交易");
			expect(host.textContent).not.toContain("Trade");
		} finally {
			act(() => root.unmount());
		}
	},
);
