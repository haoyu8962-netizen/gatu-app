import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TOUCH_PRESS_CLASS, TOUCH_PRESS_FADE_CLASS } from "@/components/ui/touch-press";

const tradeDir = resolve(__dirname, "../../components/trade");

describe("touch press feedback contract", () => {
	it("defines press feedback as active-state classes with a short transition", () => {
		expect(TOUCH_PRESS_CLASS).toContain("active:bg-fill-weak");
		expect(TOUCH_PRESS_CLASS).toContain("duration-[120ms]");
		expect(TOUCH_PRESS_FADE_CLASS).toContain("active:opacity-60");
	});

	it.each([
		["mobile/mobile-disclosure-header.tsx", "TOUCH_PRESS_CLASS"],
		["chart/token-selector-row.tsx", "TOUCH_PRESS_CLASS"],
		["mobile/mobile-trade-summary-view.tsx", "active:opacity-60"],
		["tradebox/trade-control-button-view.tsx", "active:bg-fill-weak"],
		["tradebox/trade-size-unit-view.tsx", "active:bg-fill-weak"],
		["tradebox/order-summary.tsx", "active:opacity-60"],
	])("%s gives its tappable surface press feedback", (path, marker) => {
		const source = readFileSync(resolve(tradeDir, path), "utf8");
		expect(source).toContain("cursor-pointer");
		expect(source).toContain(marker);
	});
});
