// @vitest-environment jsdom

import type { UserNonFundingLedgerUpdatesResponse, UserNonFundingLedgerUpdatesWsEvent } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountLedger } from "@/hooks/trade/use-account-ledger";

const ADDRESS_A = "0x1111111111111111111111111111111111111111" as const;
const ADDRESS_B = "0x2222222222222222222222222222222222222222" as const;
const NOW = 1_800_000_000_000;
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	env: "Mainnet",
	isConnected: true,
	subscription: {
		data: undefined as UserNonFundingLedgerUpdatesWsEvent | undefined,
		error: undefined as unknown,
		status: "idle" as "active" | "error" | "idle" | "subscribing",
	},
	userNonFundingLedgerUpdates: vi.fn(),
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: mocks.isConnected }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		env: mocks.env,
		info: { userNonFundingLedgerUpdates: mocks.userNonFundingLedgerUpdates },
	}),
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		return mocks.subscription;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useAccountLedger> | null = null;
let ledgerEnabled = true;

function Probe() {
	hookValue = useAccountLedger({ enabled: ledgerEnabled });
	return null;
}

function createDeposit(time: number): UserNonFundingLedgerUpdatesResponse[number] {
	return {
		delta: { type: "deposit", usdc: "5" },
		hash: `0x${time.toString(16).padStart(64, "0")}`,
		time,
	};
}

