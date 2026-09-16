import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const LEGACY_SHELL_IMPORTS = ["@/components/trade/mobile/mobile-chrome-classes", "./desktop-placeholders"] as const;

const source = readFileSync(resolve(__dirname, "../../components/trade/layout/app-shell-skeleton.tsx"), "utf8");
const parsed = ts.createSourceFile("app-shell-skeleton.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = parsed.statements.filter(ts.isImportDeclaration).map((statement) => {
	if (!ts.isStringLiteral(statement.moduleSpecifier)) throw new Error("Expected a static import");
	return statement.moduleSpecifier.text;
});

describe("app shell import boundary", () => {
	it("imports only views, pure configuration and the explicit migration exceptions", () => {
		for (const specifier of imports) {
			const allowed =
				specifier.endsWith("-view") ||
				specifier.startsWith("@/config/") ||
				[
					"@/lib/cn",
					"@/components/ui/input-styles",
					"@phosphor-icons/react",
					"@/components/brand/gatu-logo",
					"./desktop-grid-loading-surface",
					...LEGACY_SHELL_IMPORTS,
				].includes(specifier);
			expect(allowed, specifier).toBe(true);
		}
	});

	it("imports the order book views directly without runtime primitives", () => {
		expect(imports).toContain("../orderbook/orderbook-panel-view");
		expect(imports).toContain("../orderbook/orderbook-tabs-view");
		expect(imports).not.toContain("@gatu/ui");
	});

	it("imports the trade views without runtime primitives or the legacy input helper", () => {
		expect(imports).toContain("../tradebox/trade-panel-body-view");
		expect(imports).toContain("../tradebox/trade-header-view");
		expect(imports).toContain("../tradebox/trade-input-frame-view");
		expect(imports).toContain("../components/trade-slider-view");
		expect(imports).toContain("@/components/ui/input-styles");
		expect(imports).not.toContain("@/lib/ui/trading-input");
	});

	it("allows views to share the pure input styles without runtime input imports", () => {
		for (const file of [
			"trade/tradebox/trade-input-frame-view.tsx",
			"trade/tradebox/trade-percent-frame-view.tsx",
			"ui/input-styles.ts",
		]) {
			const text = readFileSync(resolve(__dirname, "../../components", file), "utf8");
			const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
			for (const statement of parsed.statements.filter(ts.isImportDeclaration)) {
				if (!ts.isStringLiteral(statement.moduleSpecifier)) throw new Error("Expected a static import");
				const specifier = statement.moduleSpecifier.text;
				if (file === "ui/input-styles.ts") expect(specifier).toBe("@/lib/cn");
				else
					expect(["react", "@/lib/cn", "@/lib/ui/trading-input", "@/components/ui/input-styles"]).toContain(specifier);
			}
		}
	});

	it("does not retain unused legacy exceptions", () => {
		for (const specifier of LEGACY_SHELL_IMPORTS) expect(imports).toContain(specifier);
	});

	it("keeps the placeholder data module pure", () => {
		const placeholders = readFileSync(
			resolve(__dirname, "../../components/trade/layout/desktop-placeholders.ts"),
			"utf8",
		);
		expect(placeholders).not.toMatch(/use[A-Z]|@lingui\/react|window|document|Date\.|Math\.random/);
		for (const match of placeholders.matchAll(/from\s+["']([^"']+)["']/g)) {
			const specifier = match[1];
			expect(
				specifier.startsWith("@/config/") ||
					specifier.endsWith("-view") ||
					["react", "@phosphor-icons/react", "@/components/brand/gatu-logo"].includes(specifier),
				specifier,
			).toBe(true);
		}
	});
});
