// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query";
import {
	type AnyRouter,
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	RouterProvider,
	redirect,
} from "@tanstack/react-router";
import { act, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketsInfoContext } from "@/lib/hyperliquid/hooks/MarketsInfoProvider";
import { useClientRuntimeReady } from "@/providers/client-runtime";
import { RootProvider } from "@/providers/root";
import { Route } from "@/routes/__root";

const runtime = vi.hoisted(() => {
	window.history.replaceState(null, "", "/terms");
	return {
		ready: true,
		walletModuleLoads: 0,
		walletMounts: 0,
		walletUnmounts: 0,
		marketMounts: 0,
		marketUnmounts: 0,
		tradeMounts: 0,
		tradeUnmounts: 0,
		reportClientError: vi.fn(),
	};
});

vi.mock("@/lib/i18n", () => ({ getPersistedLocale: () => "en", i18nReady: Promise.resolve() }));
vi.mock("@/bones/registry", () => ({}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/funds-action/funds-action-recovery-host", () => ({ FundsActionRecoveryHost: () => null }));
vi.mock("@/components/pages/not-found-page", () => ({ NotFoundPage: () => <span>Not found</span> }));
vi.mock("@/components/pages/router-error-page", () => ({
	RouterErrorPage: () => <span role="alert">Router failed</span>,
}));
vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: runtime.reportClientError }));
vi.mock("@/providers/exchange-scope", () => ({
	ExchangeScopeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/providers/client-root", async () => {
	const { ClientRuntimeProvider } = await import("@/providers/client-runtime");
	runtime.walletModuleLoads += 1;
	return {
		ClientRootProvider: function ClientRootProvider({ children }: { children: ReactNode }) {
			useEffect(() => {
				runtime.walletMounts += 1;
				return () => {
					runtime.walletUnmounts += 1;
				};
			}, []);
			return <ClientRuntimeProvider ready={runtime.ready}>{children}</ClientRuntimeProvider>;
		},
	};
});
vi.mock("@/lib/hyperliquid/hooks/useMarketsInfo", () => ({
	useMarketsInfoInternal: () => {
		useEffect(() => {
			runtime.marketMounts += 1;
			return () => {
				runtime.marketUnmounts += 1;
			};
		}, []);
		return { markets: [] };
	},
}));

const DOCUMENT_PATHS = ["/cookies", "/docs", "/privacy", "/risk", "/support", "/terms"] as const;

function TradeProbe() {
	useMarketsInfoContext();
	const ready = useClientRuntimeReady();
	if (!ready) throw new Error("Trade route rendered without the client wallet runtime");
	useEffect(() => {
		runtime.tradeMounts += 1;
		return () => {
			runtime.tradeUnmounts += 1;
		};
	}, []);
	return <main data-page="trade">Trading route</main>;
}

function DashboardProbe() {
	useMarketsInfoContext();
	if (!useClientRuntimeReady()) throw new Error("Dashboard rendered without the client wallet runtime");
	return <main data-page="dashboard">Dashboard route</main>;
}

function createDeferredLoader() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((release) => {
		resolve = release;
	});
	return { promise, resolve, started: false };
}

