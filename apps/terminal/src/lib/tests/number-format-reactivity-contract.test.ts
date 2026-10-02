import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// React Compiler caches a call such as formatNumber(x) by its arguments only. The module-level
// formatters in lib/format.ts read the number-format setting from global state, so a cached result
// keeps the previous format after a switch even when its component re-renders. Components and hooks
// therefore take their formatters from useNumberFormat(), whose functions change identity with the
// setting, and pass them to any helper that formats during render (ADR 0036). Source-level rules,
// independent of whether the compiler currently compiles a given component.
const SOURCE_ROOT = resolve(__dirname, "../..");
const FORMAT_MODULE = "lib/format.ts";
const GLOBAL_NUMBER_FORMAT_READERS = new Set([
	"formatDecimalString",
	"formatLiquidationPrice",
	"formatNumber",
	"formatPercent",
	"formatPrice",
	"formatQuoteAmount",
	"formatSlippageBps",
	"formatToken",
	"formatUSD",
	"getNumberFormatters",
]);
const REACTIVITY_MODULE = "lib/number-format-reactivity.ts";
const REACTIVITY_READERS = new Set(["getNumberFormatRevision", "subscribeNumberFormatChange"]);
const NUMBER_FORMAT_HOOK = `${FORMAT_MODULE}#useNumberFormat`;
const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo"]);
const ROUTE_COMPONENT_PROPERTIES = new Set(["component", "errorComponent", "notFoundComponent", "pendingComponent"]);
const DOCUMENT_TITLE_SOURCE = readFileSync(resolve(SOURCE_ROOT, "hooks/use-document-title.ts"), "utf8");

describe("number format reactivity contract", () => {
	it("formats numbers in components and hooks only with the formatters from useNumberFormat()", () => {
		expect(findNumberFormatViolations(readSourceTree(SOURCE_ROOT))).toEqual([]);
	}, 30_000);

	it.each([
		["trade/orderbook/orderbook-row.tsx", "OrderbookRowComponent"],
		["trade/orderbook/trade-row.tsx", "TradeRowComponent"],
	])("keeps memoized row %s subscribed in its component body", (relativePath, componentName) => {
		const source = parseSource(readFileSync(resolve(SOURCE_ROOT, "components", relativePath), "utf8"), relativePath);
		const component = findFunction(source, componentName);

		expect(component?.body && ts.isBlock(component.body) && hasNumberFormatCall(component.body)).toBe(true);
	});

	it("recomputes the document title when the number format changes", () => {
		expect(DOCUMENT_TITLE_SOURCE).toContain("const { formatPrice } = useNumberFormat()");
		expect(DOCUMENT_TITLE_SOURCE).toContain('style: "decimal"');
		expect(DOCUMENT_TITLE_SOURCE).toContain("[formatPrice, isSpot, markPx, pairName, szDecimals]");
	});
});

