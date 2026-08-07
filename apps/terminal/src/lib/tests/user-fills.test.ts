import type { UserFillsResponse, UserTwapSliceFillsResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	getUserFillNotional,
	hasUserFillExplorerTransaction,
	isValidUserTwapSliceFillHistoryItem,
	mergeUserFillSources,
	normalizeUserTwapSliceFills,
} from "@/lib/trade/user-fills";

type UserFill = UserFillsResponse[number];

function createFill(overrides: Partial<UserFill> = {}): UserFill {
	return {
		closedPnl: "0.0",
		coin: "BTC",
		crossed: true,
		dir: "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
		oid: 42,
		px: "63000",
		side: "B",
		startPosition: "0.0",
		sz: "0.01",
		tid: 100,
		time: 1000,
		twapId: null,
		...overrides,
	};
}

describe("mergeUserFillSources", () => {
	it("merges REST history with realtime fills and sorts newest first", () => {
		const older = createFill();
		const newer = createFill({ oid: 43, tid: 101, time: 2000 });

		expect(mergeUserFillSources([older], [newer])).toEqual([newer, older]);
	});

	it("deduplicates the same fill across REST and WebSocket snapshots", () => {
		const restFill = createFill();
		const realtimeFill = createFill({ fee: "0.02" });

		expect(mergeUserFillSources([restFill], [realtimeFill])).toEqual([realtimeFill]);
	});

	it("handles unavailable sources without fabricating fills", () => {
		expect(mergeUserFillSources(undefined, undefined)).toEqual([]);
	});

	it("normalizes TWAP slice fills without losing their parent ID", () => {
		const entry: UserTwapSliceFillsResponse[number] = { fill: createFill(), twapId: 7 };

		expect(isValidUserTwapSliceFillHistoryItem(entry)).toBe(true);
		expect(normalizeUserTwapSliceFills([entry])).toEqual([{ ...entry.fill, twapId: 7 }]);
	});

	it("does not create explorer links for the documented zero TWAP transaction hash", () => {
		expect(hasUserFillExplorerTransaction(createFill())).toBe(false);
		expect(hasUserFillExplorerTransaction(createFill({ hash: `0x${"1".repeat(64)}` }))).toBe(true);
	});

	it("computes slice fill notional with decimal arithmetic", () => {
		expect(getUserFillNotional(createFill({ px: "0.1000000000000000001", sz: "3" }))).toBe("0.3000000000000000003");
		expect(getUserFillNotional(createFill({ px: "invalid" }))).toBeNull();
	});
});
