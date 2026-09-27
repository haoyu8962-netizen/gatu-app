import type { InfoClient } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import { fetchEarnInterest, getEarnInterestStartTime } from "@/hooks/earn/use-earn-data";

const USER = "0x1111111111111111111111111111111111111111" as const;
const NOW = 1_800_000_000_000;

describe("earn interest history", () => {
	it("walks every page of the 30-day window computed at request time", async () => {
		const start = getEarnInterestStartTime(NOW);
		const entries = Array.from({ length: 700 }, (_, index) => ({
			time: start + (index + 1) * 60_000,
			token: "USDC",
			supply: "0.01",
			borrow: "0",
		}));
		const userBorrowLendInterest = vi.fn(async ({ startTime }: { startTime: number }) =>
			entries.filter((entry) => entry.time >= startTime).slice(0, 500),
		);
		const info = { userBorrowLendInterest } as unknown as InfoClient;

		const result = await fetchEarnInterest(info, USER, NOW, new AbortController().signal);

		expect(result).toHaveLength(700);
		expect(userBorrowLendInterest.mock.calls[0]?.[0]).toEqual({ user: USER, startTime: start, endTime: NOW });
		expect(userBorrowLendInterest.mock.calls.length).toBeGreaterThan(1);
		expect(start).toBe(Math.floor((NOW - 30 * 24 * 60 * 60 * 1000) / 3_600_000) * 3_600_000);
	});

	it("rejects malformed interest pages instead of showing a partial list", async () => {
		const info = {
			userBorrowLendInterest: vi.fn(async () => [{ token: "USDC" }]),
		} as unknown as InfoClient;
		await expect(fetchEarnInterest(info, USER, NOW, new AbortController().signal)).rejects.toThrow();
	});
});