describe("number format contract checker", () => {
	it.each([
		[
			"a module-level formatter in a component",
			{
				"components/sample.tsx": `import { formatNumber } from "@/lib/format";
export function Sample({ value }: { value: number }) { return <p>{formatNumber(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatNumber"],
		],
		[
			"a module-level formatter in a hook",
			{
				"hooks/use-sample.ts": `import { formatUSD } from "@/lib/format";
export function useSample(value: number) { return formatUSD(value); }`,
			},
			["hooks/use-sample.ts:2 useSample formatUSD"],
		],
		[
			"a module-level formatter in a parameter default",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export function Sample({ format = (value: number) => formatUSD(value) }: { format?: (value: number) => string }) { return <p>{format(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatUSD"],
		],
		[
			"a module-level formatter in an event handler",
			{
				"components/sample.tsx": `import { formatToken } from "@/lib/format";
export function Sample({ send }: { send: (text: string) => void }) { return <button type="button" onClick={() => send(formatToken(1))} />; }`,
			},
			["components/sample.tsx:2 Sample formatToken"],
		],
		[
			"a memoized component",
			{
				"components/sample.tsx": `import { memo } from "react";
import { formatPercent } from "@/lib/format";
export const Sample = memo(function SampleRow({ value }: { value: number }) { return <p>{formatPercent(value)}</p>; });`,
			},
			["components/sample.tsx:3 SampleRow formatPercent"],
		],
		[
			"an anonymous default-exported component",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export default function () { return <p>{formatUSD(1)}</p>; }`,
			},
			["components/sample.tsx:2 <default> formatUSD"],
		],
		[
			"an inline route component",
			{
				"routes/sample.tsx": `import { formatUSD } from "@/lib/format";
export const Route = createFileRoute("/sample")({ component: () => <p>{formatUSD(1)}</p> });`,
			},
			["routes/sample.tsx:2 component formatUSD"],
		],
		[
			"a namespace import of the formatters",
			{
				"components/sample.tsx": `import * as format from "@/lib/format";
export function Sample() { return <p>{format.formatNumber(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatNumber"],
		],
		[
			"a helper in another module that formats through a module-level formatter",
			{
				"lib/sample-label.ts": `import { formatPrice } from "@/lib/format";
export function formatSampleLabel(value: number) { return \`Price \${formatPrice(value)}\`; }`,
				"components/sample.tsx": `import { formatSampleLabel } from "@/lib/sample-label";
export function Sample({ value }: { value: number }) { return <p>{formatSampleLabel(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatSampleLabel"],
		],
		[
			"a helper reached through export *",
			{
				"lib/labels/price.ts": `import { formatPrice } from "@/lib/format";
export function priceLabel(value: number) { return formatPrice(value); }`,
				"lib/labels/index.ts": `export * from "./price";`,
				"components/sample.tsx": `import { priceLabel } from "@/lib/labels";
export function Sample() { return <p>{priceLabel(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample priceLabel"],
		],
		[
			"a formatter re-exported under another name",
			{
				"lib/fmt.ts": `import { formatPrice } from "@/lib/format";
export { formatPrice as fmt };`,
				"components/sample.tsx": `import { fmt } from "@/lib/fmt";
export function Sample() { return <p>{fmt(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample fmt"],
		],
		[
			"a default-exported helper",
			{
				"lib/label.ts": `import { formatUSD } from "@/lib/format";
export default function label(value: number) { return formatUSD(value); }`,
				"components/sample.tsx": `import label from "@/lib/label";
export function Sample() { return <p>{label(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"a same-file helper passed to a child as a render callback",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
function renderValue(value: number) { return formatUSD(value); }
export function Sample({ Table }: { Table: (props: { render: (value: number) => string }) => null }) { return <Table render={renderValue} />; }`,
			},
			["components/sample.tsx:3 Sample renderValue"],
		],
		[
			"the current formatters read during render",
			{
				"components/sample.tsx": `import { getNumberFormatters } from "@/lib/format";
export function Sample({ value }: { value: number }) { return <p>{getNumberFormatters().formatNumber(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample getNumberFormatters"],
		],
		[
			"the revision read during render",
			{
				"components/sample.tsx": `import { getNumberFormatRevision } from "@/lib/number-format-reactivity";
export function Sample() { return <p>{getNumberFormatRevision()}</p>; }`,
			},
			["components/sample.tsx:2 Sample getNumberFormatRevision"],
		],
		[
			"a subscription whose formatters never reach the formatting",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample({ label }: { label: string }) { useNumberFormat(); return <p>{label}</p>; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"a renamed subscription whose formatters never reach the formatting",
			{
				"components/sample.tsx": `import { useNumberFormat as useFormat } from "@/lib/format";
export function Sample({ label }: { label: string }) { useFormat(); return <p>{label}</p>; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"formatters assigned and never used",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample({ label }: { label: string }) { const numberFormat = useNumberFormat(); return <p>{label}</p>; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"a value formatted once at import",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
const ZERO = formatUSD(0);
export function Sample() { return <p>{ZERO}</p>; }`,
			},
			["components/sample.tsx:2 <module> formatUSD", "components/sample.tsx:3 Sample ZERO"],
		],
	])("flags %s", (_name, files, expected) => {
		expect(findNumberFormatViolations(withFormatStubs(files))).toEqual(expected);
	});

	it.each([
		[
			"formatters destructured from useNumberFormat()",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample({ value }: { value: number }) {
	const { formatNumber } = useNumberFormat();
	function renderValue() { return formatNumber(value); }
	return <p onClick={() => formatNumber(value)}>{renderValue()}</p>;
}`,
			},
		],
		[
			"a helper that receives the formatters",
			{
				"lib/sample-label.ts": `import type { NumberFormatters } from "@/lib/format";
export function formatSampleLabel(value: number, numberFormat: NumberFormatters) { return numberFormat.formatPrice(value); }`,
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
import { formatSampleLabel } from "@/lib/sample-label";
export function Sample({ value }: { value: number }) { const numberFormat = useNumberFormat(); return <p>{formatSampleLabel(value, numberFormat)}</p>; }`,
			},
		],
		[
			"formatters received as props",
			{
				"components/sample.tsx": `export function Sample({ formatUSD }: { formatUSD: (value: number) => string }) { return <p>{formatUSD(1)}</p>; }`,
			},
		],
		[
			"a local function that shadows a formatter name",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export function exportCell(value: number) { return formatUSD(value); }
export function Sample() { const formatUSD = (value: number) => String(value); return <p>{formatUSD(1)}</p>; }`,
			},
		],
		[
			"module-level formatters in code no component or hook calls",
			{
				"lib/sample-export.ts": `import { formatToken } from "@/lib/format";
export function buildCsvCell(value: string) { return formatToken(value); }`,
			},
		],
	])("allows %s", (_name, files) => {
		expect(findNumberFormatViolations(withFormatStubs(files))).toEqual([]);
	});
});

interface ModuleBinding {
	path: string | null;
	name: string;
}

interface SourceModule {
	path: string;
	file: ts.SourceFile;
	imports: Map<string, ModuleBinding>;
	namespaces: Map<string, string | null>;
	reexports: Map<string, ModuleBinding>;
	starExports: (string | null)[];
	localExports: Map<string, string>;
	declarations: Map<string, ts.Node>;
}

function withFormatStubs(files: Record<string, string>): Map<string, string> {
	return new Map([
		[
			FORMAT_MODULE,
			[...GLOBAL_NUMBER_FORMAT_READERS, "useNumberFormat"]
				.map((name) => `export function ${name}(..._args: unknown[]): any {}`)
				.join("\n"),
		],
		[REACTIVITY_MODULE, [...REACTIVITY_READERS].map((name) => `export function ${name}(): any {}`).join("\n")],
		...Object.entries(files),
	]);
}

function readSourceTree(directory: string): Map<string, string> {
	const sources = new Map<string, string>();
	const visit = (current: string) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const entryPath = resolve(current, entry.name);
			if (entry.isDirectory()) {
				if (!["__tests__", "locales", "tests"].includes(entry.name)) visit(entryPath);
			} else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$|\.gen\.ts$/.test(entry.name)) {
				sources.set(relative(directory, entryPath), readFileSync(entryPath, "utf8"));
			}
		}
	};
	visit(directory);
	return sources;
}

function findNumberFormatViolations(sources: Map<string, string>): string[] {
	const modules = new Map<string, SourceModule>();
	for (const [path, text] of sources) modules.set(path, describeModule(path, text, sources));

	const formatting = new Set([
		...[...GLOBAL_NUMBER_FORMAT_READERS].map((name) => `${FORMAT_MODULE}#${name}`),
		...[...REACTIVITY_READERS].map((name) => `${REACTIVITY_MODULE}#${name}`),
	]);
	const references = new Map<string, Set<string>>();
	for (const module of modules.values()) {
		if (module.path === FORMAT_MODULE || module.path === REACTIVITY_MODULE) continue;
		for (const [name, node] of module.declarations) {
			if (ts.isFunctionLike(node) && getOwnerName(node, module) !== undefined) continue;
			references.set(`${module.path}#${name}`, collectModuleReferences(modules, module, node));
		}
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const [key, keys] of references) {
			if (!formatting.has(key) && [...keys].some((reference) => formatting.has(reference))) {
				formatting.add(key);
				changed = true;
			}
		}
	}

	const violations: string[] = [];
	for (const module of modules.values()) {
		if (module.path === FORMAT_MODULE || module.path === REACTIVITY_MODULE) continue;
		if (!mayReachNumberFormatting(modules, module, formatting)) continue;
		const line = (node: ts.Node) => module.file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
		const visit = (node: ts.Node, owner: string | null, ownerNode: ts.Node | null) => {
			let currentOwner = owner;
			let currentOwnerNode = ownerNode;
			if (ts.isFunctionLike(node)) {
				const name = getOwnerName(node, module);
				if (name !== undefined) {
					currentOwner = name;
					currentOwnerNode = node;
				}
			}
			if (ts.isCallExpression(node) && resolveCallee(modules, module, node) === NUMBER_FORMAT_HOOK) {
				if (!numberFormatResultIsUsed(node, currentOwnerNode ?? module.file)) {
					violations.push(`${module.path}:${line(node)} ${currentOwner ?? "<module>"} useNumberFormat() result unused`);
				}
			}
			if (ts.isIdentifier(node) && isValueReference(node) && !isLocallyBound(node)) {
				const reference = resolveReference(modules, module, node);
				const atModuleScope = currentOwner === null && !isInsideFunction(node);
				if (reference && formatting.has(reference.key) && (currentOwner !== null || atModuleScope)) {
					violations.push(`${module.path}:${line(node)} ${currentOwner ?? "<module>"} ${reference.name}`);
				}
			}
			ts.forEachChild(node, (child) => visit(child, currentOwner, currentOwnerNode));
		};
		visit(module.file, null, null);
	}
	return violations.sort();
}

function mayReachNumberFormatting(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	formatting: ReadonlySet<string>,
): boolean {
	if (module.namespaces.size > 0) return true;
	for (const name of module.declarations.keys()) {
		if (formatting.has(`${module.path}#${name}`)) return true;
	}
	for (const name of module.imports.keys()) {
		const key = resolveBinding(modules, module.path, name, new Set());
		if (key && (formatting.has(key) || key === NUMBER_FORMAT_HOOK)) return true;
	}
	return false;
}

function describeModule(path: string, text: string, sources: Map<string, string>): SourceModule {
	const file = parseSource(text, path);
	const module: SourceModule = {
		path,
		file,
		imports: new Map(),
		namespaces: new Map(),
		reexports: new Map(),
		starExports: [],
		localExports: new Map(),
		declarations: new Map(),
	};
	for (const statement of file.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			const target = resolveModulePath(path, statement.moduleSpecifier.text, sources);
			const clause = statement.importClause;
			if (clause?.name) module.imports.set(clause.name.text, { path: target, name: "default" });
			const bindings = clause?.namedBindings;
			if (bindings && ts.isNamespaceImport(bindings)) module.namespaces.set(bindings.name.text, target);
			if (bindings && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					module.imports.set(element.name.text, { path: target, name: (element.propertyName ?? element.name).text });
				}
			}
		} else if (ts.isExportDeclaration(statement)) {
			const target =
				statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
					? resolveModulePath(path, statement.moduleSpecifier.text, sources)
					: undefined;
			if (!statement.exportClause) {
				if (target !== undefined) module.starExports.push(target);
			} else if (ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) {
					const localName = (element.propertyName ?? element.name).text;
					if (target === undefined) module.localExports.set(element.name.text, localName);
					else module.reexports.set(element.name.text, { path: target, name: localName });
				}
			}
		} else if (ts.isExportAssignment(statement)) {
			if (ts.isIdentifier(statement.expression)) module.localExports.set("default", statement.expression.text);
			else module.declarations.set("default", statement.expression);
		} else if (ts.isFunctionDeclaration(statement)) {
			const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
			if (statement.name) {
				module.declarations.set(statement.name.text, statement);
				if (isDefault) module.localExports.set("default", statement.name.text);
			} else if (isDefault) {
				module.declarations.set("default", statement);
			}
		} else if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name) && declaration.initializer) {
					module.declarations.set(declaration.name.text, declaration.initializer);
				}
			}
		}
	}
	return module;
}

function resolveModulePath(fromPath: string, specifier: string, sources: Map<string, string>): string | null {
	let base: string;
	if (specifier.startsWith("@/")) base = specifier.slice(2);
	else if (specifier.startsWith(".")) base = relative(SOURCE_ROOT, resolve(SOURCE_ROOT, fromPath, "..", specifier));
	else return null;
	for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
		if (sources.has(candidate)) return candidate;
	}
	return null;
}

function resolveReference(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	identifier: ts.Identifier,
): { key: string; name: string } | null {
	const parent = identifier.parent;
	if (module.namespaces.has(identifier.text)) {
		const target = module.namespaces.get(identifier.text);
		if (!target || !ts.isPropertyAccessExpression(parent) || parent.expression !== identifier) return null;
		const key = resolveExport(modules, target, parent.name.text, new Set());
		return key ? { key, name: parent.name.text } : null;
	}
	const key = resolveBinding(modules, module.path, identifier.text, new Set());
	return key ? { key, name: identifier.text } : null;
}

function resolveCallee(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	call: ts.CallExpression,
): string | null {
	const callee = call.expression;
	if (ts.isIdentifier(callee)) {
		return isLocallyBound(callee) ? null : (resolveReference(modules, module, callee)?.key ?? null);
	}
	if (
		ts.isPropertyAccessExpression(callee) &&
		ts.isIdentifier(callee.expression) &&
		!isLocallyBound(callee.expression)
	) {
		return resolveReference(modules, module, callee.expression)?.key ?? null;
	}
	return null;
}

function resolveBinding(
	modules: Map<string, SourceModule>,
	path: string,
	name: string,
	seen: Set<string>,
): string | null {
	const module = modules.get(path);
	if (!module) return null;
	if (module.declarations.has(name)) return `${path}#${name}`;
	const imported = module.imports.get(name);
	return imported?.path ? resolveExport(modules, imported.path, imported.name, seen) : null;
}

function resolveExport(
	modules: Map<string, SourceModule>,
	path: string,
	name: string,
	seen: Set<string>,
): string | null {
	const key = `${path}#${name}`;
	if (seen.has(key)) return null;
	seen.add(key);
	const module = modules.get(path);
	if (!module) return null;
	if (module.declarations.has(name)) return key;
	const localName = module.localExports.get(name);
	if (localName) return resolveBinding(modules, path, localName, seen);
	const reexport = module.reexports.get(name);
	if (reexport?.path) return resolveExport(modules, reexport.path, reexport.name, seen);
	if (name === "default") return null;
	for (const target of module.starExports) {
		const resolved = target ? resolveExport(modules, target, name, seen) : null;
		if (resolved) return resolved;
	}
	return null;
}

function collectModuleReferences(modules: Map<string, SourceModule>, module: SourceModule, root: ts.Node): Set<string> {
	const keys = new Set<string>();
	const visit = (node: ts.Node) => {
		if (ts.isIdentifier(node) && isValueReference(node) && !isLocallyBound(node)) {
			const reference = resolveReference(modules, module, node);
			if (reference) keys.add(reference.key);
		}
		ts.forEachChild(node, visit);
	};
	visit(root);
	return keys;
}

function numberFormatResultIsUsed(call: ts.CallExpression, scope: ts.Node): boolean {
	const parent = call.parent;
	if (!ts.isVariableDeclaration(parent) || parent.initializer !== call) return !ts.isExpressionStatement(parent);
	const names: string[] = [];
	collectBindingNames(parent.name, names);
	let used = false;
	const visit = (node: ts.Node) => {
		if (used) return;
		if (ts.isIdentifier(node) && names.includes(node.text) && isValueReference(node)) used = true;
		ts.forEachChild(node, visit);
	};
	visit(scope);
	return used;
}

function isValueReference(identifier: ts.Identifier): boolean {
	const parent = identifier.parent;
	if (ts.isPropertyAccessExpression(parent)) return parent.expression === identifier;
	if (ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent)) return false;
	if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.initializer === identifier;
	if (ts.isBindingElement(parent)) return parent.initializer === identifier;
	if (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) return parent.initializer === identifier;
	if (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent)) {
		return parent.name !== identifier;
	}
	if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
	if (ts.isExportSpecifier(parent)) return false;
	if (ts.isJsxAttribute(parent)) return false;
	if (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) {
		return false;
	}
	if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent) || ts.isQualifiedName(parent)) return false;
	return !ts.isTypeNode(parent);
}

function isLocallyBound(identifier: ts.Identifier): boolean {
	for (let node: ts.Node = identifier.parent; !ts.isSourceFile(node); node = node.parent) {
		if (scopeDeclares(node, identifier.text)) return true;
	}
	return false;
}

const scopeNameCache = new WeakMap<ts.Node, ReadonlySet<string>>();

function scopeDeclares(scope: ts.Node, name: string): boolean {
	let names = scopeNameCache.get(scope);
	if (!names) {
		names = new Set(collectScopeNames(scope));
		scopeNameCache.set(scope, names);
	}
	return names.has(name);
}

function collectScopeNames(scope: ts.Node): string[] {
	const names: string[] = [];
	if (ts.isFunctionLike(scope)) {
		for (const parameter of scope.parameters) collectBindingNames(parameter.name, names);
		if (ts.isFunctionExpression(scope) && scope.name) names.push(scope.name.text);
	} else if (ts.isCatchClause(scope)) {
		if (scope.variableDeclaration) collectBindingNames(scope.variableDeclaration.name, names);
	} else if (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) {
		if (scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
			for (const declaration of scope.initializer.declarations) collectBindingNames(declaration.name, names);
		}
	} else if (ts.isBlock(scope) || ts.isCaseBlock(scope)) {
		const statements = ts.isBlock(scope) ? scope.statements : scope.clauses.flatMap((clause) => [...clause.statements]);
		for (const statement of statements) {
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					collectBindingNames(declaration.name, names);
				}
			} else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
				names.push(statement.name.text);
			}
		}
	}
	return names;
}

