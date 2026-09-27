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
	useRouterState: ({
		select,
	}: {
		select: (state: { location: { pathname: string }; matches: { pathname: string }[] }) => string;
	}) => select({ location: { pathname: runtime.pathname }, matches: [{ pathname: runtime.pathname }] }),
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

	it.each(["/trade/HYPE", "/terms", "/docs"])(
		"does not mount %s content outside its client providers before hydration",
		(pathname) => {
			runtime.pathname = pathname;
			const counters = { mounts: 0, unmounts: 0 };

			act(() => {
				root.render(
					<RootProvider queryClient={queryClient}>
						<ClientRuntimeGate fallback={<span>Terminal frame</span>}>
							<MountProbe label="Trading route" counters={counters} />
						</ClientRuntimeGate>
					</RootProvider>,
				);
			});
			expect(container.textContent).toBe("Terminal frame");
			expect(counters).toEqual({ mounts: 0, unmounts: 0 });
			expect(runtime.clientProviderRenders).toBe(0);
		},
	);

	it("mounts business route content once after the client provider is ready", async () => {
		runtime.pathname = "/trade/HYPE";
		const counters = { mounts: 0, unmounts: 0 };

		function render() {
			root.render(
				<RootProvider queryClient={queryClient}>
					<ClientRuntimeGate fallback={<span>Terminal frame</span>}>
						<MountProbe label="Trading route" counters={counters} />
					</ClientRuntimeGate>
				</RootProvider>,
			);
		}

		act(render);
		expect(container.textContent).toBe("Terminal frame");
		expect(counters.mounts).toBe(0);

		runtime.hydrated = true;
		await act(async () => {
			render();
		});
		for (let attempt = 0; attempt < 20 && counters.mounts === 0; attempt += 1) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		}

		expect(container.textContent).toBe("Trading route");
		expect(counters).toEqual({ mounts: 1, unmounts: 0 });
		expect(runtime.clientProviderRenders).toBeGreaterThan(0);
	});
});
