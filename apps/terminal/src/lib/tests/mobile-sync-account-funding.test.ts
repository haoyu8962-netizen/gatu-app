import { describe, expect, it, vi } from "vitest";
import {
	AccountFundingSnapshotError,
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

function withMargin(marginSummary: Partial<typeof EMPTY_PERP.marginSummary>) {
	return { ...EMPTY_PERP, marginSummary: { ...EMPTY_PERP.marginSummary, ...marginSummary } };
}

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
		expect(hasPerpAccountFunding(EMPTY_PERP)).toBe(false);
		expect(hasPerpAccountFunding(withMargin({ accountValue: "-0" }))).toBe(false);
		expect(hasPerpAccountFunding({ ...EMPTY_PERP, withdrawable: "0.000001" })).toBe(true);
		expect(hasPerpAccountFunding(withMargin({ accountValue: "-3.5" }))).toBe(true);
		expect(hasPerpAccountFunding(withMargin({ totalNtlPos: "12" }))).toBe(true);
		expect(hasPerpAccountFunding(withMargin({ totalRawUsd: "1e-7" }))).toBe(true);
		expect(hasPerpAccountFunding({ ...EMPTY_PERP, assetPositions: [{}] })).toBe(true);
	});

	it("treats a positive spot total or hold as funding", () => {
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

	it("compares exact decimals, so an amount outside the double range is still read as an amount", () => {
		expect(hasPerpAccountFunding({ ...EMPTY_PERP, withdrawable: "1e-400" })).toBe(true);
		expect(hasSpotAccountFunding({ balances: [{ hold: "0", total: "1e400" }] })).toBe(true);
	});

	it.each([
		["a missing snapshot", undefined],
		["a null body", null],
		["an empty object", {}],
		["a list", []],
		["a missing margin summary", { assetPositions: [], withdrawable: "0" }],
		["a missing position list", { marginSummary: EMPTY_PERP.marginSummary, withdrawable: "0" }],
		["a missing amount", { ...EMPTY_PERP, withdrawable: undefined }],
		["an amount that is a number", { ...EMPTY_PERP, withdrawable: 0 }],
		["an empty amount", withMargin({ accountValue: "" })],
		["a padded amount", withMargin({ accountValue: " 1 " })],
		["a hexadecimal amount", withMargin({ totalRawUsd: "0x10" })],
		["a signed-plus amount", withMargin({ totalNtlPos: "+1" })],
		["an infinite amount", { ...EMPTY_PERP, withdrawable: "Infinity" }],
		["a word", { ...EMPTY_PERP, withdrawable: "bad" }],
	])("refuses to read %s as an empty perp account", (_name, state) => {
		expect(() => hasPerpAccountFunding(state)).toThrow(AccountFundingSnapshotError);
	});

	it.each([
		["a missing snapshot", undefined],
		["an empty object", {}],
		["balances that are not a list", { balances: {} }],
		["a balance that is not an object", { balances: ["1"] }],
		["a balance without a hold", { balances: [{ total: "0" }] }],
		["a balance with a word", { balances: [{ hold: "0", total: "bad" }] }],
	])("refuses to read %s as an empty spot account", (_name, state) => {
		expect(() => hasSpotAccountFunding(state)).toThrow(AccountFundingSnapshotError);
	});

	it("reads every named dex once and never the default one again", async () => {
		const { clearinghouseState, info } = createInfo({ xyz: EMPTY_PERP, flx: { ...EMPTY_PERP, withdrawable: "5" } }, [
			null,
			{ name: "xyz" },
			{ name: "flx" },
			{ name: "xyz" },
		]);

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
		await expect(hasBuilderDexAccountFunding(createInfo({}, []).info, USER)).resolves.toBe(false);
	});

	it("rejects instead of answering unfunded when a request fails", async () => {
		await expect(
			hasBuilderDexAccountFunding(createInfo({ xyz: EMPTY_PERP, flx: new Error("flx unavailable") }).info, USER),
		).rejects.toThrow("flx unavailable");
		await expect(
			hasBuilderDexAccountFunding(createInfo({}, new Error("dex list unavailable")).info, USER),
		).rejects.toThrow("dex list unavailable");
	});

	it("rejects instead of answering unfunded when a resolved answer is not a usable snapshot", async () => {
		for (const broken of [null, {}, { ...EMPTY_PERP, withdrawable: "bad" }]) {
			await expect(
				hasBuilderDexAccountFunding(createInfo({ xyz: EMPTY_PERP, flx: broken }).info, USER),
			).rejects.toThrow(AccountFundingSnapshotError);
		}
		await expect(
			hasBuilderDexAccountFunding(createInfo({ xyz: { ...EMPTY_PERP, withdrawable: "5" }, flx: null }).info, USER),
		).rejects.toThrow(AccountFundingSnapshotError);
	});

	it("rejects a dex list it cannot trust instead of reading the default dex twice", async () => {
		for (const dexs of [{}, null, [null, { name: "" }], [null, {}], [null, "xyz"]]) {
			const { clearinghouseState, info } = createInfo({ xyz: EMPTY_PERP }, dexs);
			await expect(hasBuilderDexAccountFunding(info, USER)).rejects.toThrow(AccountFundingSnapshotError);
			expect(clearinghouseState).not.toHaveBeenCalled();
		}
	});

	it("passes the abort signal to every request", async () => {
		const { clearinghouseState, info, perpDexs } = createInfo({ xyz: EMPTY_PERP, flx: EMPTY_PERP });
		const signal = new AbortController().signal;

		await hasBuilderDexAccountFunding(info, USER, signal);
		expect(perpDexs).toHaveBeenCalledWith(signal);
		expect(clearinghouseState.mock.calls.every(([, passed]) => passed === signal)).toBe(true);
	});
});
