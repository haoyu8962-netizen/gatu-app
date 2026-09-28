import type { InfoClient } from "@nktkas/hyperliquid";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFreshEarnState } from "@/hooks/earn/use-earn-data";
import { infoQueryOptions } from "@/lib/hyperliquid";

const USER = "0x1111111111111111111111111111111111111111" as const;
const RESERVES = [
	[
		0,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.03",
			balance: "1000",
			utilization: "0.5",
			oraclePx: "1.0",
			ltv: "0.0",
			totalSupplied: "2000",
			totalBorrowed: "1000",
		},
	],
];

function userState(suppliedBasis: string) {
	return {
		tokenToState: [[0, { borrow: { basis: "0", value: "0" }, supply: { basis: suppliedBasis, value: suppliedBasis } }]],
		healthFactor: null,
	};
}

function queryKeys(info: InfoClient) {
	return {
		reserves: infoQueryOptions(info, "allBorrowLendReserveStates", undefined, "Mainnet").queryKey,
		user: infoQueryOptions(info, "borrowLendUserState", { user: USER }, "Mainnet").queryKey,
	};
}

describe("fresh earn state inside the funds lock", () => {
	const queryClients: QueryClient[] = [];

	afterEach(() => {
		for (const queryClient of queryClients.splice(0)) queryClient.clear();
	});

	function createQueryClient() {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		queryClients.push(queryClient);
		return queryClient;
	}

	it("sends its own requests and keeps an older page request from overwriting them", async () => {
		const queryClient = createQueryClient();
		const info = {
			allBorrowLendReserveStates: vi.fn(async () => RESERVES),
			borrowLendUserState: vi.fn(async () => userState("600")),
		} as unknown as InfoClient;
		const keys = queryKeys(info);
		queryClient.setQueryData(keys.user, userState("100"));
		let finishPageRequest = () => {};
		const pageRequest = queryClient
			.fetchQuery({
				queryKey: keys.user,
				queryFn: ({ signal }) =>
					new Promise((resolve, reject) => {
						finishPageRequest = () => resolve(userState("100"));
						signal.addEventListener("abort", () => reject(signal.reason), { once: true });
					}),
			})
			.catch(() => undefined);

		const fresh = await fetchFreshEarnState(queryClient, info, "Mainnet", USER, new AbortController().signal);
		finishPageRequest();
		await pageRequest;

		expect(fresh?.userState.positions.get(0)?.supply.basis).toBe("600");
		expect(info.borrowLendUserState).toHaveBeenCalledWith({ user: USER }, expect.any(AbortSignal));
		expect(queryClient.getQueryData(keys.user)).toEqual(userState("600"));
		expect(queryClient.getQueryData(keys.reserves)).toEqual(RESERVES);
	});

	it("stops with the guard's reason when the guard aborts and leaves the cache untouched", async () => {
		const queryClient = createQueryClient();
		const allBorrowLendReserveStates = vi.fn(
			(signal: AbortSignal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), { once: true });
				}),
		);
		const info = {
			allBorrowLendReserveStates,
			borrowLendUserState: vi.fn(async () => userState("600")),
		} as unknown as InfoClient;
		const keys = queryKeys(info);
		queryClient.setQueryData(keys.user, userState("100"));
		const guard = new AbortController();

		const request = fetchFreshEarnState(queryClient, info, "Mainnet", USER, guard.signal);
		await vi.waitFor(() => expect(allBorrowLendReserveStates).toHaveBeenCalled());
		const reason = new Error("guard timed out");
		guard.abort(reason);

		await expect(request).rejects.toBe(reason);
		expect(queryClient.getQueryData(keys.user)).toEqual(userState("100"));
	});

	it("returns nothing instead of cached data when a request fails or the payload is malformed", async () => {
		const queryClient = createQueryClient();
		const failing = {
			allBorrowLendReserveStates: vi.fn(async () => RESERVES),
			borrowLendUserState: vi.fn(async () => {
				throw new Error("network");
			}),
		} as unknown as InfoClient;
		const keys = queryKeys(failing);
		queryClient.setQueryData(keys.user, userState("100"));

		await expect(
			fetchFreshEarnState(queryClient, failing, "Mainnet", USER, new AbortController().signal),
		).resolves.toBeNull();
		expect(queryClient.getQueryData(keys.user)).toEqual(userState("100"));

		const malformed = {
			allBorrowLendReserveStates: vi.fn(async () => [[0, { ltv: "0.5" }]]),
			borrowLendUserState: vi.fn(async () => userState("600")),
		} as unknown as InfoClient;
		await expect(
			fetchFreshEarnState(queryClient, malformed, "Mainnet", USER, new AbortController().signal),
		).resolves.toBeNull();
	});
});
