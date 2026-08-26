import { describe, expect, it } from "vitest";
import { getPositionCloseAllSnapshotKey, resolvePositionCloseAllSnapshot } from "@/domain/trade/position-close-all";

const OWNER = "0x1111111111111111111111111111111111111111";

describe("position close-all snapshot", () => {
	it("preserves exact strings, sorts targets, and sums signed PnL with Big.js", () => {
		const resolution = resolvePositionCloseAllSnapshot({
			owner: OWNER.toUpperCase(),
			env: "Mainnet",
			capturedAtMs: 1_786_000_000_000,
			candidates: [
				{
					coin: "xyz:ORCL",
					dex: "xyz",
					assetId: 120_031,
					szDecimals: 3,
					signedPositionSize: "-2.500",
					positionValue: "372.550000000000000001",
					unrealizedPnl: "-2.675000000000000001",
					marginMode: "isolated",
					quoteSymbol: "USDE",
				},
				{
					coin: "BTC",
					dex: "",
					assetId: 1,
					szDecimals: 5,
					signedPositionSize: "0.01000",
					positionValue: "-1000.000000000000000009",
					unrealizedPnl: "12.675000000000000009",
					marginMode: "cross",
					quoteSymbol: "USDC",
				},
			],
		});

		expect(resolution.issues).toEqual([]);
		if (!resolution.snapshot) throw new Error("Expected a valid snapshot");
		expect(resolution.snapshot.owner).toBe(OWNER);
		expect(resolution.snapshot.capturedAtMs).toBe(1_786_000_000_000);
		expect(resolution.snapshot.targets.map((target) => target.assetId)).toEqual([1, 120_031]);
		expect(resolution.snapshot.targets.map((target) => target.signedPositionSize)).toEqual(["0.01", "-2.5"]);
		expect(resolution.snapshot.targets.every((target) => !("markPx" in target))).toBe(true);
		expect(resolution.snapshot.summaryTotals).toEqual([
			{ quoteSymbol: "USDC", totalNotional: "1000.000000000000000009", estimatedPnl: "12.675000000000000009" },
			{
				quoteSymbol: "USDE",
				totalNotional: "372.550000000000000001",
				estimatedPnl: "-2.675000000000000001",
			},
		]);
		expect(getPositionCloseAllSnapshotKey(resolution.snapshot)).toContain(":BTC:1:5:0.01:cross:");
	});

	it("fails the whole snapshot closed when any open position lacks a tradable market binding", () => {
		const resolution = resolvePositionCloseAllSnapshot({
			owner: OWNER,
			env: "Mainnet",
			candidates: [
				{
					coin: "BTC",
					dex: "",
					assetId: undefined,
					szDecimals: 5,
					signedPositionSize: "0.01",
					positionValue: "1000",
					unrealizedPnl: "10",
					marginMode: "cross",
					quoteSymbol: "USDC",
				},
			],
		});

		expect(resolution.snapshot).toBeNull();
		expect(resolution.issues).toContain("invalid-market");
	});

	it("fails closed when collateral metadata is unavailable", () => {
		const resolution = resolvePositionCloseAllSnapshot({
			owner: OWNER,
			env: "Mainnet",
			candidates: [
				{
					coin: "xyz:UNKNOWN",
					dex: "xyz",
					assetId: 120_001,
					szDecimals: 3,
					signedPositionSize: "1",
					positionValue: "10",
					unrealizedPnl: "0",
					marginMode: "cross",
					quoteSymbol: null,
				},
			],
		});

		expect(resolution.snapshot).toBeNull();
		expect(resolution.issues).toContain("invalid-market");
	});

	it("rejects duplicate market and asset identities instead of double-closing", () => {
		const candidate = {
			coin: "BTC",
			dex: "",
			assetId: 1,
			szDecimals: 5,
			signedPositionSize: "0.01",
			positionValue: "1000",
			unrealizedPnl: "10",
			marginMode: "cross" as const,
			quoteSymbol: "USDC",
		};
		const resolution = resolvePositionCloseAllSnapshot({
			owner: OWNER,
			env: "Mainnet",
			candidates: [candidate, { ...candidate }],
		});

		expect(resolution.snapshot).toBeNull();
		expect(resolution.issues).toContain("duplicate-market");
	});

	it("keeps the dangerous action unavailable for disconnected and empty accounts", () => {
		const resolution = resolvePositionCloseAllSnapshot({ owner: null, env: "Mainnet", candidates: [] });
		expect(resolution).toEqual({ snapshot: null, issues: ["disconnected", "empty"] });
	});
});
