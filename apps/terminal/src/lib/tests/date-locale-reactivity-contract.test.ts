import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// formatDateTime, formatDateTimeShort, formatTime and formatList in lib/format.ts read the interface
// language from the global Lingui instance when a call passes no `locale` option. React Compiler caches
// such a call by its other arguments, so the result keeps the previous language after a switch unless
// its cache slot happens to depend on the translator as well. Components and hooks therefore pass a
// `locale` option to every call, effects and event handlers included, and a module-level helper they
// reach passes on the locale it receives (docs/i18n-presentation.md). Source-level rules, independent
// of how the compiler currently groups a component's cache slots.
const SOURCE_ROOT = resolve(__dirname, "../..");
const FORMAT_MODULE = "lib/format.ts";
const LANGUAGE_FORMATTERS = new Set(["formatDateTime", "formatDateTimeShort", "formatList", "formatTime"]);
const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo"]);
const ROUTE_COMPONENT_PROPERTIES = new Set(["component", "errorComponent", "notFoundComponent", "pendingComponent"]);

describe("date and list locale contract", () => {
	it("passes a locale to every date and list formatter call in components and hooks", () => {
		expect(findLanguageFormatViolations(readSourceTree(SOURCE_ROOT))).toEqual([]);
	}, 30_000);

	it("covers every lib/format.ts export that reads the interface language", () => {
		const source = readFileSync(resolve(SOURCE_ROOT, FORMAT_MODULE), "utf8");
		expect(findLanguageReadingExports(source)).toEqual([...LANGUAGE_FORMATTERS].sort());
	});

	it("finds a new lib/format.ts export that reads the interface language", () => {
		const source = `import { i18n } from "@lingui/core";
function activeLocale() { return i18n.locale; }
export function formatRelative(at: number, opts?: { locale?: string }) { return String(at) + (opts?.locale ?? activeLocale()); }
export function formatPlain(at: number) { return String(at); }`;
		expect(findLanguageReadingExports(source)).toEqual(["formatRelative"]);
	});
});

