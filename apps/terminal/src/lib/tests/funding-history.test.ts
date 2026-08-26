import type { InfoClient, UserFundingResponse } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import { fetchFundingHistoryWindow } from "@/hooks/trade/use-funding-history";
import {
	DEFAULT_FUNDING_HISTORY_PAGE_SIZE,
	filterFundingHistory,
	getFundingHistoryMarkets,
	getFundingHistoryPage,
	getFundingHistorySide,
	isFundingHistoryAddress,
	isFundingHistoryPageSize,
} from "@/lib/trade/funding-history";
import type { UserFunding } from "@/lib/trade/user-funding";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const START_TIME = 1_700_000_000_000;
const END_TIME = START_TIME + 60_000;

function createRestFunding(time: number, coin: string): UserFundingResponse[number] {
	return {
		delta: { coin, fundingRate: "0.0001", nSamples: null, szi: "1", type: "funding", usdc: "0.1" },
		hash: `0x${time.toString(16).padStart(64, "0")}`,
		time,
	};
}

function createFunding(time: number): UserFunding {
	return { coin: `COIN-${time}`, fundingRate: "0.0001", nSamples: null, szi: "1", time, usdc: "0.1" };
}

describe("funding history", () => {
	it("accepts only complete EVM account addresses", () => {
		expect(isFundingHistoryAddress(ADDRESS)).toBe(true);
		expect(isFundingHistoryAddress("0x1234")).toBe(false);
		expect(isFundingHistoryAddress(`${ADDRESS}00`)).toBe(false);
		expect(isFundingHistoryAddress(null)).toBe(false);
	});

	it("supports the documented local page sizes and clamps pages", () => {
		const fundings = Array.from({ length: 63 }, (_, index) => createFunding(1_000 - index));
		const secondPage = getFundingHistoryPage(fundings, 2, DEFAULT_FUNDING_HISTORY_PAGE_SIZE);
		const lastPage = getFundingHistoryPage(fundings, 99, DEFAULT_FUNDING_HISTORY_PAGE_SIZE);

		expect([5, 10, 25, 50].every(isFundingHistoryPageSize)).toBe(true);
		expect(isFundingHistoryPageSize(20)).toBe(false);
		expect(secondPage).toMatchObject({ currentPage: 2, endIndex: 50, startIndex: 25, totalPages: 3 });
		expect(secondPage.rows).toEqual(fundings.slice(25, 50));
		expect(lastPage).toMatchObject({ currentPage: 3, endIndex: 63, startIndex: 50, totalPages: 3 });
	});

	it("filters markets and sides with decimal-safe position parsing", () => {
		const fundings: UserFunding[] = [
			{ ...createFunding(3), coin: "ETH", szi: "0.000000000000000001" },
			{ ...createFunding(2), coin: "BTC", szi: "-0.000000000000000001" },
			{ ...createFunding(1), coin: "BTC", szi: "0" },
		];

		expect(getFundingHistoryMarkets(fundings)).toEqual(["BTC", "ETH"]);
		expect(getFundingHistorySide(fundings[0].szi)).toBe("long");
		expect(getFundingHistorySide(fundings[1].szi)).toBe("short");
		expect(getFundingHistorySide(fundings[2].szi)).toBeNull();
		expect(filterFundingHistory(fundings, "BTC", "all")).toEqual([fundings[1], fundings[2]]);
		expect(filterFundingHistory(fundings, null, "long")).toEqual([fundings[0]]);
		expect(filterFundingHistory(fundings, "BTC", "short")).toEqual([fundings[1]]);
	});

	it("passes explicit inclusive time bounds on every userFunding page and returns newest first", async () => {
		const entries = [createRestFunding(START_TIME + 10, "BTC"), createRestFunding(START_TIME + 20, "ETH")];
		const userFunding = vi.fn(({ startTime }: { startTime: number }) =>
			Promise.resolve(entries.filter((entry) => entry.time >= startTime)),
		);
		const info = { userFunding } as unknown as InfoClient;
		const signal = new AbortController().signal;

		const result = await fetchFundingHistoryWindow(info, ADDRESS, START_TIME, END_TIME, signal);

		expect(result.map((funding) => funding.time)).toEqual([START_TIME + 20, START_TIME + 10]);
		expect(userFunding).toHaveBeenCalledTimes(1);
		expect(userFunding).toHaveBeenNthCalledWith(1, { endTime: END_TIME, startTime: START_TIME, user: ADDRESS }, signal);
	});

	it("rejects a userFunding page that is not ordered by ascending time", async () => {
		const info = {
			userFunding: vi
				.fn()
				.mockResolvedValue([createRestFunding(START_TIME + 20, "ETH"), createRestFunding(START_TIME + 10, "BTC")]),
		} as unknown as InfoClient;

		await expect(
			fetchFundingHistoryWindow(info, ADDRESS, START_TIME, END_TIME, new AbortController().signal),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("fails closed when a response falls outside the requested window", async () => {
		const info = {
			userFunding: vi.fn().mockResolvedValue([createRestFunding(END_TIME + 1, "BTC")]),
		} as unknown as InfoClient;

		await expect(
			fetchFundingHistoryWindow(info, ADDRESS, START_TIME, END_TIME, new AbortController().signal),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
	});
});
