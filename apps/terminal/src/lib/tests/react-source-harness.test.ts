import ts from "typescript";
import { describe, expect, it } from "vitest";
import { findBinding, findDeclaringScope, parseSource } from "./harness/react-source";

function findIdentifiers(file: ts.SourceFile, name: string): ts.Identifier[] {
	const matches: ts.Identifier[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isIdentifier(node) && node.text === name) matches.push(node);
		ts.forEachChild(node, visit);
	};
	visit(file);
	return matches;
}

describe("react-source harness bindings", () => {
	it("resolves a name inside a named function expression to its parameter", () => {
		const file = parseSource("const f = function intl(intl: string) { return intl; };", "sample.ts");
		const [, parameter, use] = findIdentifiers(file, "intl");

		expect(findBinding(use)).toBe(parameter);
	});

	it("resolves a function expression's own name inside it when no parameter shadows it", () => {
		const file = parseSource(
			"const f = function intl(value: number): number { return value ? intl(value - 1) : 0; };",
			"sample.ts",
		);
		const [name, use] = findIdentifiers(file, "intl");

		expect(findBinding(use)).toBe(name);
	});

	it.each([
		["a block", "const i18n = 1; { const i18n = 2; use(i18n); }", 1],
		["a catch clause", "const i18n = 1; try {} catch (i18n) { use(i18n); }", 1],
		["a for initializer", "const i18n = 1; for (const i18n of items) use(i18n);", 1],
		["a named class expression", "const i18n = 1; const C = class i18n { static make() { return i18n; } };", 1],
	])("resolves a shadowing binding in %s", (_name, source, bindingIndex) => {
		const file = parseSource(source, "sample.ts");
		const identifiers = findIdentifiers(file, "i18n");

		expect(findBinding(identifiers.at(-1) as ts.Identifier)).toBe(identifiers[bindingIndex]);
	});

	it("resolves module imports and top-level declarations, and nothing for a global", () => {
		const file = parseSource(
			'import { i18n } from "@lingui/core";\nconst locale = i18n.locale;\nexport function read() { return [i18n, locale, window]; }',
			"sample.ts",
		);
		const [imported, , use] = findIdentifiers(file, "i18n");
		const [declared, readLocale] = findIdentifiers(file, "locale").filter(
			(identifier) => !ts.isPropertyAccessExpression(identifier.parent),
		);
		const [global] = findIdentifiers(file, "window");

		expect(findBinding(use)).toBe(imported);
		expect(findBinding(readLocale)).toBe(declared);
		expect(findBinding(global)).toBeUndefined();
		expect(ts.isSourceFile(findDeclaringScope(global))).toBe(true);
	});
});
