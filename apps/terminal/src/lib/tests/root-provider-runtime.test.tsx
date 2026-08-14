// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootProvider } from "@/providers/root";

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

	it("keeps a document route mounted across hydration without loading client providers", () => {
		let mounts = 0;
		let unmounts = 0;

		function DocumentProbe() {
			useEffect(() => {
				mounts += 1;
				return () => {
					unmounts += 1;
				};
			}, []);
			return <span data-testid="document">Document</span>;
		}

		act(() => {
			root.render(
				<RootProvider queryClient={queryClient}>
					<DocumentProbe />
				</RootProvider>,
			);
		});
		expect(container.textContent).toBe("Document");

		runtime.hydrated = true;
		act(() => {
			root.render(
				<RootProvider queryClient={queryClient}>
					<DocumentProbe />
				</RootProvider>,
			);
		});

		expect(container.textContent).toBe("Document");
		expect(mounts).toBe(1);
		expect(unmounts).toBe(0);
		expect(runtime.clientProviderRenders).toBe(0);
	});

	it("keeps fallback content visible for a trading route before hydration", () => {
		runtime.pathname = "/trade/HYPE";

		act(() => {
			root.render(
				<RootProvider queryClient={queryClient}>
					<span>Terminal frame</span>
				</RootProvider>,
			);
		});
		expect(container.textContent).toBe("Terminal frame");
		expect(runtime.clientProviderRenders).toBe(0);
	});
});
