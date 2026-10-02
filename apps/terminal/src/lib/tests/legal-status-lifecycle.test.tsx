// @vitest-environment jsdom

import { useLegalStatusLifecycle } from "@sairn/hl-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("legal status page lifecycle", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient();
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
	});

	it("invalidates every owner legal query after BFCache restore", () => {
		const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

		function Probe() {
			useLegalStatusLifecycle();
			return null;
		}

		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			);
		});

		act(() => window.dispatchEvent(new Event("pageshow")));
		expect(invalidateQueries).not.toHaveBeenCalled();

		const restored = new Event("pageshow") as PageTransitionEvent;
		Object.defineProperty(restored, "persisted", { value: true });
		act(() => window.dispatchEvent(restored));

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["hl", "info", "legalCheck"] });
	});
});
