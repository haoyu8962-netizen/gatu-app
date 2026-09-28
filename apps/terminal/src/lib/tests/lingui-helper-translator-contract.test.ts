import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(__dirname, "../..");
const MACRO_TRANSLATOR_TYPE = /ReturnType<\s*typeof\s+useLingui\s*>/g;
const TEMPLATE_CANDIDATE = /`/;
const REPOSITORY_SCAN_TIMEOUT_MS = 20_000;
const MACRO_TRANSLATOR_REASON =
	"The Lingui macro only rewrites `t` tagged templates inside the component that called useLingui(). " +
	"A helper that receives that `t` runs the template untransformed, renders an empty string in every language, " +
	"and lingui extract never sees the message. Type the parameter as Translate from @/lib/translate, build the " +
	"message with msg and call translate(msg`...`); pass (descriptor) => t(descriptor) from the component.";

describe("Lingui helper translator contract", () => {
	it("never types anything as the macro translator", () => {
		const violations: string[] = [];

		for (const filePath of findSourceFiles(SRC_DIR)) {
			const source = readFileSync(filePath, "utf8");
			for (const match of source.matchAll(MACRO_TRANSLATOR_TYPE)) {
				violations.push(`${relative(SRC_DIR, filePath)}:${lineOf(source, match.index)}`);
			}
		}

		expect(violations, MACRO_TRANSLATOR_REASON).toEqual([]);
	});

	it(
		"never uses a function parameter or a translator property as a tagged template",
		() => {
			const violations = findSourceFiles(SRC_DIR).flatMap((filePath) =>
				findTranslatorTagViolations(readFileSync(filePath, "utf8"), filePath).map(
					(line) => `${relative(SRC_DIR, filePath)}:${line}`,
				),
			);

			expect(violations, MACRO_TRANSLATOR_REASON).toEqual([]);
		},
		REPOSITORY_SCAN_TIMEOUT_MS,
	);
});

describe("parameter tagged-template detector", () => {
	it.each([
		["a helper that receives t", "function label(t) {\n  return t`Hello`;\n}", [2]],
		["an arrow helper", "const label = (status, t) => (status === 'today' ? t`Expires today` : undefined);", [1]],
		["a destructured t prop", "function Row({ t }) {\n  return <span>{t`Hello`}</span>;\n}", [2]],
		["a callback nested inside the helper", "function labels(t, items) {\n  return items.map(() => t`Item`);\n}", [2]],
		["a translator parameter with another name", "function label(translate) {\n  return translate`Hello`;\n}", [2]],
		["a renamed destructured t", "function label({ t: translate }) {\n  return translate`Hello`;\n}", [2]],
		["an underscore translator", "const label = (_) => _`Hello`;", [1]],
		["the t property of a translator object", "function label(lingui) {\n  return lingui.t`Hello`;\n}", [2]],
		["the core translator method", "function label() {\n  return i18n._`Hello`;\n}", [2]],
		[
			"a comment between the tag and the template",
			"function label(translate) {\n  return translate /* note */ `Hi!`;\n}",
			[2],
		],
		["a parenthesized tag", "function label(translate) {\n  return (translate)`Hi!`;\n}", [2]],
		["a tag behind a type assertion", "function label(translate) {\n  return (translate as Tag)`Hi!`;\n}", [2]],
	])("flags %s", (_case, source, lines) => {
		expect(findTranslatorTagViolations(source)).toEqual(lines);
	});

	it.each([
		[
			"the macro translator inside its component",
			"function View() {\n  const { t } = useLingui();\n  return t`Hello`;\n}",
		],
		[
			"a component nested in a helper that binds its own t",
			"function outer(t) {\n  function Inner() {\n    const { t } = useLingui();\n    return t`Hi`;\n  }\n  return t(label);\n}",
		],
		[
			"the core macro import",
			'import { t } from "@lingui/core/macro";\nfunction label(count) {\n  return t`Hello`;\n}',
		],
		["a descriptor call on a translator parameter", "function label(translate) {\n  return translate(msg`Hello`);\n}"],
		["a parameter t called with a descriptor", "function label(t) {\n  return t(descriptor);\n}"],
		[
			"a module-level tag",
			'import { msg } from "@lingui/core/macro";\nfunction label(count) {\n  return msg`Hello`;\n}',
		],
		[
			"a parameter declared as a template tag function",
			"function style(css: (strings: TemplateStringsArray) => string) {\n  return css`color: red;`;\n}",
		],
	])("allows %s", (_case, source) => {
		expect(findTranslatorTagViolations(source)).toEqual([]);
	});
});

/** The lines of a file that call a translator as a tagged template the Lingui macro never rewrites. */
function findTranslatorTagViolations(source: string, fileName = "source.tsx"): number[] {
	if (!TEMPLATE_CANDIDATE.test(source)) return [];
	const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
	const lines: number[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isTaggedTemplateExpression(node) && isUntransformedTranslatorTag(node)) {
			lines.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return lines;
}

/**
 * The Lingui macro rewrites only the tagged templates of the macro imports and of the t that
 * useLingui() returns in the same component. A tag bound to a function parameter, whatever its
 * name, or the t or _ property of an object reaches the runtime untransformed. A parameter that is
 * declared as a template tag function (its first parameter is a TemplateStringsArray) is a
 * deliberate tag and is allowed.
 */
function isUntransformedTranslatorTag(node: ts.TaggedTemplateExpression): boolean {
	const tag = unwrapExpression(node.tag);
	if (ts.isIdentifier(tag)) {
		const parameter = findBindingParameter(node, tag.text);
		return !!parameter && !isDeclaredTemplateTag(parameter);
	}
	return ts.isPropertyAccessExpression(tag) && (tag.name.text === "t" || tag.name.text === "_");
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isTypeAssertionExpression(current) ||
		ts.isNonNullExpression(current) ||
		ts.isSatisfiesExpression(current)
	) {
		current = current.expression;
	}
	return current;
}

function isDeclaredTemplateTag(parameter: ts.ParameterDeclaration): boolean {
	const type = parameter.type;
	if (!type || !ts.isFunctionTypeNode(type)) return false;
	const first = type.parameters[0]?.type;
	return !!first && ts.isTypeReferenceNode(first) && first.typeName.getText() === "TemplateStringsArray";
}

function findBindingParameter(node: ts.Node, name: string): ts.ParameterDeclaration | undefined {
	for (let scope = node.parent; scope; scope = scope.parent) {
		if (ts.isFunctionLike(scope)) {
			const parameter = scope.parameters.find((candidate) => bindsName(candidate.name, name));
			if (parameter) return parameter;
		}
		if (declaresName(scope, name)) return undefined;
	}
	return undefined;
}

function declaresName(scope: ts.Node, name: string): boolean {
	if (ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseOrDefaultClause(scope)) {
		return scope.statements.some((statement) => statementDeclaresName(statement, name));
	}
	if (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) {
		const initializer = scope.initializer;
		return (
			!!initializer &&
			ts.isVariableDeclarationList(initializer) &&
			initializer.declarations.some((declaration) => bindsName(declaration.name, name))
		);
	}
	if (ts.isCatchClause(scope)) {
		return !!scope.variableDeclaration && bindsName(scope.variableDeclaration.name, name);
	}
	return false;
}

function statementDeclaresName(statement: ts.Statement, name: string): boolean {
	if (ts.isVariableStatement(statement)) {
		return statement.declarationList.declarations.some((declaration) => bindsName(declaration.name, name));
	}
	if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return statement.name?.text === name;
	if (ts.isImportDeclaration(statement)) {
		const clause = statement.importClause;
		if (!clause) return false;
		if (clause.name?.text === name) return true;
		const bindings = clause.namedBindings;
		if (!bindings) return false;
		if (ts.isNamespaceImport(bindings)) return bindings.name.text === name;
		return bindings.elements.some((element) => element.name.text === name);
	}
	return false;
}

function bindsName(binding: ts.BindingName, name: string): boolean {
	if (ts.isIdentifier(binding)) return binding.text === name;
	return binding.elements.some((element) => !ts.isOmittedExpression(element) && bindsName(element.name, name));
}

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split("\n").length;
}

function findSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			return entry.name === "tests" || entry.name === "__tests__" ? [] : findSourceFiles(entryPath);
		}
		if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) return [];
		return [entryPath];
	});
}
