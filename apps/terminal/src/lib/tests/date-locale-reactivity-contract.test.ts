import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	describeModules,
	getDestructuredKey,
	isInsideFunction,
	isLocallyBound,
	isValueReference,
	readSourceTree,
	resolveBinding,
	resolveExport,
	resolveExpressionKey,
	resolveReference,
	runsAtImport,
	type SourceModule,
} from "./harness/module-graph";
import {
	collectBindingIdentifiers,
	getComponentOrHookName,
	getStaticName,
	hasModifier,
	outermostTransparentExpression,
	parseSource,
	skipTransparentExpressions,
} from "./harness/react-source";

// formatDateTime, formatDateTimeShort, formatTime and formatList in lib/format.ts read the interface
// language from the global Lingui instance when a call passes no `locale` option. React Compiler caches
// such a call by its other arguments, so the result keeps the previous language after a switch unless
// its cache slot happens to depend on the translator as well. Components and hooks therefore pass a
// `locale` option to every call, effects and event handlers included, and a module-level helper they
// reach passes on the locale it receives (docs/i18n-presentation.md). Source-level rules, independent
// of how the compiler currently groups a component's cache slots. Components, hooks and the module graph
// are recognized by the harness shared with number-format-reactivity-contract.
const SOURCE_ROOT = resolve(__dirname, "../..");
const FORMAT_MODULE = "lib/format.ts";
const LANGUAGE_FORMATTERS = new Set(["formatDateTime", "formatDateTimeShort", "formatList", "formatTime"]);

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

	it("finds a language reader exported through an export list or as the default export", () => {
		const source = `import { i18n } from "@lingui/core";
function activeLocale() { return i18n.locale; }
function formatRelative(at: number) { return String(at) + activeLocale(); }
function formatPlain(at: number) { return String(at); }
function formatSince(at: number) { return formatRelative(at); }
export { formatRelative, formatPlain, formatSince as formatAgo };
export default formatSince;`;
		expect(findLanguageReadingExports(source)).toEqual(["default", "formatAgo", "formatRelative"]);
	});

	it.each([
		[
			"an anonymous default function",
			"export default function (at: number) { return String(at) + activeLocale(); }",
			["default"],
		],
		["a default arrow function", "export default (at: number) => String(at) + activeLocale();", ["default"]],
		["an anonymous default class", "export default class { label() { return activeLocale(); } }", ["default"]],
		["an exported class", "export class Clock { label() { return activeLocale(); } }", ["Clock"]],
		[
			"a destructured export",
			"const helpers = { formatSince: () => activeLocale(), formatPlain: () => '' };\nexport const { formatSince, formatPlain } = helpers;",
			["formatPlain", "formatSince"],
		],
	])("finds a language reader exported as %s", (_name, exports, expected) => {
		const source = `import { i18n } from "@lingui/core";
function activeLocale() { return i18n.locale; }
${exports}`;
		expect(findLanguageReadingExports(source)).toEqual(expected);
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
		[
			"a component wrapped in a computed React member",
			{
				"components/sample.tsx": `import * as React from "react";
import { formatDateTime } from "@/lib/format";
export const Sample = React["memo"](function render({ at }: { at: number }) { return <p>{formatDateTime(at)}</p>; });`,
			},
			["components/sample.tsx:3 Sample formatDateTime"],
		],
		[
			"a lowercase function that opts in with a directive",
			{
				"components/sample.tsx": `import { formatTime } from "@/lib/format";
export function renderLabel(at: number) { "use memo"; return formatTime(at); }`,
			},
			["components/sample.tsx:2 renderLabel formatTime"],
		],
		[
			"an export star that a local declaration of the same name does not shadow",
			{
				"lib/when.ts": `import { formatDateTime } from "@/lib/format";
export const formatWhen = formatDateTime;`,
				"lib/labels.ts": `export * from "./when";
const formatWhen = (at: number) => String(at);
export function plain(at: number) { return formatWhen(at); }`,
				"components/sample.tsx": `import { formatWhen } from "@/lib/labels";
export function Sample({ at }: { at: number }) { return <p>{formatWhen(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatWhen"],
		],
		[
			"a call through a member chain at module scope",
			{
				"components/sample.tsx": `import { formatDateTime } from "@/lib/format";
const OPENED_AT = formatDateTime.call(null, Date.now());
export function Sample() { return <p>{OPENED_AT}</p>; }`,
			},
			["components/sample.tsx:2 <module> formatDateTime", "components/sample.tsx:3 Sample OPENED_AT"],
		],
		[
			"a namespace member destructured under a string key",
			{
				"components/sample.tsx": `import * as format from "@/lib/format";
const { "formatDateTime": when } = format;
export function Sample({ at }: { at: number }) { return <p>{when(at)}</p>; }`,
			},
			["components/sample.tsx:3 Sample when"],
		],
		[
			"a formatter as the default of a destructured module-level name",
			{
				"lib/labels.ts": `import { formatTime } from "@/lib/format";
export const { label = formatTime } = {} as { label?: (at: number) => string };`,
				"components/sample.tsx": `import { label } from "@/lib/labels";
export function Sample({ at }: { at: number }) { return <p>{label(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"a module-level class whose method formats",
			{
				"lib/clock.ts": `import { formatTime } from "@/lib/format";
export class Clock { text(at: number) { return formatTime(at); } }`,
				"components/sample.tsx": `import { Clock } from "@/lib/clock";
export function Sample({ at }: { at: number }) { return <p>{new Clock().text(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample Clock"],
		],
		[
			"a namespace member destructured with a formatter default and called with a locale",
			{
				"lib/unsafe.ts": `import { formatTime } from "@/lib/format";
export function when(at: number, _options?: { locale?: string }) { return formatTime(at); }`,
				"lib/alias.ts": `import * as labels from "./unsafe";
import { formatTime } from "@/lib/format";
export const { when = formatTime } = labels;`,
				"components/sample.tsx": `import { when } from "@/lib/alias";
export function Sample({ at, locale }: { at: number; locale: string }) { return <p>{when(at, { locale })}</p>; }`,
			},
			["components/sample.tsx:2 Sample when"],
		],
		[
			"a namespace destructured inside a component",
			{
				"components/sample.tsx": `import * as fmt from "@/lib/format";
export function Sample({ at }: { at: number }) { const { formatDateTime: when } = fmt; return <p>{when(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatDateTime"],
		],
		[
			"a module-level helper that destructures the namespace and calls the formatter",
			{
				"lib/when.ts": `import * as fmt from "@/lib/format";
export function when(at: number) { const { formatTime } = fmt; return formatTime(at); }`,
				"components/sample.tsx": `import { when } from "@/lib/when";
export function Sample({ at }: { at: number }) { return <p>{when(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample when"],
		],
		[
			"a namespace alias of a formatter destructured inside a component",
			{
				"lib/labels.ts": `import { formatTime } from "@/lib/format";
export const when = formatTime;`,
				"components/sample.tsx": `import * as labels from "@/lib/labels";
export function Sample({ at }: { at: number }) { const { when } = labels; return <p>{when(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample when"],
		],
		[
			"an indirect date helper destructured inside a component",
			{
				"lib/labels.ts": `import { formatTime } from "@/lib/format";
export function when(at: number) { return formatTime(at); }`,
				"components/sample.tsx": `import * as labels from "@/lib/labels";
export function Sample({ at }: { at: number }) { const { when } = labels; return <p>{when(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample when"],
		],
		[
			"a module-level helper that destructures an indirect date helper",
			{
				"lib/labels.ts": `import { formatTime } from "@/lib/format";
export function when(at: number) { return formatTime(at); }`,
				"lib/caption.ts": `import * as labels from "./labels";
export function caption(at: number) { const { when } = labels; return when(at); }`,
				"components/sample.tsx": `import { caption } from "@/lib/caption";
export function Sample({ at }: { at: number }) { return <p>{caption(at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample caption"],
		],
		[
			"a parenthesized or bracketed namespace member without a locale",
			{
				"components/sample.tsx": `import * as format from "@/lib/format";
export function Sample({ at }: { at: number }) { return <p>{(format).formatDateTime(at)}{format["formatTime"](at)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatDateTime", "components/sample.tsx:2 Sample formatTime"],
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
		[
			"a destructured parameter that shadows the namespace name",
			{
				"components/sample.tsx": `import * as fmt from "@/lib/format";
export function Sample({ at, fmt }: { at: number; fmt: { formatDateTime: (at: number) => string } }) {
	const { formatDateTime: when } = fmt;
	return <p>{when(at)}</p>;
}`,
			},
		],
		[
			"a destructured helper that passes on the locale it receives",
			{
				"lib/labels.ts": `import { formatTime } from "@/lib/format";
export function when(at: number, locale: string) { return formatTime(at, { locale }); }`,
				"components/sample.tsx": `import * as labels from "@/lib/labels";
export function Sample({ at, locale }: { at: number; locale: string }) {
	const { when } = labels;
	return <p>{when(at, locale)}</p>;
}`,
			},
		],
		[
			"a parenthesized or bracketed namespace member called with a locale",
			{
				"components/sample.tsx": `import * as format from "@/lib/format";
export function Sample({ at, locale }: { at: number; locale: string }) {
	return <p>{(format).formatDateTime(at, { locale })}{format["formatTime"](at, { locale })}</p>;
}`,
			},
		],
	])("allows %s", (_name, files) => {
		expect(findLanguageFormatViolations(withFormatStubs(files))).toEqual([]);
	});
});

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

function findLanguageFormatViolations(sources: Map<string, string>): string[] {
	const modules = describeModules(sources);

	const globalLocaleReaders = new Set([...LANGUAGE_FORMATTERS].map((name) => `${FORMAT_MODULE}#${name}`));
	const references = new Map<string, Set<string>>();
	for (const module of modules.values()) {
		if (module.path === FORMAT_MODULE) continue;
		for (const [name, nodes] of module.declarations) {
			if (nodes.some((node) => ts.isFunctionLike(node) && getComponentOrHookName(node, module.path) !== undefined)) {
				continue;
			}
			const keys = new Set(nodes.flatMap((node) => [...collectGlobalLocaleReferences(modules, module, node)]));
			const namespaceExport = module.namespaceSources.get(name);
			const exportKey = namespaceExport?.path
				? resolveExport(modules, namespaceExport.path, namespaceExport.name, new Set())
				: null;
			if (exportKey) keys.add(exportKey);
			references.set(`${module.path}#${name}`, keys);
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
			if (ts.isFunctionLike(node)) currentOwner = getComponentOrHookName(node, module.path) ?? owner;
			const reference = ts.isIdentifier(node) ? readsGlobalLocale(modules, module, node) : null;
			if (ts.isIdentifier(node) && reference && globalLocaleReaders.has(reference.key)) {
				const atImport = currentOwner === null && !isInsideFunction(node) && runsAtImport(node);
				if (currentOwner !== null || atImport) {
					violations.push(`${module.path}:${line(node)} ${currentOwner ?? "<module>"} ${reference.name}`);
				}
			}
			if (ts.isIdentifier(node) && currentOwner !== null) {
				for (const member of destructuredNamespaceExports(modules, module, node)) {
					if (globalLocaleReaders.has(member.key)) {
						violations.push(`${module.path}:${line(node)} ${currentOwner} ${member.name}`);
					}
				}
			}
			ts.forEachChild(node, (child) => visit(child, currentOwner));
		};
		visit(module.file, null);
	}
	return violations.sort();
}

// A reference that may read the global language: any reference to a module-level declaration that does,
// and any reference to a language formatter, directly or through module-level aliases, except the callee
// of a call that passes a `locale` option. A name that may also hold something else, such as one
// destructured from a namespace or with a default, is not an alias and counts even when called with a locale.
function readsGlobalLocale(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	node: ts.Identifier,
): { key: string; name: string } | null {
	if (!isValueReference(node) || isLocallyBound(node)) return null;
	const reference = resolveReference(modules, module, node);
	if (!reference || !namesLanguageFormatter(modules, reference.key)) return reference;
	const call = callOf(module, node);
	return call && passesLocale(call) ? null : reference;
}

function isLanguageFormatter(key: string): boolean {
	if (!key.startsWith(`${FORMAT_MODULE}#`)) return false;
	return LANGUAGE_FORMATTERS.has(key.slice(FORMAT_MODULE.length + 1));
}

// A language formatter, or a chain of module-level `const alias = name` declarations ending in one.
function namesLanguageFormatter(modules: Map<string, SourceModule>, key: string): boolean {
	const seen = new Set<string>();
	let current: string | null = key;
	while (current !== null && !seen.has(current)) {
		if (isLanguageFormatter(current)) return true;
		seen.add(current);
		const separator = current.lastIndexOf("#");
		const module = modules.get(current.slice(0, separator));
		const name = current.slice(separator + 1);
		const values = module?.declarations.get(name);
		const value = values?.length === 1 ? values[0] : undefined;
		if (!module || module.namespaceSources.has(name) || value === undefined || !isAliasInitializer(value, name)) {
			return false;
		}
		current = resolveExpressionKey(modules, module, value as ts.Expression);
	}
	return false;
}

// A namespace import destructured inside a function (`const { formatDateTime: when } = format`) takes each
// named export out as a value, like `const when = format.formatDateTime`, so each counts as a reference to
// that export: a formatter, an alias of one or a helper that reads the language is flagged even when every
// later call passes a locale. A destructuring at module scope is an import alias instead.
function destructuredNamespaceExports(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	identifier: ts.Identifier,
): { key: string; name: string }[] {
	const target = module.namespaces.get(identifier.text);
	if (!target || isLocallyBound(identifier)) return [];
	const value = outermostTransparentExpression(identifier);
	const declaration = value.parent;
	if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== value) return [];
	if (!ts.isObjectBindingPattern(declaration.name)) return [];
	const members: { key: string; name: string }[] = [];
	for (const element of declaration.name.elements) {
		const name = getDestructuredKey(element);
		const key = name === undefined ? null : resolveExport(modules, target, name, new Set());
		if (name !== undefined && key !== null) members.push({ key, name });
	}
	return members;
}

function isAliasInitializer(value: ts.Node, name: string): boolean {
	const declaration = value.parent;
	return (
		ts.isVariableDeclaration(declaration) &&
		declaration.initializer === value &&
		ts.isIdentifier(declaration.name) &&
		declaration.name.text === name
	);
}

// The call whose callee is this reference (the identifier, or the member a namespace import names),
// looking through parentheses and type assertions.
function callOf(module: SourceModule, identifier: ts.Identifier): ts.CallExpression | undefined {
	let callee: ts.Expression = outermostTransparentExpression(identifier);
	if (module.namespaces.has(identifier.text)) {
		const member = callee.parent;
		if (!(ts.isPropertyAccessExpression(member) || ts.isElementAccessExpression(member))) return undefined;
		if (member.expression !== callee) return undefined;
		callee = outermostTransparentExpression(member);
	}
	const call = callee.parent;
	return ts.isCallExpression(call) && call.expression === callee ? call : undefined;
}

function passesLocale(call: ts.CallExpression): boolean {
	const options = call.arguments[1];
	if (options === undefined) return false;
	const literal = skipTransparentExpressions(options);
	return ts.isObjectLiteralExpression(literal) && literal.properties.some(isLocaleProperty);
}

function isLocaleProperty(property: ts.ObjectLiteralElementLike): boolean {
	if (ts.isShorthandPropertyAssignment(property)) return property.name.text === "locale";
	return ts.isPropertyAssignment(property) && getStaticName(property.name) === "locale";
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
		if (ts.isIdentifier(node) && isInsideFunction(node)) {
			for (const member of destructuredNamespaceExports(modules, module, node)) keys.add(member.key);
		}
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
// own functions, classes and variables. Exports count whether they are written on the declaration
// (destructured or not), in an export list (renamed or not) or as the default export, named or anonymous.
// A name re-exported from another module is not followed. A new export that reads the interface language
// must join LANGUAGE_FORMATTERS.
function findLanguageReadingExports(text: string): string[] {
	const file = parseSource(text, FORMAT_MODULE);
	const linguiBindings = new Set<string>();
	const declarations = new Map<string, ts.Node>();
	const exported = new Map<string, string>();
	for (const statement of file.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			const bindings = statement.importClause?.namedBindings;
			if (statement.moduleSpecifier.text !== "@lingui/core" || !bindings || !ts.isNamedImports(bindings)) continue;
			for (const element of bindings.elements) {
				if ((element.propertyName ?? element.name).text === "i18n") linguiBindings.add(element.name.text);
			}
		} else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
			const localName = statement.name?.text ?? "default";
			declarations.set(localName, statement);
			if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) exported.set("default", localName);
			else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) exported.set(localName, localName);
		} else if (ts.isVariableStatement(statement)) {
			const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
			for (const declaration of statement.declarationList.declarations) {
				if (!declaration.initializer) continue;
				const bound: ts.Identifier[] = [];
				collectBindingIdentifiers(declaration.name, bound);
				for (const identifier of bound) {
					declarations.set(identifier.text, ts.isIdentifier(declaration.name) ? declaration.initializer : declaration);
					if (isExported) exported.set(identifier.text, identifier.text);
				}
			}
		} else if (
			ts.isExportDeclaration(statement) &&
			!statement.moduleSpecifier &&
			statement.exportClause &&
			ts.isNamedExports(statement.exportClause)
		) {
			for (const element of statement.exportClause.elements) {
				exported.set(element.name.text, (element.propertyName ?? element.name).text);
			}
		} else if (ts.isExportAssignment(statement)) {
			const expression = skipTransparentExpressions(statement.expression);
			if (ts.isIdentifier(expression)) {
				exported.set("default", expression.text);
			} else {
				declarations.set("default", expression);
				exported.set("default", "default");
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
	return [...exported]
		.filter(([, localName]) => languageReaders.has(localName))
		.map(([name]) => name)
		.sort();
}
