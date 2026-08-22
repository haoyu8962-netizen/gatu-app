// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";

const mocks = vi.hoisted(() => ({
	getGeo: vi.fn(),
}));

vi.mock("@/lib/geo/get-geo", () => ({
	getGeo: mocks.getGeo,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useGeoRestriction> | null = null;

function Probe() {
	hookValue = useGeoRestriction();
	return null;
}

describe("useGeoRestriction", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
		hookValue = null;
		mocks.getGeo.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.clearAllMocks();
	});

	function renderHook() {
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		if (!hookValue) throw new Error("Missing geo restriction hook value");
		return hookValue;
	}

	it("fails closed on the initial render without losing diagnostic defaults", () => {
		mocks.getGeo.mockReturnValue(new Promise(() => {}));

		const result = renderHook();

		expect(result).toMatchObject({
			actionsBlocked: true,
			country: null,
			isError: false,
			isResolved: false,
			isResolving: true,
			proxy: false,
			tradeRestricted: false,
		});
	});

	it("allows actions only after an unrestricted country resolves", async () => {
		mocks.getGeo.mockResolvedValue({ country: "GB", proxy: false, tradeRestricted: false });
		renderHook();

		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.isResolved).toBe(true));
		});

		expect(hookValue).toMatchObject({
			actionsBlocked: false,
			country: "GB",
			isError: false,
			isResolved: true,
			isResolving: false,
			proxy: false,
			tradeRestricted: false,
		});
	});

	it.each([
		{ country: "US", proxy: false, tradeRestricted: true },
		{ country: "GB", proxy: true, tradeRestricted: false },
	])("keeps resolved restricted or proxy verdicts blocked", async (verdict) => {
		mocks.getGeo.mockResolvedValue(verdict);
		renderHook();

		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.isResolved).toBe(true));
		});

		expect(hookValue).toMatchObject({
			actionsBlocked: true,
			country: verdict.country,
			isResolved: true,
			proxy: verdict.proxy,
			tradeRestricted: true,
		});
	});

	it("treats a successful response with no resolved country as fail closed", async () => {
		mocks.getGeo.mockResolvedValue({ country: null, proxy: false, tradeRestricted: false });
		renderHook();

		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.isResolving).toBe(false));
		});

		expect(hookValue).toMatchObject({
			actionsBlocked: true,
			country: null,
			isError: false,
			isResolved: false,
			proxy: false,
			tradeRestricted: false,
		});
	});

	it("fails closed on a query error and exposes a diagnostic retry", async () => {
		mocks.getGeo.mockRejectedValue(new Error("geo unavailable"));
		renderHook();

		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.isError).toBe(true));
		});

		expect(mocks.getGeo).toHaveBeenCalledTimes(2);
		expect(hookValue).toMatchObject({
			actionsBlocked: true,
			country: null,
			isError: true,
			isResolved: false,
			isResolving: false,
			proxy: false,
			tradeRestricted: false,
		});

		mocks.getGeo.mockReset().mockResolvedValue({ country: "GB", proxy: false, tradeRestricted: false });
		await act(async () => {
			await hookValue?.retry();
			await vi.waitFor(() => expect(hookValue?.isResolved).toBe(true));
		});

		expect(hookValue).toMatchObject({
			actionsBlocked: false,
			country: "GB",
			isError: false,
			isResolved: true,
			isResolving: false,
			proxy: false,
			tradeRestricted: false,
		});
	});

	it("preserves the last country and proxy diagnostics while a refetch error blocks actions", async () => {
		mocks.getGeo.mockResolvedValueOnce({ country: "GB", proxy: true, tradeRestricted: true });
		renderHook();

		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.isResolved).toBe(true));
		});

		mocks.getGeo.mockRejectedValue(new Error("geo refresh unavailable"));
		await act(async () => {
			await hookValue?.retry();
			await vi.waitFor(() => expect(hookValue?.isError).toBe(true));
		});

		expect(hookValue).toMatchObject({
			actionsBlocked: true,
			country: "GB",
			isError: true,
			isResolved: false,
			isResolving: false,
			proxy: true,
			tradeRestricted: true,
		});
	});
});