describe("useAccountLedger", () => {
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
		ledgerEnabled = true;
		mocks.address = ADDRESS_A;
		mocks.env = "Mainnet";
		mocks.isConnected = true;
		mocks.subscription.data = undefined;
		mocks.subscription.error = undefined;
		mocks.subscription.status = "idle";
		mocks.userNonFundingLedgerUpdates.mockReset().mockResolvedValue([]);
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
		if (!hookValue) throw new Error("Missing account ledger hook value");
		return hookValue;
	}

	it("uses the documented paginated REST request and WebSocket subscription", async () => {
		mocks.userNonFundingLedgerUpdates.mockResolvedValue([createDeposit(NOW - 1_000)]);

		renderHook();
		const result = await waitUntilReady();

		expect(result.rows).toHaveLength(1);
		expect(mocks.userNonFundingLedgerUpdates).toHaveBeenCalledWith(
			expect.objectContaining({ endTime: NOW, startTime: NOW - LOOKBACK_MS, user: ADDRESS_A }),
			expect.any(AbortSignal),
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userNonFundingLedgerUpdates",
			{ user: ADDRESS_A },
			{ enabled: true },
		);
		expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual([
			"hl",
			"recent-history",
			"userNonFundingLedgerUpdates",
			"Mainnet",
			ADDRESS_A,
		]);
	});

	it("walks multiple busy Info pages and keeps the latest display window", async () => {
		const rangeStart = NOW - LOOKBACK_MS;
		const updates = Array.from({ length: 1_200 }, (_, index) => createDeposit(rangeStart + index + 1));
		mocks.userNonFundingLedgerUpdates.mockImplementation(async ({ startTime }: { startTime: number }) =>
			updates.filter((update) => update.time >= startTime).slice(0, 500),
		);

		renderHook();
		const result = await waitUntilReady();

		expect(mocks.userNonFundingLedgerUpdates).toHaveBeenCalledTimes(4);
		expect(result.rows).toHaveLength(200);
		expect(result.rows.at(0)?.time).toBe(rangeStart + 1_200);
		expect(result.rows.at(-1)?.time).toBe(rangeStart + 1_001);
	});

	it("reports an incomplete same-timestamp REST snapshot even when realtime data is active", async () => {
		const page = Array.from({ length: 500 }, () => createDeposit(NOW - 1_000));
		page.forEach((update, index) => {
			update.hash = `0x${(index + 1).toString(16).padStart(64, "0")}`;
		});
		mocks.userNonFundingLedgerUpdates.mockResolvedValue(page);
		mocks.subscription.data = {
			isSnapshot: true,
			nonFundingLedgerUpdates: [createDeposit(NOW)],
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toMatchObject({ name: "IncompleteHistorySnapshotError" });
	});

	it("does not let a realtime ledger update hide a failed REST snapshot", async () => {
		const error = new Error("Info unavailable");
		mocks.userNonFundingLedgerUpdates.mockRejectedValue(error);
		mocks.subscription.data = {
			nonFundingLedgerUpdates: [createDeposit(NOW)],
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toBe(error);
	});

	it("fails closed when a realtime ledger update has no stable identity", async () => {
		mocks.subscription.data = {
			isSnapshot: true,
			nonFundingLedgerUpdates: [{ ...createDeposit(NOW), hash: "" as never }],
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("fails closed instead of throwing when realtime ledger updates are not an array", async () => {
		mocks.subscription.data = {
			isSnapshot: true,
			nonFundingLedgerUpdates: { items: [] } as never,
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("merges and orders REST history with realtime updates", async () => {
		mocks.userNonFundingLedgerUpdates.mockResolvedValue([createDeposit(NOW - 1_000)]);
		mocks.subscription.data = {
			isSnapshot: true,
			nonFundingLedgerUpdates: [createDeposit(NOW), createDeposit(NOW - 1_000)],
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		renderHook();
		const result = await waitUntilReady();

		expect(result.rows.map((row) => row.time)).toEqual([NOW, NOW - 1_000]);
	});

	it("aborts and isolates the previous query when the owner changes", async () => {
		let firstSignal: AbortSignal | undefined;
		mocks.userNonFundingLedgerUpdates.mockImplementation(
			({ user }: { user: string }, signal: AbortSignal): Promise<UserNonFundingLedgerUpdatesResponse> => {
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
		renderHook();
		await waitUntilReady();

		expect(firstSignal?.aborted).toBe(true);
		const queryKeys = queryClient
			.getQueryCache()
			.getAll()
			.map((query) => query.queryKey);
		expect(queryKeys).toContainEqual(["hl", "recent-history", "userNonFundingLedgerUpdates", "Mainnet", ADDRESS_A]);
		expect(queryKeys).toContainEqual(["hl", "recent-history", "userNonFundingLedgerUpdates", "Mainnet", ADDRESS_B]);
	});

	it("keeps an empty snapshot loading until REST confirms history", () => {
		mocks.userNonFundingLedgerUpdates.mockImplementation(
			(_params: unknown, signal: AbortSignal): Promise<UserNonFundingLedgerUpdatesResponse> =>
				new Promise((_, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError")),
						{ once: true },
					);
				}),
		);
		mocks.subscription.data = { isSnapshot: true, nonFundingLedgerUpdates: [], user: ADDRESS_A };
		mocks.subscription.status = "active";

		renderHook();

		expect(hookValue?.status).toBe("loading");
	});

	it("reports a terminal error when the REST history snapshot fails", async () => {
		const error = new Error("Info unavailable");
		mocks.userNonFundingLedgerUpdates.mockRejectedValue(error);
		mocks.subscription.data = { isSnapshot: true, nonFundingLedgerUpdates: [], user: ADDRESS_A };
		mocks.subscription.status = "active";

		renderHook();
		await act(async () => {
			await vi.waitFor(() => expect(hookValue?.status).toBe("error"));
		});

		expect(hookValue?.error).toBe(error);
		const callsBeforeRetry = mocks.userNonFundingLedgerUpdates.mock.calls.length;
		await act(async () => {
			hookValue?.retry();
			await vi.waitFor(() =>
				expect(mocks.userNonFundingLedgerUpdates.mock.calls.length).toBeGreaterThan(callsBeforeRetry),
			);
		});
	});

	it("disables both data paths while disconnected", () => {
		mocks.address = undefined;
		mocks.isConnected = false;

		renderHook();

		expect(hookValue?.status).toBe("idle");
		expect(mocks.userNonFundingLedgerUpdates).not.toHaveBeenCalled();
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userNonFundingLedgerUpdates",
			expect.objectContaining({ user: expect.any(String) }),
			{ enabled: false },
		);
	});

	it("does not load the 30-day snapshot until its consumer enables it", async () => {
		ledgerEnabled = false;

		renderHook();

		expect(hookValue?.status).toBe("idle");
		expect(mocks.userNonFundingLedgerUpdates).not.toHaveBeenCalled();
		expect(mocks.useSubscription).toHaveBeenLastCalledWith(
			"userNonFundingLedgerUpdates",
			{ user: ADDRESS_A },
			{ enabled: false },
		);
		hookValue?.retry();
		expect(mocks.userNonFundingLedgerUpdates).not.toHaveBeenCalled();

		ledgerEnabled = true;
		renderHook();
		await waitUntilReady();

		expect(mocks.userNonFundingLedgerUpdates).toHaveBeenCalledOnce();
		expect(mocks.useSubscription).toHaveBeenLastCalledWith(
			"userNonFundingLedgerUpdates",
			{ user: ADDRESS_A },
			{ enabled: true },
		);
	});
});
