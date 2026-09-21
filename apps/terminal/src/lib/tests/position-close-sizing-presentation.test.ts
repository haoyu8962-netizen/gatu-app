import { describe, expect, it } from "vitest";
import type { PositionMarketCloseResolution } from "@/domain/trade/position-market-close";
import { createPositionCloseSizingViewModel } from "@/lib/trade/position-close-sizing-presentation";

function resolution(overrides: Partial<PositionMarketCloseResolution>): PositionMarketCloseResolution {
	return {
		normalizedSize: "0.7",
		maxSize: "1.5",
		effectivePercent: "46.6666",
		remainingSize: "0.8",
		side: "sell",
		errors: [],
		...overrides,
	};
}

describe("position close sizing presentation", () => {
	it("keeps the requested percentage of a percent intent next to the effective one", () => {
		const viewModel = createPositionCloseSizingViewModel({ kind: "percent", value: "50" }, resolution({}), 1);
		expect(viewModel).toEqual({
			effectivePercent: "46.6",
			requestedPercent: "50",
			sizeInput: "0.7",
			percentInput: "47",
			sliderValue: 46.6666,
		});
	});

	it("requests 100 for a max intent", () => {
		const viewModel = createPositionCloseSizingViewModel(
			{ kind: "max" },
			resolution({ normalizedSize: "1.5", effectivePercent: "100", remainingSize: "0" }),
			1,
		);
		expect(viewModel.requestedPercent).toBe("100");
		expect(viewModel.percentInput).toBe("100");
		expect(viewModel.sliderValue).toBe(100);
		expect(viewModel.sizeInput).toBe("1.5");
	});

	it("shows a typed size as typed and requests its effective percentage", () => {
		const viewModel = createPositionCloseSizingViewModel({ kind: "size", value: "0.70" }, resolution({}), 1);
		expect(viewModel.sizeInput).toBe("0.70");
		expect(viewModel.requestedPercent).toBe("46.6");
	});

	it("clamps the slider and the percentage box to the 0 to 100 range", () => {
		const zero = createPositionCloseSizingViewModel(
			{ kind: "percent", value: "0" },
			resolution({ effectivePercent: "-3" }),
			1,
		);
		expect(zero.sliderValue).toBe(0);
		expect(zero.percentInput).toBe("0");
		const over = createPositionCloseSizingViewModel(
			{ kind: "percent", value: "100" },
			resolution({ effectivePercent: "120" }),
			1,
		);
		expect(over.sliderValue).toBe(100);
		expect(over.percentInput).toBe("100");
		const invalid = createPositionCloseSizingViewModel(
			{ kind: "percent", value: "" },
			resolution({ effectivePercent: "" }),
			1,
		);
		expect(invalid.sliderValue).toBe(0);
		expect(invalid.percentInput).toBe("0");
	});
});
