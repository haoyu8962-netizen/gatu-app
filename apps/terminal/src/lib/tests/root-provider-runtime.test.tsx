// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientRuntimeGate, RootProvider } from "@/providers/root";

const runtime = vi.hoisted(() => ({
	clientProviderRenders: 0,
	hydrated: false,
	pathname: "/docs",
}));

vi.mock("@tanstack/react-router", () => ({
	useHydrated: () => runtime.hydrated,
	useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
		select({ location: { pathname: runtime.pathname } }),
}));

vi.mock("@/lib/i18n", () => ({}));

vi.mock("@/providers/client-root", () => ({
	ClientRootProvider: ({ children }: { children: React.ReactNode }) => {
		runtime.clientProviderRenders += 1;
		return children;
	},
}));

function MountProbe({ label, counters }: { label: string; counters: { mounts: number; unmounts: number } }) {
	useEffect(() => {
		counters.mounts += 1;
		return () => {
			counters.unmounts += 1;
		};
	}, [counters]);
	return <span>{label}</span>;
}

describe("root provider runtime boundary", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		runtime.clientProviderRenders = 0;
		runtime.hydrated = false;
		runtime.pathname = "/docs";
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		queryClient = new QueryClient();
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
	});

	it("keeps the document shell mounted across hydration on every route", () => {
		runtime.pathname = "/trade/HYPE";
		const counters = { mounts: 0, unmounts: 0 };

		function render() {
			act(() => {
				root.render(
					<RootProvider queryClient={queryClient}>
						<MountProbe label="Shell" counters={counters} />
					</RootProvider>,
				);
			});
		}

		render();
		expect(container.textContent).toBe("Shell");

		runtime.hydrated = true;
		render();

		expect(container.textContent).toBe("Shell");
		expect(counters.mounts).toBe(1);
		expect(counters.unmounts).toBe(0);
		expect(runtime.clientProviderRenders).toBe(0);
	});

	it("keeps a document route mounted across hydration without loading client providers", () => {
		const counters = { mounts: 0, unmounts: 0 };

		function render() {
			act(() => {
				root.render(
					<RootProvider queryClient={queryClient}>
						<ClientRuntimeGate>
							<MountProbe label="Document" counters={counters} />
						</ClientRuntimeGate>
					</RootProvider>,
				);
			});
		}

		render();
		expect(container.textContent).toBe("Document");

		runtime.hydrated = true;
		render();

		expect(container.textContent).toBe("Document");
		expect(counters.mounts).toBe(1);
		expect(counters.unmounts).toBe(0);
		expect(runtime.clientProviderRenders).toBe(0);
	});

	it("keeps fallback content visible for a trading route before hydration", () => {
		runtime.pathname = "/trade/HYPE";

		act(() => {
			root.render(
				<RootProvider queryClient={queryClient}>
					<ClientRuntimeGate>
						<span>Terminal frame</span>
					</ClientRuntimeGate>
				</RootProvider>,
			);
		});
		expect(container.textContent).toBe("Terminal frame");
		expect(runtime.clientProviderRenders).toBe(0);
	});

	it("activates the wallet runtime for a trading route after hydration", async () => {
		runtime.pathname = "/trade/HYPE";
		runtime.hydrated = true;

		await act(async () => {
			root.render(
				<RootProvider queryClient={queryClient}>
					<ClientRuntimeGate>
						<span>Terminal frame</span>
					</ClientRuntimeGate>
				</RootProvider>,
			);
		});
		for (let attempt = 0; attempt < 20 && runtime.clientProviderRenders === 0; attempt += 1) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		}

		expect(container.textContent).toBe("Terminal frame");
		expect(runtime.clientProviderRenders).toBeGreaterThan(0);
	});
});
