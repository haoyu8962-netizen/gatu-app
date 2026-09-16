import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PLACEHOLDER_DATA_IMPORTS = ["./desktop-placeholders", "./mobile-placeholders"] as const;

const source = readFileSync(resolve(__dirname, "../../components/trade/layout/app-shell-skeleton.tsx"), "utf8");
const parsed = ts.createSourceFile("app-shell-skeleton.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = parsed.statements.filter(ts.isImportDeclaration).map((statement) => {
	if (!ts.isStringLiteral(statement.moduleSpecifier)) throw new Error("Expected a static import");
	return statement.moduleSpecifier.text;
});

describe("app shell import boundary", () => {
	it("allows the pure account overview composition without runtime UI imports", () => {
		expect(imports).toContain("../tradebox/account-overview-view");
		expect(imports).toContain("../positions/account-table-header-view");
		const overview = readFileSync(
			resolve(__dirname, "../../components/trade/tradebox/account-overview-view.tsx"),
			"utf8",
		);
		expect(overview).toContain('from "@/components/ui/info-row"');
		const infoRow = readFileSync(resolve(__dirname, "../../components/ui/info-row.tsx"), "utf8");
		expect(infoRow).not.toMatch(/use[A-Z]|@gatu\/ui|@lingui|window|document/);
		expect([...infoRow.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1])).toEqual(["react", "@/lib/cn"]);
	});

	it.each(["trade/layout/app-shell-skeleton.tsx", "dashboard/dashboard-shell-skeleton.tsx"])(
		"%s imports only views, pure configuration and existing presentation helpers",
		(file) => {
			const filePath = resolve(__dirname, "../../components", file);
			const text = readFileSync(filePath, "utf8");
			const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
			for (const statement of parsed.statements.filter(ts.isImportDeclaration)) {
				if (!ts.isStringLiteral(statement.moduleSpecifier)) throw new Error("Expected a static import");
				const specifier = statement.moduleSpecifier.text;
				const canonical = specifier.startsWith("@/")
					? resolve(__dirname, "../..", specifier.slice(2))
					: resolve(filePath, "..", specifier);
				const allowedHelpers = [
					"lib/cn",
					"components/ui/input-styles",
					"components/ui/info-row",
					"components/brand/gatu-logo",
					"components/trade/layout/desktop-grid-loading-surface",
					"components/trade/layout/desktop-placeholders",
					"components/trade/layout/mobile-placeholders",
				].map((path) => resolve(__dirname, "../..", path));
				expect(
					specifier.endsWith("-view") ||
						specifier.startsWith("@/config/") ||
						specifier === "@phosphor-icons/react" ||
						allowedHelpers.includes(canonical),
					specifier,
				).toBe(true);
			}
		},
	);

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

	it("keeps only used pure placeholder data imports", () => {
		for (const specifier of PLACEHOLDER_DATA_IMPORTS) expect(imports).toContain(specifier);
	});

	it.each(["desktop", "mobile"])("keeps the %s placeholder data module pure", (surface) => {
		const placeholders = readFileSync(
			resolve(__dirname, `../../components/trade/layout/${surface}-placeholders.ts`),
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
