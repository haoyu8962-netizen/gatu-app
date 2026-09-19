import { describe, expect, it, vi } from "vitest";
import {
	hasBuilderDexAccountFunding,
	hasPerpAccountFunding,
	hasSpotAccountFunding,
	type PairingFundingInfoClient,
} from "@/lib/mobile-sync/account-funding";

const USER = "0x1111111111111111111111111111111111111111";
const EMPTY_PERP = {
	assetPositions: [],
	marginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0" },
	withdrawable: "0",
};

function createInfo(states: Record<string, unknown>, dexs: unknown = [null, { name: "xyz" }, { name: "flx" }]) {
	const clearinghouseState = vi.fn(async ({ dex }: { dex: string }, _signal?: AbortSignal) => {
		const state = states[dex];
		if (state instanceof Error) throw state;
		return state;
	});
	const perpDexs = vi.fn(async (_signal?: AbortSignal) => {
		if (dexs instanceof Error) throw dexs;
		return dexs;
	});
	return {
		clearinghouseState,
		info: { clearinghouseState, perpDexs } as unknown as PairingFundingInfoClient,
		perpDexs,
	};
}

describe("mobile pairing account funding", () => {
	it("treats any non-zero perp figure or an open position as funding", () => {
		expect(hasPerpAccountFunding(undefined)).toBe(false);
		expect(hasPerpAccountFunding(EMPTY_PERP)).toBe(false);
		expect(hasPerpAccountFunding({ ...EMPTY_PERP, withdrawable: "0.000001" })).toBe(true);
		expect(
			hasPerpAccountFunding({ ...EMPTY_PERP, marginSummary: { ...EMPTY_PERP.marginSummary, accountValue: "-3.5" } }),
		).toBe(true);
		expect(
			hasPerpAccountFunding({ ...EMPTY_PERP, marginSummary: { ...EMPTY_PERP.marginSummary, totalNtlPos: "12" } }),
		).toBe(true);
		expect(hasPerpAccountFunding({ ...EMPTY_PERP, assetPositions: [{}] })).toBe(true);
		expect(hasPerpAccountFunding({ ...EMPTY_PERP, withdrawable: "not-a-number" })).toBe(false);
	});

	it("keeps decimal strings exact instead of rounding a small balance to zero", () => {
		expect(hasPerpAccountFunding({ ...EMPTY_PERP, withdrawable: "0.0000000000000000001" })).toBe(true);
		expect(hasSpotAccountFunding({ balances: [{ hold: "0", total: "0.0000000000000000001" }] })).toBe(true);
	});

	it("treats a positive spot total or hold as funding", () => {
		expect(hasSpotAccountFunding(undefined)).toBe(false);
		expect(hasSpotAccountFunding({ balances: [] })).toBe(false);
		expect(hasSpotAccountFunding({ balances: [{ hold: "0", total: "0" }] })).toBe(false);
		expect(
			hasSpotAccountFunding({
				balances: [
					{ hold: "0", total: "0" },
					{ hold: "2", total: "0" },
				],
			}),
		).toBe(true);
	});

	it("reads every named dex and never the default one again", async () => {
		const { clearinghouseState, info } = createInfo({ xyz: EMPTY_PERP, flx: { ...EMPTY_PERP, withdrawable: "5" } });

		await expect(hasBuilderDexAccountFunding(info, USER)).resolves.toBe(true);
		expect(clearinghouseState.mock.calls.map(([params]) => params)).toEqual([
			{ user: USER, dex: "xyz" },
			{ user: USER, dex: "flx" },
		]);
	});

	it("answers unfunded only after every named dex answered empty", async () => {
		await expect(
			hasBuilderDexAccountFunding(createInfo({ xyz: EMPTY_PERP, flx: EMPTY_PERP }).info, USER),
		).resolves.toBe(false);
		await expect(hasBuilderDexAccountFunding(createInfo({}, [null]).info, USER)).resolves.toBe(false);
	});

	it("rejects instead of answering unfunded when a dex or the dex list cannot be read", async () => {
		await expect(
			hasBuilderDexAccountFunding(createInfo({ xyz: EMPTY_PERP, flx: new Error("flx unavailable") }).info, USER),
		).rejects.toThrow("flx unavailable");
		await expect(
			hasBuilderDexAccountFunding(createInfo({}, new Error("dex list unavailable")).info, USER),
		).rejects.toThrow("dex list unavailable");
	});

	it("passes the abort signal to every request", async () => {
		const { clearinghouseState, info, perpDexs } = createInfo({ xyz: EMPTY_PERP, flx: EMPTY_PERP });
		const signal = new AbortController().signal;

		await hasBuilderDexAccountFunding(info, USER, signal);
		expect(perpDexs).toHaveBeenCalledWith(signal);
		expect(clearinghouseState.mock.calls.every(([, passed]) => passed === signal)).toBe(true);
	});
});
