// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { act, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStartupMilestones } from "@/lib/diagnostics/startup-milestones";

const state = vi.hoisted(() => ({
	localeCallbacks: [] as Array<() => void>,
	routerStatus: "pending" as "pending" | "idle",
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useRouterState: ({ select }: { select: (routerState: unknown) => unknown }) =>
		select({ status: state.routerStatus, resolvedLocation: state.routerStatus === "idle" ? {} : undefined }),
	Outlet: () => <header>交易</header>,
}));
vi.mock("@/providers/root", () => ({
	ClientRuntimeGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/providers/client-runtime", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/providers/client-runtime")>()),
	useClientRuntimeReady: () => true,
}));
vi.mock("@/providers/exchange-scope", () => ({
	ExchangeScopeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/hyperliquid/hooks/MarketsInfoProvider", () => ({
	MarketsInfoProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/i18n", () => ({
	LOCALE_CATALOG_READY_TIMEOUT_MS: 3000,
	getPersistedLocale: () => "zh",
	i18nReady: {
		finally: (callback: () => void) => {
			state.localeCallbacks.push(callback);
		},
	},
}));
vi.mock("@/bones/registry", () => ({}));
vi.mock("@/components/app-runtime-overlays", () => ({ AppRuntimeOverlays: () => null, DocumentOverlays: () => null }));

const { Route } = await import("@/routes/__root");
const RootComponent = Route.options.component as ComponentType;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});

afterEach(() => {
	act(() => root.unmount());
	host.remove();
});

it("records the runtime, catalog, reveal and route moments without changing what the gate renders", () => {
	function render() {
		root.render(<RootComponent />);
	}
	act(render);

	expect(host.querySelector("header")).toBeNull();
	expect(host.firstElementChild?.getAttribute("aria-busy")).toBe("true");
	const pending = getStartupMilestones();
	expect(pending.runtime).toBeTypeOf("number");
	expect(pending.fonts).toBeTypeOf("number");
	expect(pending.locale).toBeUndefined();
	expect(pending.reveal).toBeUndefined();
	expect(pending.route).toBeUndefined();

	act(() => {
		for (const callback of state.localeCallbacks) callback();
	});
	expect(host.querySelector("header")?.textContent).toBe("交易");
	const revealed = getStartupMilestones();
	expect(revealed.locale).toBeTypeOf("number");
	expect(revealed.reveal).toBeGreaterThanOrEqual(revealed.locale ?? Number.POSITIVE_INFINITY);
	expect(revealed.localeFallback).toBeTypeOf("number");

	state.routerStatus = "idle";
	act(render);
	expect(getStartupMilestones().route).toBeTypeOf("number");
});
