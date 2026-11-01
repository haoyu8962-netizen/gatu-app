// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPortfolioQueryStatus, PORTFOLIO_MAX_AGE_MS, type PortfolioSourceStatus } from "@/domain/portfolio";
import { useDataReceivedSinceMount } from "@/hooks/portfolio/use-data-received-since-mount";
import { usePortfolioInfo } from "@/hooks/portfolio/use-portfolio-info";

const transport = vi.hoisted(() => ({ queryFn: vi.fn() }));

vi.mock("@sairn/hl-react", () => ({ useHyperliquidTransport: () => ({ env: "Mainnet", info: {} }) }));
vi.mock("@/lib/hyperliquid", () => ({
	infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
		queryKey: ["hl", env, method, params],
		queryFn: transport.queryFn,
	}),
}));

const OWNER = "0x1111111111111111111111111111111111111111";

const QUERY_KEY = ["portfolio-refresh-since-mount"];

const state = {
	clockOffset: 0,
	pending: [] as Array<{ resolve: (value: string) => void; reject: (error: Error) => void }>,
	refetch: null as (() => Promise<unknown>) | null,
	statuses: [] as PortfolioSourceStatus[],
};

function Probe() {
	const query = useQuery({
		queryKey: QUERY_KEY,
		queryFn: () =>
			new Promise<string>((resolve, reject) => {
				state.pending.push({ resolve, reject });
			}),
		refetchOnMount: "always",
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const receivedSinceMount = useDataReceivedSinceMount(JSON.stringify(QUERY_KEY), query.dataUpdatedAt);
	state.refetch = () => query.refetch({ cancelRefetch: false });
	state.statuses.push(getPortfolioQueryStatus({ ...query, receivedSinceMount }, true, Date.now() + state.clockOffset));
	return null;
}

const infoResults: Array<{ isFetchedAfterMount: boolean; receivedSinceMount: boolean }> = [];

function InfoProbe() {
	const query = usePortfolioInfo("portfolio", { user: OWNER }, "unifiedAccount", true);
	infoResults.push({ isFetchedAfterMount: query.isFetchedAfterMount, receivedSinceMount: query.receivedSinceMount });
	return null;
}

const received: boolean[] = [];

function KeyProbe({ queryKey, dataUpdatedAt }: { queryKey: string; dataUpdatedAt: number }) {
	received.push(useDataReceivedSinceMount(queryKey, dataUpdatedAt));
	return null;
}

async function flush() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function lastStatus(): PortfolioSourceStatus | undefined {
	return state.statuses.at(-1);
}

describe("portfolio refresh exception with a real query", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		client = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retryDelay: 0 } } });
		transport.queryFn.mockReset();
		infoResults.length = 0;
		state.clockOffset = 0;
		state.pending = [];
		state.refetch = null;
		state.statuses = [];
		container = document.createElement("div");
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		client.clear();
	});

	async function mount() {
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<Probe />
				</QueryClientProvider>,
			),
		);
		await flush();
	}

	it("never shows data cached before the mount while a retry after a failed mount request is on its way", async () => {
		client.setQueryData(QUERY_KEY, "cached before the mount", { updatedAt: Date.now() - 180_000 });
		await mount();
		expect(lastStatus()).toBe("loading");

		await act(async () => state.pending.shift()?.reject(new Error("unreachable")));
		await flush();
		expect(lastStatus()).toBe("error");

		void state.refetch?.();
		await flush();
		expect(state.pending).toHaveLength(1);
		expect(lastStatus()).toBe("error");
	});

	it("keeps data received since the mount while a refresh after it expired is on its way, then reports a failure", async () => {
		await mount();
		await act(async () => state.pending.shift()?.resolve("received after the mount"));
		await flush();
		expect(lastStatus()).toBe("ready");

		state.clockOffset = PORTFOLIO_MAX_AGE_MS + 1;
		void state.refetch?.();
		await flush();
		expect(lastStatus()).toBe("refreshing");

		await act(async () => state.pending.shift()?.reject(new Error("unreachable")));
		await flush();
		expect(lastStatus()).toBe("error");
	});

	it("starts again for another account or network, so its cached data does not count as received", async () => {
		received.length = 0;
		for (const [queryKey, dataUpdatedAt] of [
			["owner-a", 100],
			["owner-a", 200],
			["owner-b", 300],
			["owner-b", 300],
			["owner-b", 400],
		] as const) {
			await act(async () => root.render(<KeyProbe queryKey={queryKey} dataUpdatedAt={dataUpdatedAt} />));
		}

		expect(received.at(0)).toBe(false);
		expect(received.at(-1)).toBe(true);
		expect(received.slice(1)).toEqual([true, false, false, false, true]);
	});

	it("does not count a portfolio source cached before the mount as received after its mount request failed", async () => {
		client.setQueryData(["hl", "Mainnet", "portfolio", { user: OWNER }, "portfolio", "unifiedAccount"], [], {
			updatedAt: Date.now() - 180_000,
		});
		transport.queryFn.mockRejectedValue(new Error("unreachable"));
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<InfoProbe />
				</QueryClientProvider>,
			),
		);
		await flush();
		await flush();

		expect(transport.queryFn).toHaveBeenCalledTimes(2);
		expect(infoResults.at(-1)).toEqual({ isFetchedAfterMount: true, receivedSinceMount: false });

		transport.queryFn.mockResolvedValue([]);
		await act(async () => root.render(null));
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<InfoProbe />
				</QueryClientProvider>,
			),
		);
		await flush();
		expect(infoResults.at(-1)).toEqual({ isFetchedAfterMount: true, receivedSinceMount: true });
	});
});
