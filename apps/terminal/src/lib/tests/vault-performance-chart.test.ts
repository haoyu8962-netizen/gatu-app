import { describe, expect, it } from "vitest";
import { createChartPath } from "@/components/vaults/vault-performance-chart";

describe("Vault performance chart", () => {
	it("uses server timestamps instead of spacing irregular samples by index", () => {
		expect(
			createChartPath([
				{ timestamp: 1_000, value: "0" },
				{ timestamp: 1_100, value: "5" },
				{ timestamp: 2_000, value: "10" },
			]),
		).toBe("M0 34 L10 18 L100 2");
	});

	it("keeps equal intermediate timestamps at the same x coordinate", () => {
		expect(
			createChartPath([
				{ timestamp: 1_000, value: "0" },
				{ timestamp: 1_500, value: "5" },
				{ timestamp: 1_500, value: "10" },
				{ timestamp: 2_000, value: "5" },
			]),
		).toBe("M0 34 L50 18 L50 2 L100 18");
	});

	it("fails closed without a valid time range or financial value", () => {
		expect(
			createChartPath([
				{ timestamp: 1_000, value: "1" },
				{ timestamp: 1_000, value: "2" },
			]),
		).toBeNull();
		expect(
			createChartPath([
				{ timestamp: 1_000, value: "bad" },
				{ timestamp: 2_000, value: "2" },
			]),
		).toBeNull();
	});
});