describe("date and list locale contract checker", () => {
	it.each([
		[
			"a call without options in a component",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
export function Sample({ at }: { at: number }) { return <p>{formatDateTime(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatDateTime"],
		],
		[
			"options without a locale",
			{
				"components/sample.tsx": `import { formatTime } from "@/lib/format";
export function Sample({ at }: { at: number }) { return <p>{formatTime(at, { hour: "2-digit", minute: "2-digit" })}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatTime"],
		],
		[
			"options spread without a locale of their own",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
export function Sample({ at, options }: { at: number; options: { locale: string } }) { return <p>{formatDateTime(at, { ...options })}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatDateTime"],
		],
		[
			"options passed as a variable",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
export function Sample({ at, locale }: { at: number; locale: string }) { const options = { locale }; return <p>{formatDateTime(at, options)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatDateTime"],
		],
		[
			"a call in a hook",
			{
				"hooks/use-sample.ts": `import { formatDateTimeShort } from "@/lib/format";
export function useSample(at: number) { return formatDateTimeShort(at); }`,
			},
			["hooks/use-sample.ts:2 useSample formatDateTimeShort"],
		],
		[
			"a list in a render-time map callback",
			{
				"components/sample.tsx": `import { formatList } from "@/lib/format";
export function Sample({ groups }: { groups: string[][] }) { return <div>{groups.map((group) => <p key={group[0]}>{formatList(group)}</p>)}</div>; }`,
			},
			["components/sample.tsx:2 Sample formatList"],
		],
		[
			"a named render helper inside a component",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
export function Sample({ times }: { times: number[] }) {
	function renderTime(at: number) { return <p key={at}>{formatDateTime(at)}</p>; }
	return <div>{times.map(renderTime)}</div>;
}`,
			},
			["components/sample.tsx:3 Sample formatDateTime"],
		],
		[
			"an export column built in a hook option",
			{
				"components/sample.tsx": `import { formatDateTimeShort } from "@/lib/format";
export function Sample({ useCsvExport }: { useCsvExport: (options: { buildRows: (rows: number[]) => string[][] }) => void }) {
	useCsvExport({ buildRows: (rows) => rows.map((at) => [formatDateTimeShort(at)]) });
	return null;
}`,
			},
			["components/sample.tsx:3 Sample formatDateTimeShort"],
		],
		[
			"an event handler",
			{
				"components/sample.tsx": `import { formatTime } from "@/lib/format";
export function Sample({ at, send }: { at: number; send: (text: string) => void }) { return <button type="button" onClick={() => send(formatTime(at))} />; }`,
			},
			["components/sample.tsx:2 Sample formatTime"],
		],
		[
			"an effect",
			{
				"components/sample.tsx": `import { useEffect } from "react";
import { formatDateTime } from "@/lib/format";
export function Sample({ at }: { at: number }) { useEffect(() => { document.title = formatDateTime(at); }, [at]); return null; }`,
			},
			["components/sample.tsx:3 Sample formatDateTime"],
		],
		[
			"a parameter default",
			{
				"components/sample.tsx": `import { formatTime } from "@/lib/format";
export function Sample({ format = (at: number) => formatTime(at) }: { format?: (at: number) => string }) { return <p>{format(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatTime"],
		],
		[
			"a memoized component",
			{
				"components/sample.tsx": `import { memo } from "react";
import { formatDateTimeShort } from "@/lib/format";
export const Sample = memo(function SampleRow({ at }: { at: number }) { return <p>{formatDateTimeShort(at)}</p>; });`,
			},
			["components/sample.tsx:3 SampleRow formatDateTimeShort"],
		],
		[
			"a memoized component whose function has a lowercase name",
			{
				"components/sample.tsx": `import { memo } from "react";
import { formatDateTime } from "@/lib/format";
export const Sample = memo(function render({ at }: { at: number }) { return <p>{formatDateTime(at)}</p>; });`,
			},
			["components/sample.tsx:3 Sample formatDateTime"],
		],
		[
			"an anonymous default-exported component",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
export default function () { return <p>{formatDateTime(Date.now())}</p>; }`,
			},
			["components/sample.tsx:2 <default> formatDateTime"],
		],
		[
			"a parenthesized anonymous default export",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
export default (() => <p>{formatDateTime(Date.now())}</p>);`,
			},
			["components/sample.tsx:2 <default> formatDateTime"],
		],
		[
			"an inline route component",
			{
				"routes/sample.tsx": `import { formatDateTime } from "@/lib/format";
export const Route = createFileRoute("/sample")({ component: () => <p>{formatDateTime(Date.now())}</p> });`,
			},
			["routes/sample.tsx:2 component formatDateTime"],
		],
		[
			"a route component under a string key",
			{
				"routes/sample.tsx": `import { formatDateTime } from "@/lib/format";
export const Route = createFileRoute("/sample")({ "component": () => <p>{formatDateTime(Date.now())}</p> });`,
			},
			["routes/sample.tsx:2 component formatDateTime"],
		],
		[
			"a namespace import of the formatters",
			{
				"components/sample.tsx": `import * as format from "@/lib/format";
export function Sample({ at }: { at: number }) { return <p>{format.formatDateTime(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatDateTime"],
		],
		[
			"a renamed import",
			{
				"components/sample.tsx": `import { formatTime as formatClock } from "@/lib/format";
export function Sample({ at }: { at: number }) { return <p>{formatClock(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatClock"],
		],
		[
			"a formatter passed on as a value",
			{
				"components/sample.tsx": `import { formatTime } from "@/lib/format";
export function Sample({ Axis }: { Axis: (props: { format: (at: number) => string }) => null }) { return <Axis format={formatTime} />; }`,
			},
			["components/sample.tsx:2 Sample formatTime"],
		],
		[
			"a module-level alias of a formatter called without a locale",
			{
				"lib/when.ts": `import { formatDateTime } from "@/lib/format";
export const formatWhen = formatDateTime;`,
				"components/sample.tsx": `import { formatWhen } from "@/lib/when";
export function Sample({ at }: { at: number }) { return <p>{formatWhen(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatWhen"],
		],
		[
			"a formatter re-exported under another name",
			{
				"lib/when.ts": `import { formatDateTime } from "@/lib/format";
export { formatDateTime as formatWhen };`,
				"components/sample.tsx": `import { formatWhen } from "@/lib/when";
export function Sample() { return <p>{formatWhen(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatWhen"],
		],
		[
			"a same-file helper that formats without a locale",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
function formatRowTime(at: number) { return formatDateTime(at, { dateStyle: "short" }); }
export function Sample({ at }: { at: number }) { return <p>{formatRowTime(at)}</p>; }`,
			},
			["components/sample.tsx:3 Sample formatRowTime"],
		],
		[
			"a helper in another module that formats without a locale",
			{
				"lib/sample-time.ts": `import { formatDateTimeShort } from "@/lib/format";
export function formatSampleTime(at: number) { return \`Since \${formatDateTimeShort(at)}\`; }`,
				"components/sample.tsx": `import { formatSampleTime } from "@/lib/sample-time";
export function Sample({ at }: { at: number }) { return <p>{formatSampleTime(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatSampleTime"],
		],
		[
			"a default-exported helper that formats without a locale",
			{
				"lib/time-label.ts": `import { formatTime } from "@/lib/format";
export default function timeLabel(at: number) { return formatTime(at); }`,
				"components/sample.tsx": `import timeLabel from "@/lib/time-label";
export function Sample({ at }: { at: number }) { return <p>{timeLabel(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample timeLabel"],
		],
		[
			"a helper reached through export *",
			{
				"lib/labels/time.ts": `import { formatTime } from "@/lib/format";
export function timeLabel(at: number) { return formatTime(at); }`,
				"lib/labels/index.ts": `export * from "./time";`,
				"components/sample.tsx": `import { timeLabel } from "@/lib/labels";
export function Sample() { return <p>{timeLabel(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample timeLabel"],
		],
		[
			"a helper that destructures a formatter from a namespace import",
			{
				"lib/sample-label.ts": `import * as format from "@/lib/format";
const { formatDateTime } = format;
export function label(at: number) { return formatDateTime(at); }`,
				"components/sample.tsx": `import { label } from "@/lib/sample-label";
export function Sample() { return <p>{label(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"a value formatted once at import",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
const OPENED_AT = formatDateTime(Date.now());
export function Sample() { return <p>{OPENED_AT}</p>; }`,
			},
			["components/sample.tsx:2 <module> formatDateTime", "components/sample.tsx:3 Sample OPENED_AT"],
		],
	])("flags %s", (_name, files, expected) => {
		expect(findLanguageFormatViolations(withFormatStubs(files))).toEqual(expected);
	});

	it.each([
		[
			"a locale read once and passed to every call",
			{
				"components/sample.tsx": `import { useLingui } from "@lingui/react/macro";
import { formatDateTime, formatList, formatTime } from "@/lib/format";
export function Sample({ at, groups, send }: { at: number; groups: string[][]; send: (text: string) => void }) {
	const { i18n } = useLingui();
	const locale = i18n.locale;
	function renderGroup(group: string[]) { return <p key={group[0]}>{formatList(group, { locale })}</p>; }
	return (
		<div onClick={() => send(formatTime(at, { locale, hour: "2-digit" }))}>
			{formatDateTime(at, { locale: locale, dateStyle: "short" })}
			{groups.map(renderGroup)}
		</div>
	);
}`,
			},
		],
		[
			"the live locale read inside an effect",
			{
				"components/sample.tsx": `import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { formatDateTime } from "@/lib/format";
export function Sample({ at }: { at: number }) {
	const { i18n } = useLingui();
	useEffect(() => { document.title = formatDateTime(at, { locale: i18n.locale }); }, [at, i18n.locale]);
	return null;
}`,
			},
		],
		[
			"a namespace call, a parenthesized callee and asserted options with a locale",
			{
				"components/sample.tsx": `import * as format from "@/lib/format";
import { formatTime, type FormatDateOptions } from "@/lib/format";
export function Sample({ at, locale }: { at: number; locale: string }) {
	return <p>{format.formatDateTime(at, { locale })}{(formatTime)(at, { ["locale"]: locale } as FormatDateOptions)}</p>;
}`,
			},
		],
		[
			"a helper that receives the locale",
			{
				"lib/sample-time.ts": `import { formatDateTimeShort } from "@/lib/format";
export function formatSampleTime(at: number, locale: string) { return formatDateTimeShort(at, { locale }); }`,
				"components/sample.tsx": `import { useLingui } from "@lingui/react/macro";
import { formatSampleTime } from "@/lib/sample-time";
export function Sample({ at }: { at: number }) { const { i18n } = useLingui(); const locale = i18n.locale; return <p>{formatSampleTime(at, locale)}</p>; }`,
			},
		],
		[
			"a module-level alias called with a locale",
			{
				"lib/when.ts": `import * as format from "@/lib/format";
export const formatWhen = format.formatDateTime;`,
				"components/sample.tsx": `import { formatWhen } from "@/lib/when";
export function Sample({ at, locale }: { at: number; locale: string }) { return <p>{formatWhen(at, { locale })}</p>; }`,
			},
		],
		[
			"a module-level alias that only non-React code calls",
			{
				"lib/sample-csv.ts": `import { formatDateTime } from "@/lib/format";
const formatCell = formatDateTime;
export function csvCell(at: number) { return formatCell(at); }`,
			},
		],
		[
			"a local function with a formatter's name",
			{
				"lib/chart-format.ts": `export function formatTime(date: Date) { return String(date.getHours()); }`,
				"components/sample.tsx": `import { formatTime } from "@/lib/chart-format";
export function Sample() { const formatList = (items: string[]) => items.join(); return <p>{formatTime(new Date())}{formatList([])}</p>; }`,
			},
		],
		[
			"formatters received as props",
			{
				"components/sample.tsx": `export function Sample({ formatTime }: { formatTime: (at: number) => string }) { return <p>{formatTime(1)}</p>; }`,
			},
		],
		[
			"calls without a locale in code no component or hook reaches",
			{
				"lib/sample-export.ts": `import { formatDateTime } from "@/lib/format";
export function buildCsvCell(at: number) { return formatDateTime(at); }`,
			},
		],
	])("allows %s", (_name, files) => {
		expect(findLanguageFormatViolations(withFormatStubs(files))).toEqual([]);
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
			[
				...[...LANGUAGE_FORMATTERS].map((name) => `export function ${name}(..._args: unknown[]): any {}`),
				"export interface FormatDateOptions { locale?: string }",
			].join("\n"),
		],
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

function findLanguageFormatViolations(sources: Map<string, string>): string[] {
	const modules = new Map<string, SourceModule>();
	for (const [path, text] of sources) modules.set(path, describeModule(path, text, sources));

	const globalLocaleReaders = new Set([...LANGUAGE_FORMATTERS].map((name) => `${FORMAT_MODULE}#${name}`));
	const references = new Map<string, Set<string>>();
	for (const module of modules.values()) {
		if (module.path === FORMAT_MODULE) continue;
		for (const [name, node] of module.declarations) {
			if (ts.isFunctionLike(node) && getOwnerName(node, module) !== undefined) continue;
			references.set(`${module.path}#${name}`, collectGlobalLocaleReferences(modules, module, node));
		}
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const [key, keys] of references) {
			if (!globalLocaleReaders.has(key) && [...keys].some((reference) => globalLocaleReaders.has(reference))) {
				globalLocaleReaders.add(key);
				changed = true;
			}
		}
	}

	const violations: string[] = [];
	for (const module of modules.values()) {
		if (module.path === FORMAT_MODULE) continue;
		if (!mayReachGlobalLocale(modules, module, globalLocaleReaders)) continue;
		const line = (node: ts.Node) => module.file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
		const visit = (node: ts.Node, owner: string | null) => {
			let currentOwner = owner;
			if (ts.isFunctionLike(node)) currentOwner = getOwnerName(node, module) ?? owner;
			const reference = ts.isIdentifier(node) ? readsGlobalLocale(modules, module, node) : null;
			if (ts.isIdentifier(node) && reference && globalLocaleReaders.has(reference.key)) {
				const callsAtImport = currentOwner === null && !isInsideFunction(node) && callOf(module, node) !== undefined;
				if (currentOwner !== null || callsAtImport) {
					violations.push(`${module.path}:${line(node)} ${currentOwner ?? "<module>"} ${reference.name}`);
				}
			}
			ts.forEachChild(node, (child) => visit(child, currentOwner));
		};
		visit(module.file, null);
	}
	return violations.sort();
}

// A reference that may read the global language: any reference to a module-level declaration that does,
// and any reference to a language formatter except the callee of a call that passes a `locale` option.
function readsGlobalLocale(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	node: ts.Identifier,
): { key: string; name: string } | null {
	if (!isValueReference(node) || isLocallyBound(node)) return null;
	const reference = resolveReference(modules, module, node);
	if (!reference || !isLanguageFormatter(reference.key)) return reference;
	const call = callOf(module, node);
	return call && passesLocale(call) ? null : reference;
}

function isLanguageFormatter(key: string): boolean {
	return key.startsWith(`${FORMAT_MODULE}#`) && LANGUAGE_FORMATTERS.has(key.slice(FORMAT_MODULE.length + 1));
}

// The call whose callee is this reference (the identifier, or `namespace.name` for a namespace import),
// looking through parentheses and type assertions.
function callOf(module: SourceModule, identifier: ts.Identifier): ts.CallExpression | undefined {
	let callee: ts.Node = module.namespaces.has(identifier.text) ? identifier.parent : identifier;
	while (isOuterExpression(callee.parent)) callee = callee.parent;
	const call = callee.parent;
	return ts.isCallExpression(call) && call.expression === callee ? call : undefined;
}

function passesLocale(call: ts.CallExpression): boolean {
	const options = call.arguments[1];
	if (options === undefined) return false;
	const literal = skipOuterExpressions(options);
	return ts.isObjectLiteralExpression(literal) && literal.properties.some(isLocaleProperty);
}

function isLocaleProperty(property: ts.ObjectLiteralElementLike): boolean {
	if (ts.isShorthandPropertyAssignment(property)) return property.name.text === "locale";
	if (!ts.isPropertyAssignment(property)) return false;
	const name = ts.isComputedPropertyName(property.name) ? property.name.expression : property.name;
	return (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === "locale";
}

function collectGlobalLocaleReferences(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	root: ts.Node,
): Set<string> {
	const keys = new Set<string>();
	const visit = (node: ts.Node) => {
		const reference = ts.isIdentifier(node) ? readsGlobalLocale(modules, module, node) : null;
		if (reference) keys.add(reference.key);
		ts.forEachChild(node, visit);
	};
	visit(root);
	return keys;
}

function mayReachGlobalLocale(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	globalLocaleReaders: ReadonlySet<string>,
): boolean {
	if (module.namespaces.size > 0) return true;
	for (const name of module.declarations.keys()) {
		if (globalLocaleReaders.has(`${module.path}#${name}`)) return true;
	}
	for (const name of module.imports.keys()) {
		const key = resolveBinding(modules, module.path, name, new Set());
		if (key && globalLocaleReaders.has(key)) return true;
	}
	return false;
}

// The lib/format.ts exports whose code reaches the imported Lingui `i18n`, followed through the module's
// own functions. A new export that reads the interface language must join LANGUAGE_FORMATTERS.
function findLanguageReadingExports(text: string): string[] {
	const file = parseSource(text, FORMAT_MODULE);
	const linguiBindings = new Set<string>();
	const declarations = new Map<string, ts.Node>();
	const exported = new Set<string>();
	for (const statement of file.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			const bindings = statement.importClause?.namedBindings;
			if (statement.moduleSpecifier.text !== "@lingui/core" || !bindings || !ts.isNamedImports(bindings)) continue;
			for (const element of bindings.elements) {
				if ((element.propertyName ?? element.name).text === "i18n") linguiBindings.add(element.name.text);
			}
		} else if (ts.isFunctionDeclaration(statement) && statement.name) {
			declarations.set(statement.name.text, statement);
			if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) exported.add(statement.name.text);
		} else if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
				declarations.set(declaration.name.text, declaration.initializer);
				if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) exported.add(declaration.name.text);
			}
		}
	}
	const readsByDeclaration = new Map<string, Set<string>>();
	for (const [name, node] of declarations) {
		const reads = new Set<string>();
		const visit = (child: ts.Node) => {
			if (ts.isIdentifier(child) && isValueReference(child) && !isLocallyBound(child)) reads.add(child.text);
			ts.forEachChild(child, visit);
		};
		visit(node);
		readsByDeclaration.set(name, reads);
	}
	const languageReaders = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const [name, reads] of readsByDeclaration) {
			if (languageReaders.has(name)) continue;
			if ([...reads].some((read) => linguiBindings.has(read) || languageReaders.has(read))) {
				languageReaders.add(name);
				changed = true;
			}
		}
	}
	return [...exported].filter((name) => languageReaders.has(name)).sort();
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
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
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
	}
	for (const statement of file.statements) {
		if (ts.isExportDeclaration(statement)) {
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
			const expression = skipOuterExpressions(statement.expression);
			if (ts.isIdentifier(expression)) module.localExports.set("default", expression.text);
			else module.declarations.set("default", expression);
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
				if (declaration.initializer) describeVariable(module, declaration.name, declaration.initializer);
			}
		}
	}
	return module;
}

// `const alias = imported` and `const alias = namespace.name` are aliases of the imported binding, and
// so is a name destructured from a namespace import; any other variable is a declaration whose value is
// its initializer.
function describeVariable(module: SourceModule, name: ts.BindingName, initializer: ts.Expression): void {
	const source = skipOuterExpressions(initializer);
	if (ts.isIdentifier(name)) {
		const alias = importAlias(module, source);
		if (alias) module.imports.set(name.text, alias);
		else module.declarations.set(name.text, initializer);
		return;
	}
	const namespaceTarget = ts.isIdentifier(source) ? module.namespaces.get(source.text) : undefined;
	for (const element of name.elements) {
		if (ts.isOmittedExpression(element)) continue;
		const property = element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : null;
		if (namespaceTarget !== undefined && ts.isIdentifier(element.name)) {
			module.imports.set(element.name.text, { path: namespaceTarget, name: property ?? element.name.text });
			continue;
		}
		const names: string[] = [];
		collectBindingNames(element.name, names);
		for (const bound of names) module.declarations.set(bound, initializer);
	}
}

function importAlias(module: SourceModule, source: ts.Expression): ModuleBinding | undefined {
	if (ts.isIdentifier(source)) return module.imports.get(source.text);
	if (!ts.isPropertyAccessExpression(source) || !ts.isIdentifier(source.expression)) return undefined;
	const target = module.namespaces.get(source.expression.text);
	return target === undefined ? undefined : { path: target, name: source.name.text };
}

function skipOuterExpressions(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (isOuterExpression(current)) current = current.expression;
	return current;
}

function isOuterExpression(
	node: ts.Node,
): node is ts.ParenthesizedExpression | ts.AsExpression | ts.SatisfiesExpression | ts.NonNullExpression {
	return (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isNonNullExpression(node)
	);
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
	// `export const alias = imported` is recorded as an import alias (describeVariable).
	if (module.imports.has(name)) return resolveBinding(modules, path, name, seen);
	for (const target of module.starExports) {
		const resolved = target ? resolveExport(modules, target, name, seen) : null;
		if (resolved) return resolved;
	}
	return null;
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

function isFunctionLikeDeclaration(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node)
	);
}

// Components and hooks are recognized by name: their own name, or the variable a `memo`/`forwardRef`
// wrapper is assigned to. Two anonymous kinds count as well: a default-exported function in a .tsx
// module and a function passed as a route's component option.
function getOwnerName(node: ts.SignatureDeclaration, module: SourceModule): string | undefined {
	const ownName = node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
	if (ownName !== undefined && isComponentOrHookName(ownName)) return ownName;
	let parent = node.parent;
	while (
		ts.isParenthesizedExpression(parent) ||
		ts.isAsExpression(parent) ||
		ts.isSatisfiesExpression(parent) ||
		(ts.isCallExpression(parent) && COMPONENT_WRAPPERS.has(calleeName(parent) ?? ""))
	) {
		parent = parent.parent;
	}
	if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
		return isComponentOrHookName(parent.name.text) ? parent.name.text : undefined;
	}
	if (ownName !== undefined || !isFunctionLikeDeclaration(node)) return undefined;
	const isAnonymousDefault =
		(ts.isFunctionDeclaration(node) && hasModifier(node, ts.SyntaxKind.DefaultKeyword)) ||
		ts.isExportAssignment(parent);
	if (isAnonymousDefault && module.path.endsWith(".tsx")) return "<default>";
	if (ts.isPropertyAssignment(parent) && (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))) {
		return ROUTE_COMPONENT_PROPERTIES.has(parent.name.text) ? parent.name.text : undefined;
	}
	return undefined;
}

function isComponentOrHookName(name: string): boolean {
	return /^(?:[A-Z]|use[A-Z0-9])/.test(name);
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