describe("root route provider lifetime during committed route transitions", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let router: AnyRouter;
	let loaders: Map<string, ReturnType<typeof createDeferredLoader>>;

	beforeEach(() => {
		runtime.ready = true;
		runtime.walletMounts = 0;
		runtime.walletUnmounts = 0;
		runtime.marketMounts = 0;
		runtime.marketUnmounts = 0;
		runtime.tradeMounts = 0;
		runtime.tradeUnmounts = 0;
		runtime.reportClientError.mockClear();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(window, "scrollTo").mockImplementation(() => {});
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		loaders = new Map();
	});

	afterEach(async () => {
		await act(async () => {
			for (const loader of loaders.values()) loader.resolve();
			root.unmount();
		});
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
	});

	async function mount(initialPath: string, expectContent = true) {
		const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
			component: Route.options.component,
			errorComponent: Route.options.errorComponent,
			notFoundComponent: Route.options.notFoundComponent,
		});
		const children = [
			...DOCUMENT_PATHS,
			"/trade/HYPE",
			"/trade/BTC",
			"/portfolio",
			"/vaults",
			"/redirect-to-terms",
		].map((path) =>
			createRoute({
				getParentRoute: () => rootRoute,
				path,
				loader: () => {
					if (path === "/redirect-to-terms") throw redirect({ to: "/terms" });
					const loader = loaders.get(path);
					if (!loader) return;
					loader.started = true;
					return loader.promise;
				},
				component: path.startsWith("/trade/")
					? TradeProbe
					: ["/portfolio", "/vaults"].includes(path)
						? DashboardProbe
						: () => <main data-page={path}>{path}</main>,
			}),
		);
		router = createRouter({
			routeTree: rootRoute.addChildren(children),
			history: createMemoryHistory({ initialEntries: [initialPath] }),
			context: { queryClient },
			defaultPendingMs: 60_000,
			defaultPendingMinMs: 0,
			InnerWrap: ({ children }: { children: ReactNode }) => (
				<RootProvider queryClient={queryClient}>{children}</RootProvider>
			),
		});
		await act(async () => {
			await router.load();
			root.render(<RouterProvider router={router} />);
		});
		if (!expectContent) return;
		await expectPage(
			initialPath.startsWith("/trade/") ? "trade" : initialPath === "/portfolio" ? "dashboard" : initialPath,
		);
	}

	async function expectPage(page: string) {
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(runtime.reportClientError.mock.calls.map(([error]) => error)).toEqual([]);
			expect(container.querySelector("[data-page]")?.getAttribute("data-page")).toBe(page);
		});
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(runtime.reportClientError).not.toHaveBeenCalled();
	}

	async function startNavigation(path: string) {
		const loader = createDeferredLoader();
		loaders.set(path, loader);
		let completion = Promise.resolve();
		await act(async () => {
			completion = router.navigate({ to: path });
		});
		expect(loader.started).toBe(true);
		expect(router.state.location.pathname).toBe(path);
		return { loader, completion };
	}

	it("does not eagerly import the wallet runtime from the initial document URL", async () => {
		await vi.dynamicImportSettled();
		expect(runtime.walletModuleLoads).toBe(0);
	});

	it.each(DOCUMENT_PATHS)("does not import or mount the wallet runtime for a direct %s entry", async (path) => {
		const previousModuleLoads = runtime.walletModuleLoads;
		await mount(path);
		expect(runtime.walletModuleLoads).toBe(previousModuleLoads);
		expect(runtime.walletMounts).toBe(0);
		expect(runtime.marketMounts).toBe(0);
	});

	it.each(DOCUMENT_PATHS)("retains the trading providers until delayed %s navigation commits", async (path) => {
		await mount("/trade/HYPE");
		const navigation = await startNavigation(path);

		expect(router.state.matches.at(-1)?.pathname).toBe("/trade/HYPE");
		await expectPage("trade");
		expect(runtime.walletMounts).toBe(1);
		expect(runtime.walletUnmounts).toBe(0);
		expect(runtime.marketUnmounts).toBe(0);
		expect(runtime.tradeUnmounts).toBe(0);

		await act(async () => {
			navigation.loader.resolve();
			await navigation.completion;
		});
		await expectPage(path);
		expect(router.state.matches.at(-1)?.pathname).toBe(path);
		expect(runtime.walletUnmounts).toBe(1);
		expect(runtime.marketUnmounts).toBe(1);
		expect(runtime.tradeUnmounts).toBe(1);
	});

	it.each(DOCUMENT_PATHS)(
		"keeps %s visible while the trading route loads and then supplies its providers",
		async (path) => {
			await mount(path);
			const navigation = await startNavigation("/trade/HYPE");

			expect(router.state.matches.at(-1)?.pathname).toBe(path);
			await expectPage(path);
			expect(runtime.walletMounts).toBe(0);
			expect(runtime.marketMounts).toBe(0);

			await act(async () => {
				navigation.loader.resolve();
				await navigation.completion;
			});
			await expectPage("trade");
			expect(runtime.walletMounts).toBe(1);
			expect(runtime.marketMounts).toBe(1);
			expect(runtime.tradeMounts).toBe(1);
		},
	);

	it("preserves the mounted trading runtime when document navigation is superseded", async () => {
		await mount("/trade/HYPE");
		const documentNavigation = await startNavigation("/terms");
		const tradeNavigation = await startNavigation("/trade/BTC");

		await expectPage("trade");
		expect(runtime.walletUnmounts).toBe(0);
		expect(runtime.marketUnmounts).toBe(0);

		await act(async () => {
			tradeNavigation.loader.resolve();
			await tradeNavigation.completion;
		});
		await expectPage("trade");
		expect(router.state.matches.at(-1)?.pathname).toBe("/trade/BTC");
		expect(runtime.walletMounts).toBe(1);
		expect(runtime.marketMounts).toBe(1);

		await act(async () => {
			documentNavigation.loader.resolve();
			await documentNavigation.completion;
		});
		await expectPage("trade");
		expect(router.state.matches.at(-1)?.pathname).toBe("/trade/BTC");
		expect(runtime.walletUnmounts).toBe(0);
		expect(runtime.marketUnmounts).toBe(0);
	});

	it("keeps document content stable when a pending trading navigation is superseded", async () => {
		await mount("/terms");
		const tradeNavigation = await startNavigation("/trade/HYPE");
		const documentNavigation = await startNavigation("/privacy");
		await expectPage("/terms");
		expect(runtime.walletMounts).toBe(0);

		await act(async () => {
			documentNavigation.loader.resolve();
			await documentNavigation.completion;
			tradeNavigation.loader.resolve();
			await tradeNavigation.completion;
		});
		await expectPage("/privacy");
		expect(runtime.walletMounts).toBe(0);
		expect(runtime.marketMounts).toBe(0);
	});

	it.each(["/trade/BTC", "/portfolio", "/vaults"] as const)("uses the same empty announcement on %s", async (path) => {
		runtime.ready = false;
		await mount(path, false);
		await vi.waitFor(() => {
			expect(container.querySelector('[data-testid="startup-fallback"]')?.getAttribute("aria-busy")).toBe("true");
			expect(container.querySelector("nav, header, footer")).toBeNull();
			expect(container.querySelector("output")?.className).toBe("sr-only");
			expect(container.textContent).toBe("Loading GATU...");
		});
		const navigation = await startNavigation("/terms");
		await act(async () => {
			navigation.loader.resolve();
			await navigation.completion;
		});
		await expectPage("/terms");
	});

	it("preserves dashboard providers until its document destination commits", async () => {
		await mount("/portfolio");
		const navigation = await startNavigation("/terms");
		await expectPage("dashboard");
		expect(runtime.walletUnmounts).toBe(0);
		expect(runtime.marketUnmounts).toBe(0);
		await act(async () => {
			navigation.loader.resolve();
			await navigation.completion;
		});
		await expectPage("/terms");
		expect(runtime.walletUnmounts).toBe(1);
		expect(runtime.marketUnmounts).toBe(1);
	});

	it("keeps the trading context until a redirected document loader completes", async () => {
		await mount("/trade/HYPE");
		const loader = createDeferredLoader();
		loaders.set("/terms", loader);
		let completion = Promise.resolve();
		await act(async () => {
			completion = router.navigate({ href: "/redirect-to-terms" });
		});
		expect(loader.started).toBe(true);
		expect(router.state.matches.at(-1)?.pathname).toBe("/trade/HYPE");
		await expectPage("trade");
		await act(async () => {
			loader.resolve();
			await completion;
		});
		await expectPage("/terms");
	});

	it("can leave the terminal for an unknown route without losing its context during navigation", async () => {
		await mount("/trade/HYPE");
		await act(async () => {
			await router.navigate({ href: "/unknown-route" });
		});
		expect(container.textContent).toContain("Not found");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(runtime.reportClientError).not.toHaveBeenCalled();
	});

	it("restores trading and document providers correctly on browser back and forward", async () => {
		await mount("/trade/HYPE");
		await act(async () => {
			await router.navigate({ to: "/terms" });
		});
		await expectPage("/terms");

		await act(async () => {
			router.history.back();
		});
		await expectPage("trade");
		expect(runtime.walletMounts).toBe(2);
		expect(runtime.marketMounts).toBe(2);

		await act(async () => {
			router.history.forward();
		});
		await expectPage("/terms");
		expect(runtime.walletUnmounts).toBe(2);
		expect(runtime.marketUnmounts).toBe(2);
	});
});