function collectBindingNames(name: ts.BindingName, into: string[]): void {
	if (ts.isIdentifier(name)) {
		into.push(name.text);
		return;
	}
	for (const element of name.elements) {
		if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, into);
	}
}

function isInsideFunction(node: ts.Node): boolean {
	for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
		if (ts.isFunctionLike(current)) return true;
	}
	return false;
}

function hasNumberFormatCall(body: ts.Block): boolean {
	return body.statements.some(
		(statement) =>
			ts.isVariableStatement(statement) &&
			statement.declarationList.declarations.some(
				(declaration) =>
					declaration.initializer !== undefined &&
					ts.isCallExpression(declaration.initializer) &&
					ts.isIdentifier(declaration.initializer.expression) &&
					declaration.initializer.expression.text === "useNumberFormat",
			),
	);
}

function findFunction(file: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | undefined {
	let match: ts.FunctionLikeDeclaration | undefined;
	const visit = (node: ts.Node) => {
		if (isFunctionLikeDeclaration(node) && getDeclaredName(node) === name) match = node;
		ts.forEachChild(node, visit);
	};
	visit(file);
	return match;
}

function isFunctionLikeDeclaration(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node)
	);
}

// Components and hooks are recognized by name, plus an anonymous default-exported function in a .tsx
// module and a function passed as a route's component option.
function getOwnerName(node: ts.SignatureDeclaration, module: SourceModule): string | undefined {
	const name = getDeclaredName(node);
	if (name !== undefined) return /^(?:[A-Z]|use[A-Z0-9])/.test(name) ? name : undefined;
	if (!isFunctionLikeDeclaration(node)) return undefined;
	const parent = node.parent;
	const isAnonymousDefault =
		(ts.isFunctionDeclaration(node) && hasModifier(node, ts.SyntaxKind.DefaultKeyword)) ||
		(ts.isExportAssignment(parent) && parent.expression === node);
	if (isAnonymousDefault && module.path.endsWith(".tsx")) return "<default>";
	if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
		return ROUTE_COMPONENT_PROPERTIES.has(parent.name.text) ? parent.name.text : undefined;
	}
	return undefined;
}

function getDeclaredName(node: ts.SignatureDeclaration): string | undefined {
	if (node.name && ts.isIdentifier(node.name)) return node.name.text;
	let parent = node.parent;
	while (
		ts.isParenthesizedExpression(parent) ||
		ts.isAsExpression(parent) ||
		ts.isSatisfiesExpression(parent) ||
		(ts.isCallExpression(parent) && COMPONENT_WRAPPERS.has(calleeName(parent) ?? ""))
	) {
		parent = parent.parent;
	}
	if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
	return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

function calleeName(call: ts.CallExpression): string | undefined {
	if (ts.isIdentifier(call.expression)) return call.expression.text;
	if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
	return undefined;
}

function parseSource(source: string, fileName: string): ts.SourceFile {
	const scriptKind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
	return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
}
