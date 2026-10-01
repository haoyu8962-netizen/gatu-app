// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavDrawer } from "@/components/trade/mobile/mobile-nav-drawer";
import { createI18nRoot } from "./harness/react";

const drawerState = vi.hoisted(() => ({
	complete: undefined as ((open: boolean) => void) | undefined,
	settingsOpen: vi.fn(),
	preloadGlobalModal: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock("@gatu/ui", () => {
	function Button({
		children,
		onClick,
		disabled,
		"aria-label": ariaLabel,
	}: {
		children?: ReactNode;
		onClick?: () => void;
		disabled?: boolean;
		"aria-label"?: string;
	}) {
		return createElement("button", { type: "button", onClick, disabled, "aria-label": ariaLabel }, children);
	}
	return {
		Button,
		ButtonIcon: Button,
		Drawer: ({
			children,
			open,
			onOpenChange,
			onOpenChangeComplete,
		}: {
			children: ReactNode;
			open: boolean;
			onOpenChange: (open: boolean) => void;
			onOpenChangeComplete: (open: boolean) => void;
		}) => {
			drawerState.complete = onOpenChangeComplete;
			return createElement(
				"section",
				{ "data-drawer-open": String(open) },
				children,
				createElement("button", {
					type: "button",
					"data-testid": "complete-close",
					onClick: () => onOpenChangeComplete(false),
				}),
				createElement("button", { type: "button", "data-testid": "dismiss", onClick: () => onOpenChange(false) }),
			);
		},
		DrawerContent: ({ children }: { children: ReactNode }) => createElement("div", { role: "dialog" }, children),
		DrawerTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	};
});

vi.mock("@/components/trade/header/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/hooks/trade/use-trade-home-path", () => ({ useTradeHomePath: () => "/trade/HYPE" }));
vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({ available: true, path: "external", unavailableReason: null }),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: false, sessionMode: "disconnected" }),
}));
vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useSettingsDialogActions: () => ({ open: drawerState.settingsOpen }),
}));
vi.mock("@/components/trade/components/lazy-global-modals", () => ({
	preloadGlobalModal: drawerState.preloadGlobalModal,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function createTestRouter(initialPath: string) {
	const rootRoute = createRootRoute({
		component: () => (
			<>
				<MobileNavDrawer />
				<Outlet />
			</>
		),
	});
	const routes = [
		"/trade/HYPE",
		"/portfolio",
		"/earn",
		"/vaults",
		"/staking",
		"/referrals",
		"/leaderboard",
		"/fundingComparison",
		"/api-wallet",
		"/docs",
		"/support",
	].map((path) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path,
			component: () => <main data-page={path}>{path}</main>,
		}),
	);
	return createRouter({
		routeTree: rootRoute.addChildren(routes),
		history: createMemoryHistory({ initialEntries: [initialPath] }),
		defaultPendingMinMs: 0,
	});
}

describe("MobileNavDrawer navigation with the real router", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;
	let router: ReturnType<typeof createTestRouter>;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		drawerState.complete = undefined;
		drawerState.settingsOpen.mockReset();
		drawerState.preloadGlobalModal.mockReset();
		drawerState.preloadGlobalModal.mockResolvedValue(undefined);
		vi.spyOn(window, "scrollTo").mockImplementation(() => {});
		container = document.createElement("div");
		document.body.append(container);
		root = createI18nRoot(container);
	});

	afterEach(async () => {
		await act(async () => root?.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	function button(selector: string) {
		const found = container.querySelector<HTMLButtonElement>(selector);
		if (!found) throw new Error(`Missing button: ${selector}`);
		return found;
	}

	function link(label: string) {
		const found = [...container.querySelectorAll<HTMLAnchorElement>("a")].find(
			(item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label,
		);
		if (!found) throw new Error(`Missing link: ${label}`);
		return found;
	}

	async function mount(initialPath = "/portfolio") {
		router = createTestRouter(initialPath);
		await act(async () => {
			await router.load();
			root?.render(<RouterProvider router={router} />);
		});
		await act(async () => button('button[aria-label="Open navigation"]').click());
	}

	async function completeClose() {
		await act(async () => button('[data-testid="complete-close"]').click());
	}

	async function expectPath(pathname: string) {
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(router.state.location.pathname).toBe(pathname);
			expect(container.querySelector("[data-page]")?.getAttribute("data-page")).toBe(pathname);
		});
	}

	it("preloads immediately but commits only after closing, exactly once", async () => {
		await mount();
		const preload = vi.spyOn(router, "preloadRoute");
		const navigate = vi.spyOn(router, "navigate");
		await act(async () => link("Earn").click());
		expect(preload).toHaveBeenCalledWith({ to: "/earn" });
		expect(navigate).not.toHaveBeenCalled();
		expect(router.state.location.pathname).toBe("/portfolio");
		expect(container.querySelector("[data-drawer-open]")?.getAttribute("data-drawer-open")).toBe("false");
		await act(async () => drawerState.complete?.(true));
		expect(navigate).not.toHaveBeenCalled();
		await completeClose();
		await expectPath("/earn");
		await completeClose();
		expect(navigate).toHaveBeenCalledTimes(1);
	});

	it.each(["Trade", "Sairn"])("preserves scope search through the %s link", async (label) => {
		await mount();
		expect(link(label).getAttribute("href")).toBe("/trade/HYPE?scope=all");
		await act(async () => link(label).click());
		expect(router.state.location.pathname).toBe("/portfolio");
		await completeClose();
		await expectPath("/trade/HYPE");
		expect(router.state.location.search).toEqual({ scope: "all" });
	});

	it("preserves same-page navigation after the close", async () => {
		await mount();
		const navigate = vi.spyOn(router, "navigate");
		await act(async () => link("Portfolio").click());
		expect(navigate).not.toHaveBeenCalled();
		await completeClose();
		expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: "/portfolio" });
		await expectPath("/portfolio");
	});

	it.each(["pending", "rejected"])("does not wait for a %s preload", async (state) => {
		await mount();
		const preload = vi.spyOn(router, "preloadRoute");
		if (state === "pending") preload.mockImplementation(() => new Promise(() => {}));
		else preload.mockRejectedValue(new Error("preload unavailable"));
		await act(async () => link("Earn").click());
		await completeClose();
		await expectPath("/earn");
	});

	it.each([
		["Meta", { metaKey: true }],
		["Control", { ctrlKey: true }],
		["Shift", { shiftKey: true }],
		["Alt", { altKey: true }],
		["middle button", { button: 1 }],
	] as const)("does not intercept a %s click", async (_label, options) => {
		await mount();
		const navigate = vi.spyOn(router, "navigate");
		let wasPrevented: boolean | undefined;
		const suppressJsdomNavigation = (event: Event) => {
			wasPrevented = event.defaultPrevented;
			event.preventDefault();
		};
		document.addEventListener("click", suppressJsdomNavigation, { once: true });
		await act(async () =>
			link("Earn").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options })),
		);
		expect(wasPrevented).toBe(false);
		await completeClose();
		expect(navigate).not.toHaveBeenCalled();
		expect(router.state.location.pathname).toBe("/portfolio");
	});

	it.each(["reopen", "close button", "native dismiss"])("cancels queued navigation on %s", async (action) => {
		await mount();
		const navigate = vi.spyOn(router, "navigate");
		await act(async () => link("Earn").click());
		const selector =
			action === "reopen"
				? 'button[aria-label="Open navigation"]'
				: action === "close button"
					? 'button[aria-label="Close navigation"]'
					: '[data-testid="dismiss"]';
		await act(async () => button(selector).click());
		await completeClose();
		expect(navigate).not.toHaveBeenCalled();
		expect(router.state.location.pathname).toBe("/portfolio");
	});

	it("cancels queued navigation when another router navigation takes over", async () => {
		await mount();
		await act(async () => link("Earn").click());
		await act(async () => router.navigate({ to: "/vaults" }));
		await completeClose();
		await expectPath("/vaults");
	});

	it("cannot navigate through a retained completion after unmount", async () => {
		await mount();
		const navigate = vi.spyOn(router, "navigate");
		await act(async () => link("Earn").click());
		const complete = drawerState.complete;
		await act(async () => root?.unmount());
		root = undefined;
		await act(async () => complete?.(false));
		expect(navigate).not.toHaveBeenCalled();
	});

	it("ignores a second destination and modal request while the drawer is closing for navigation", async () => {
		await mount();
		await act(async () => {
			link("Earn").click();
			link("Vaults").click();
			button('button[aria-label="Settings"]').click();
		});
		await completeClose();
		await expectPath("/earn");
		expect(drawerState.preloadGlobalModal).not.toHaveBeenCalled();
		expect(drawerState.settingsOpen).not.toHaveBeenCalled();
	});

	it("reopens with retry feedback after navigation rejects and can navigate on retry", async () => {
		await mount();
		const navigate = vi.spyOn(router, "navigate").mockRejectedValueOnce(new Error("navigation unavailable"));
		await act(async () => link("Earn").click());
		await completeClose();
		expect(container.querySelector("[data-drawer-open]")?.getAttribute("data-drawer-open")).toBe("true");
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Try again");
		expect(router.state.location.pathname).toBe("/portfolio");
		await act(async () => link("Earn").click());
		expect(container.querySelector('[role="alert"]')).toBeNull();
		await completeClose();
		await expectPath("/earn");
		expect(navigate).toHaveBeenCalledTimes(2);
	});

	it.each(["reopen", "unmount"])("ignores a late navigation failure after %s", async (action) => {
		await mount();
		let rejectNavigation: ((reason: Error) => void) | undefined;
		vi.spyOn(router, "navigate").mockImplementationOnce(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectNavigation = reject;
				}),
		);
		await act(async () => link("Earn").click());
		await completeClose();
		if (action === "reopen") {
			await act(async () => button('button[aria-label="Open navigation"]').click());
		} else {
			await act(async () => root?.unmount());
			root = undefined;
		}
		await act(async () => rejectNavigation?.(new Error("superseded navigation")));
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it("does not reopen the drawer when an older navigation rejects after another route commits", async () => {
		await mount();
		let rejectNavigation: ((reason: Error) => void) | undefined;
		vi.spyOn(router, "navigate").mockImplementationOnce(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectNavigation = reject;
				}),
		);
		await act(async () => link("Earn").click());
		await completeClose();
		await act(async () => router.navigate({ to: "/vaults" }));
		await expectPath("/vaults");
		await act(async () => rejectNavigation?.(new Error("superseded navigation")));
		expect(container.querySelector("[data-drawer-open]")?.getAttribute("data-drawer-open")).toBe("false");
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});
});
