import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_FIELDS = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/tradebox/trade-form-fields.tsx"),
	"utf8",
);
const MOBILE_VIEW = readFileSync(resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-trade-view.tsx"), "utf8");

describe("limit price prefill contract", () => {
	it("prefills the mid once per limit-priced entry and never overwrites a typed price", () => {
		for (const source of [DESKTOP_FIELDS, MOBILE_VIEW]) {
			expect(source).toContain("prefilledLimitKeyRef");
			expect(source).toContain("if (prefilledLimitKeyRef.current === limitPrefillKey) return;");
			expect(source).toMatch(/if \(limitPriceInput !== "" \|\| formattedMid(ForPrefill)? === undefined\) return;/);
		}
	});

	it("keeps trigger orders reduce-only on mobile exactly like desktop", () => {
		expect(MOBILE_VIEW).toContain("checked: isTriggerOrder || reduceOnly");
		expect(MOBILE_VIEW).toContain("disabled: isFormDisabled || isTriggerOrder");
		expect(DESKTOP_FIELDS).toContain("checked: triggerOrder || reduceOnly");
	});
});
