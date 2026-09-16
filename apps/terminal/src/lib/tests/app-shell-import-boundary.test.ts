import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const LEGACY_SHELL_IMPORTS = [
	"@/components/trade/mobile/mobile-chrome-classes",
	"@/lib/ui/trading-input",
	"./desktop-placeholders",
] as const;

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
					"@phosphor-icons/react",
					"@/components/brand/gatu-logo",
					"./desktop-grid-loading-surface",
					...LEGACY_SHELL_IMPORTS,
				].includes(specifier);
			expect(allowed, specifier).toBe(true);
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
		for (const match of placeholders.matchAll(/from\s+["']([^"']+)["']/g)) expect(match[1]).toMatch(/^@\/config\//);
	});
});
