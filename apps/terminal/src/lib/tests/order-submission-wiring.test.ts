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
			.filter((path) => readFileSync(path, "utf8").includes('useExchange("twapOrder")'))
			.map((path) => path.replace(`${SOURCE_ROOT}/`, ""));
		const cancellationMatches = sourceFiles
			.filter((path) => readFileSync(path, "utf8").includes('useExchange("twapCancel")'))
			.map((path) => path.replace(`${SOURCE_ROOT}/`, ""));

		expect(placementMatches).toEqual(["hooks/trade/use-tracked-twap-order.ts"]);
		expect(cancellationMatches).toEqual(["hooks/trade/use-twap-cancel.ts"]);
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
