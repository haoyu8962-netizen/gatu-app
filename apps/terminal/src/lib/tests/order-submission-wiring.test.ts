import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../..");

describe("order submission wiring", () => {
	it("routes every production order action through the tracked submitter", () => {
		const matches = collectSourceFiles(SOURCE_ROOT)
			.filter((path) => /\.(ts|tsx)$/.test(path) && !path.includes("/lib/tests/"))
			.filter((path) => /useExchange\(\s*["']order["']\s*[,)]/.test(readFileSync(path, "utf8")));

		expect(matches.map((path) => path.replace(`${SOURCE_ROOT}/`, ""))).toEqual(["hooks/trade/use-tracked-order.ts"]);
	});

	it("routes TWAP placement and cancellation through their guarded hooks", () => {
		const sourceFiles = collectSourceFiles(SOURCE_ROOT).filter(
			(path) => /\.(ts|tsx)$/.test(path) && !path.includes("/lib/tests/"),
		);
		const placementMatches = sourceFiles
			.filter((path) => /useExchange\(\s*["']twapOrder["']\s*,/.test(readFileSync(path, "utf8")))
			.map((path) => path.replace(`${SOURCE_ROOT}/`, ""));
		const cancellationMatches = sourceFiles
			.filter((path) => readFileSync(path, "utf8").includes('useExchange("twapCancel")'))
			.map((path) => path.replace(`${SOURCE_ROOT}/`, ""));

		expect(placementMatches).toEqual(["hooks/trade/use-tracked-twap-order.ts"]);
		expect(cancellationMatches).toEqual(["hooks/trade/use-twap-cancel.ts"]);
		expect(readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-tracked-twap-order.ts"), "utf8")).toContain(
			'useExchange("twapOrder", { executionGuard: options.executionGuard })',
		);
		expect(readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-order-submit.ts"), "utf8")).toMatch(
			/useTrackedTwapOrder\(\{\s*executionGuard: options\.twapExecutionGuard,/,
		);
		expect(readFileSync(resolve(SOURCE_ROOT, "components/trade/tradebox/trade-panel.tsx"), "utf8")).toContain(
			"useOrderSubmit({ executionGuard, twapExecutionGuard })",
		);
	});

	it("tick-rounds TWAP trigger and stop prices once in the panel and requires a live mark whenever either is set", () => {
		const orderSubmit = readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-order-submit.ts"), "utf8");
		const tradePanel = readFileSync(resolve(SOURCE_ROOT, "components/trade/tradebox/trade-panel.tsx"), "utf8");

		expect(orderSubmit).toContain("const details = buildTwapOrderDetails({");
		expect(orderSubmit).toMatch(/twap: \{[\s\S]*?\},\s*\.\.\.\(details \? \{ details \} : \{\}\),/);
		expect(orderSubmit).not.toMatch(/details:\s*\{\s*t:\s*null,\s*s:\s*null/);
		expect(orderSubmit).not.toContain("formatPriceForOrder(twapTriggerPrice");
		expect(tradePanel).toContain("const twapTriggerPx = formatTwapPriceInput(twapTriggerPriceInput, twapPriceFormat);");
		expect(tradePanel).toContain("const twapStopPx = formatTwapPriceInput(twapStopPriceInput, twapPriceFormat);");
		expect(tradePanel).toContain("const twapTriggerPriceNum = toNumber(twapTriggerPx);");
		expect(tradePanel).toContain("const twapStopPriceNum = toNumber(twapStopPx);");
		expect(tradePanel).toMatch(
			/const requiresLiveMarkPrice =\s*orderType === "market" \|\|\s*triggerOrder \|\|\s*\(twapOrder && \(isPositive\(twapTriggerPriceNum\) \|\| isPositive\(twapStopPriceNum\)\)\);/,
		);
	});

	it("gates the desktop reduce-only flag by market capability before it reaches validation and submission", () => {
		const tradePanel = readFileSync(resolve(SOURCE_ROOT, "components/trade/tradebox/trade-panel.tsx"), "utf8");

		expect(tradePanel).toContain("const reduceOnlyChecked = useReduceOnly();");
		expect(tradePanel).toContain("const reduceOnly = capabilities.hasReduceOnly && reduceOnlyChecked;");
		expect(tradePanel).toMatch(/perpInput\(baseInput, \{[\s\S]*?\breduceOnly,[\s\S]*?\}\)/);
		expect(tradePanel).toMatch(/await submitOrder\(\{[\s\S]*?\breduceOnly,[\s\S]*?\}\);/);
		expect(tradePanel).not.toMatch(/reduceOnly: reduceOnlyChecked/);
	});

	it("keeps desktop and mobile TWAP views wired to shared subscription and cancellation boundaries", () => {
		for (const path of ["components/trade/positions/twap-tab.tsx", "components/trade/mobile/mobile-twap-tab.tsx"]) {
			const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8");
			expect(source).toContain("getTwapViewState({");
			expect(source).toContain("useTwapCancel()");
			expect(source).toContain('viewState === "error"');
		}
	});
});

function collectSourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const path = resolve(directory, entry);
		return statSync(path).isDirectory() ? collectSourceFiles(path) : [path];
	});
}
