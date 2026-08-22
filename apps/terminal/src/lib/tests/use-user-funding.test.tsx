// @vitest-environment jsdom

import type { UserFundingResponse, UserFundingsWsEvent } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserFunding } from "@/hooks/trade/use-user-funding";

const ADDRESS_A = "0x1111111111111111111111111111111111111111" as const;
const ADDRESS_B = "0x2222222222222222222222222222222222222222" as const;
const NOW = 1_800_000_000_000;
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	env: "Mainnet",
	isConnected: true,
	subscription: {
		data: undefined as UserFundingsWsEvent | undefined,
		error: undefined as unknown,
		status: "idle" as "active" | "error" | "idle" | "subscribing",
	},
	userFunding: vi.fn(),
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: mocks.isConnected }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: mocks.env, info: { userFunding: mocks.userFunding } }),
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		return mocks.subscription;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useUserFunding> | null = null;

function Probe() {
	hookValue = useUserFunding();
	return null;
}

function createRestFunding(time: number, usdc: string): UserFundingResponse[number] {
	return {
		delta: { coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "1", type: "funding", usdc },
		hash: `0x${time.toString(16).padStart(64, "0")}`,
		time,
	};
}

describe("useUserFunding", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
		hookValue = null;
		mocks.address = ADDRESS_A;
		mocks.env = "Mainnet";
		mocks.isConnected = true;
		mocks.subscription.data = undefined;
		mocks.subscription.error = undefined;
		mocks.subscription.status = "idle";
		mocks.userFunding.mockReset().mockResolvedValue([]);
		mocks.useSubscription.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
	});

	function renderHook() {
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			);
		});
	}

	async function waitUntilReady() {
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("ready"));
		});
		if (!hookValue) throw new Error("Missing user funding hook value");
		return hookValue;
	}

	it("merges the paginated Info window with realtime funding and deduplicates their overlap", async () => {
		const restTime = NOW - 1_000;
		mocks.userFunding.mockResolvedValue([createRestFunding(restTime, "1")]);
		mocks.subscription.data = {
			fundings: [
				{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "1", time: NOW, usdc: "2" },
				{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "1", time: restTime, usdc: "1" },
			],
			isSnapshot: true,
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		const result = await waitUntilReady();

		expect(result.fundings.map((funding) => funding.time)).toEqual([NOW, restTime]);
		expect(mocks.userFunding).toHaveBeenCalledWith(
			expect.objectContaining({ endTime: NOW, startTime: NOW - LOOKBACK_MS, user: ADDRESS_A }),
			expect.any(AbortSignal),
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith("userFundings", { user: ADDRESS_A }, { enabled: true });
	});

	it("walks multiple busy Info pages and keeps the latest display window", async () => {
		const rangeStart = NOW - LOOKBACK_MS;
		const events = Array.from({ length: 1_200 }, (_, index) =>
			createRestFunding(rangeStart + index + 1, `${index + 1}`),
		);
		mocks.userFunding.mockImplementation(async ({ startTime }: { startTime: number }) =>
			events.filter((event) => event.time >= startTime).slice(0, 500),
		);

		renderHook();
		const result = await waitUntilReady();

		expect(mocks.userFunding).toHaveBeenCalledTimes(4);
		expect(result.fundings).toHaveLength(200);
		expect(result.fundings.at(0)?.time).toBe(rangeStart + 1_200);
		expect(result.fundings.at(-1)?.time).toBe(rangeStart + 1_001);
	});

	it("reports an incomplete same-timestamp REST snapshot even when realtime data is active", async () => {
		const page = Array.from({ length: 500 }, (_, index) => createRestFunding(NOW - 1_000, `${index + 1}`));
		mocks.userFunding.mockResolvedValue(page);
		mocks.subscription.data = {
			fundings: [{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "1", time: NOW, usdc: "2" }],
			isSnapshot: true,
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toMatchObject({ name: "IncompleteHistorySnapshotError" });
	});

	it("does not let a realtime funding update hide a failed REST snapshot", async () => {
		const error = new Error("Info unavailable");
		mocks.userFunding.mockRejectedValue(error);
		mocks.subscription.data = {
			fundings: [{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "1", time: NOW, usdc: "2" }],
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toBe(error);
	});

	it("fails closed when REST returns an invalid pagination timestamp", async () => {
		mocks.userFunding.mockResolvedValue([createRestFunding(Number.NaN, "1")]);

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toMatchObject({ name: "MalformedHistoryPageError" });
		expect(mocks.userFunding).toHaveBeenCalledTimes(1);
	});

	it("fails closed when a realtime funding update has no market identity", async () => {
		mocks.subscription.data = {
			fundings: [{ coin: "", fundingRate: "0.0001", nSamples: null, szi: "1", time: NOW, usdc: "2" }],
			isSnapshot: true,
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("fails closed instead of throwing when realtime funding is not an array", async () => {
		mocks.subscription.data = {
			fundings: { items: [] } as never,
			isSnapshot: true,
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("aborts the previous request and isolates cache keys when owner and environment change", async () => {
		let firstSignal: AbortSignal | undefined;
		mocks.userFunding.mockImplementation(
			({ user }: { user: string }, signal: AbortSignal): Promise<UserFundingResponse> => {
				if (user === ADDRESS_B) return Promise.resolve([]);
				firstSignal = signal;
				return new Promise((_, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError")),
						{ once: true },
					);
				});
			},
		);

		renderHook();
		await vi.waitFor(() => expect(firstSignal).toBeDefined());
		mocks.address = ADDRESS_B;
		mocks.env = "Testnet";
		renderHook();
		await waitUntilReady();

		expect(firstSignal?.aborted).toBe(true);
		const queryKeys = queryClient
			.getQueryCache()
			.getAll()
			.map((query) => query.queryKey);
		expect(queryKeys).toContainEqual(["hl", "recent-history", "userFunding", "Mainnet", ADDRESS_A]);
		expect(queryKeys).toContainEqual(["hl", "recent-history", "userFunding", "Testnet", ADDRESS_B]);
	});

	it("does not mistake an empty realtime snapshot for confirmed empty REST history", async () => {
		mocks.userFunding.mockImplementation(
			(_params: unknown, signal: AbortSignal): Promise<UserFundingResponse> =>
				new Promise((_, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError")),
						{ once: true },
					);
				}),
		);
		mocks.subscription.data = { fundings: [], isSnapshot: true, user: ADDRESS_A };
		mocks.subscription.status = "active";

		renderHook();

		expect(hookValue?.status).toBe("loading");
	});
});
