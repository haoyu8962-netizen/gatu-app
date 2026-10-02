import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	collectModuleReferences,
	describeModules,
	followAliases,
	isInsideFunction,
	isLocallyBound,
	isValueReference,
	readSourceTree,
	resolveBinding,
	resolveCallee,
	resolveExport,
	resolveReference,
	runsAtImport,
	type SourceModule,
} from "./harness/module-graph";
import {
	collectBindingIdentifiers,
	findDeclaringScope,
	getComponentOrHookName,
	outermostTransparentExpression,
	parseSource,
} from "./harness/react-source";

// React Compiler caches a call such as formatNumber(x) by its arguments only. The module-level
// formatters in lib/format.ts read the number-format setting from global state, so a cached result
// keeps the previous format after a switch even when its component re-renders. Components and hooks
// therefore take their formatters from useNumberFormat(), whose functions change identity with the
// setting, and pass them to any helper that formats during render (ADR 0036). Source-level rules,
// independent of whether the compiler currently compiles a given component. Names resolve lexically
// through imports, re-exports, destructuring, parentheses and type assertions; a formatter reached
// through import(), require(), a namespace object passed as a whole or a reassigned variable is out
// of reach, and a useNumberFormat() result counts as used when one of its references does something
// with it, without following where the value flows.
const SOURCE_ROOT = resolve(__dirname, "../..");
const FORMAT_MODULE = "lib/format.ts";
const GLOBAL_NUMBER_FORMAT_READERS = new Set([
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
			"a memoized component whose function has a lowercase name",
			{
				"components/sample.tsx": `import { memo } from "react";
import { formatUSD } from "@/lib/format";
export const Sample = memo(function render() { return <p>{formatUSD(1)}</p>; });`,
			},
			["components/sample.tsx:3 Sample formatUSD"],
		],
		[
			"a parenthesized anonymous default export",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export default (() => <p>{formatUSD(1)}</p>);`,
			},
			["components/sample.tsx:2 <default> formatUSD"],
		],
		[
			"a route component under a string key",
			{
				"routes/sample.tsx": `import { formatUSD } from "@/lib/format";
export const Route = createFileRoute("/sample")({ "component": () => <p>{formatUSD(1)}</p> });`,
			},
			["routes/sample.tsx:2 component formatUSD"],
		],
		[
			"a helper that destructures a formatter from a namespace import",
			{
				"lib/sample-label.ts": `import * as format from "@/lib/format";
const { formatUSD } = format;
export function label(value: number) { return formatUSD(value); }`,
				"components/sample.tsx": `import { label } from "@/lib/sample-label";
export function Sample() { return <p>{label(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"a module-level alias of a formatter",
			{
				"lib/fmt-alias.ts": `import { formatUSD } from "@/lib/format";
export const fmt = formatUSD;`,
				"components/sample.tsx": `import { fmt } from "@/lib/fmt-alias";
export function Sample() { return <p>{fmt(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample fmt"],
		],
		[
			"formatters whose only use is a shadowing parameter",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { const format = useNumberFormat(); function unrelated(format: string) { return format; } return <p>{unrelated("x")}</p>; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"formatters that are only voided",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { const numberFormat = useNumberFormat(); void numberFormat; return <p />; }`,
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
		[
			"a memoized default export whose function has a lowercase name",
			{
				"components/sample.tsx": `import { memo } from "react";
import { formatUSD } from "@/lib/format";
export default memo(function render() { return <p>{formatUSD(1)}</p>; });`,
			},
			["components/sample.tsx:3 <default> formatUSD"],
		],
		[
			"a memoized component held by a lowercase name",
			{
				"components/sample.tsx": `import { memo } from "react";
import { formatUSD } from "@/lib/format";
const sample = memo(() => <p>{formatUSD(1)}</p>);
export { sample as Sample };`,
			},
			["components/sample.tsx:3 sample formatUSD"],
		],
		[
			"nested component wrappers",
			{
				"components/sample.tsx": `import { forwardRef, memo } from "react";
import { formatUSD } from "@/lib/format";
export const Sample = memo(forwardRef(function render() { return <p>{formatUSD(1)}</p>; }));`,
			},
			["components/sample.tsx:3 Sample formatUSD"],
		],
		[
			"a hook behind an angle-bracket type assertion",
			{
				"hooks/use-sample.ts": `import { formatUSD } from "@/lib/format";
export const useSample = <() => string>(() => formatUSD(1));`,
			},
			["hooks/use-sample.ts:2 useSample formatUSD"],
		],
		[
			"a component held by an object key",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export const cells = { Price: () => <p>{formatUSD(1)}</p> };`,
			},
			["components/sample.tsx:2 Price formatUSD"],
		],
		[
			"a route component written as a method",
			{
				"routes/sample.tsx": `import { formatUSD } from "@/lib/format";
export const Route = createFileRoute("/sample")({ component() { return <p>{formatUSD(1)}</p>; } });`,
			},
			["routes/sample.tsx:2 component formatUSD"],
		],
		[
			"a route component function with a lowercase name",
			{
				"routes/sample.tsx": `import { formatUSD } from "@/lib/format";
export const Route = createFileRoute("/sample")({ component: function render() { return <p>{formatUSD(1)}</p>; } });`,
			},
			["routes/sample.tsx:2 component formatUSD"],
		],
		[
			"formatters asserted to their type and never used",
			{
				"components/sample.tsx": `import { type NumberFormatters, useNumberFormat } from "@/lib/format";
export function Sample() { const numberFormat = useNumberFormat() as NumberFormatters; return <p />; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"formatters asserted with angle brackets and never used",
			{
				"hooks/use-sample.ts": `import { type NumberFormatters, useNumberFormat } from "@/lib/format";
export function useSample() { const numberFormat = <NumberFormatters>useNumberFormat(); return "label"; }`,
			},
			["hooks/use-sample.ts:2 useSample useNumberFormat() result unused"],
		],
		[
			"formatters only voided inside parentheses",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { const numberFormat = useNumberFormat(); void (numberFormat); return <p />; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"formatters only named in a parenthesized statement or a comma operand",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { const numberFormat = useNumberFormat(); (numberFormat); const label = (numberFormat, "x"); return <p>{label}</p>; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"a parenthesized subscription call whose result is dropped",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { (useNumberFormat)(); return <p />; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"formatters destructured into an empty pattern",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { const {} = useNumberFormat(); return <p />; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"parenthesized and asserted formatters called at import",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
const ZERO = (formatUSD)(0);
const ONE = (formatUSD as typeof formatUSD)(1);
export function Sample() { return <p />; }`,
			},
			["components/sample.tsx:2 <module> formatUSD", "components/sample.tsx:3 <module> formatUSD"],
		],
		[
			"a formatter handed to a call at import",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
const LABELS = [0, 1].map(formatUSD);
export function Sample() { return <p />; }`,
			},
			["components/sample.tsx:2 <module> formatUSD"],
		],
		[
			"namespace formatters read through brackets or parentheses",
			{
				"components/sample.tsx": `import * as format from "@/lib/format";
export function Sample() { return <p>{format["formatUSD"](1)}{(format).formatPrice(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatPrice", "components/sample.tsx:2 Sample formatUSD"],
		],
		[
			"a helper that falls back to a formatter as a destructuring default",
			{
				"lib/labels.ts": `import { formatUSD } from "@/lib/format";
const overrides: { usd?: typeof formatUSD } = {};
export const { usd: priceLabel = formatUSD } = overrides;`,
				"components/sample.tsx": `import { priceLabel } from "@/lib/labels";
export function Sample({ value }: { value: number }) { return <p>{priceLabel(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample priceLabel"],
		],
		[
			"a module-level class whose method formats",
			{
				"lib/price-label.ts": `import { formatUSD } from "@/lib/format";
export class PriceLabel { constructor(private readonly value: number) {} text() { return formatUSD(this.value); } }`,
				"components/sample.tsx": `import { PriceLabel } from "@/lib/price-label";
export function Sample({ value }: { value: number }) { return <p>{new PriceLabel(value).text()}</p>; }`,
			},
			["components/sample.tsx:2 Sample PriceLabel"],
		],
		[
			"a function in any argument of a component wrapper",
			{
				"components/sample.tsx": `import { memo } from "react";
import { formatUSD } from "@/lib/format";
export const Sample = memo(Row, function compare() { return formatUSD(1) === ""; });`,
			},
			["components/sample.tsx:3 Sample formatUSD"],
		],
		[
			"a route component method under a string key",
			{
				"routes/sample.tsx": `import { formatUSD } from "@/lib/format";
export const Route = createFileRoute("/sample")({ "component"() { return <p>{formatUSD(1)}</p>; } });`,
			},
			["routes/sample.tsx:2 component formatUSD"],
		],
		[
			"a function that opts in to compilation with a directive",
			{
				"lib/sample-label.ts": `import { formatUSD } from "@/lib/format";
export function label(value: number) { "use memo"; return formatUSD(value); }`,
			},
			["lib/sample-label.ts:2 label formatUSD"],
		],
		[
			"a component held by a class property",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export class Registry { Price = () => <p>{formatUSD(1)}</p>; }`,
			},
			["components/sample.tsx:2 Price formatUSD"],
		],
		[
			"a component received as a destructuring assignment default",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export let Price: unknown;
({ Price = () => <p>{formatUSD(1)}</p> } = {});`,
			},
			["components/sample.tsx:3 Price formatUSD"],
		],
		[
			"a component wrapped through a computed React member",
			{
				"components/sample.tsx": `import React from "react";
import { formatUSD } from "@/lib/format";
const memo = "memo";
export default React[memo](function render() { return <p>{formatUSD(1)}</p>; });`,
			},
			["components/sample.tsx:4 <default> formatUSD"],
		],
		[
			"formatters destructured from a namespace under string keys",
			{
				"lib/sample-label.ts": `import * as format from "@/lib/format";
const { "formatUSD": usd, ["formatPrice"]: price } = format;
export function label(value: number) { return \`\${usd(value)} \${price(value)}\`; }`,
				"components/sample.tsx": `import { label } from "@/lib/sample-label";
export function Sample() { return <p>{label(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"a namespace member that falls back to a formatter as a destructuring default",
			{
				"lib/overrides.ts": "export const formatAmount: ((value: number) => string) | undefined = undefined;",
				"lib/amount.ts": `import * as overrides from "@/lib/overrides";
import { formatUSD } from "@/lib/format";
export const { formatAmount = formatUSD } = overrides;`,
				"components/sample.tsx": `import { formatAmount } from "@/lib/amount";
export function Sample({ value }: { value: number }) { return <p>{formatAmount(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatAmount"],
		],
		[
			"a namespace member destructured and exported to another module",
			{
				"lib/amount.ts": `import * as format from "@/lib/format";
export const { formatUSD: usd } = format;`,
				"components/sample.tsx": `import { usd } from "@/lib/amount";
export function Sample({ value }: { value: number }) { return <p>{usd(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample usd"],
		],
		[
			"a formatter reached through a nested namespace pattern",
			{
				"lib/fmt.ts": `import { formatUSD } from "@/lib/format";
export const table = { usd: formatUSD };`,
				"lib/sample-label.ts": `import * as fmt from "@/lib/fmt";
const { table: { usd } } = fmt;
export function label(value: number) { return usd(value); }`,
				"components/sample.tsx": `import { label } from "@/lib/sample-label";
export function Sample() { return <p>{label(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"a formatter reached through the rest of a namespace",
			{
				"lib/sample-label.ts": `import * as format from "@/lib/format";
const { useNumberFormat: _hook, ...rest } = format;
export function label(value: number) { return rest.formatUSD(value); }`,
				"components/sample.tsx": `import { label } from "@/lib/sample-label";
export function Sample() { return <p>{label(1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"a bound formatter called at import",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
const LABEL = formatUSD.bind(null)(1);
export function Sample() { return <p />; }`,
			},
			["components/sample.tsx:2 <module> formatUSD"],
		],
		[
			"a name exported through export * over an internal import of the same name",
			{
				"lib/safe.ts": "export function label(value: number) { return String(value); }",
				"lib/unsafe.ts": `export { formatUSD as label } from "@/lib/format";`,
				"lib/amount.ts": `import { label } from "@/lib/safe";
export * from "@/lib/unsafe";
export const local = label;`,
				"components/sample.tsx": `import { label } from "@/lib/amount";
export function Sample({ value }: { value: number }) { return <p>{label(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
		],
		[
			"namespace members called through call or bind at import",
			{
				"components/sample.tsx": `import * as fmt from "@/lib/format";
const A = fmt.formatUSD.call(null, 1);
const B = fmt.formatUSD.bind(null)(2);
export function Sample() { return <p />; }`,
			},
			["components/sample.tsx:2 <module> formatUSD", "components/sample.tsx:3 <module> formatUSD"],
		],
		[
			"a namespace member under an asserted string key",
			{
				"components/sample.tsx": `import * as fmt from "@/lib/format";
export function Sample() { return <p>{fmt["formatUSD" as const](1)}</p>; }`,
			},
			["components/sample.tsx:2 Sample formatUSD"],
		],
		[
			"formatters whose only use is a dropped member read",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { const numberFormat = useNumberFormat(); void numberFormat.formatUSD; return <p />; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"an alias of the subscription imported from another module and called bare",
			{
				"lib/alias.ts": `import { useNumberFormat } from "@/lib/format";
export const useFormat = useNumberFormat;`,
				"components/sample.tsx": `import { useFormat } from "@/lib/alias";
export function Sample() { useFormat(); return <p />; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"a member of the subscription read and dropped",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample() { void useNumberFormat().formatUSD; return <p />; }`,
			},
			["components/sample.tsx:2 Sample useNumberFormat() result unused"],
		],
		[
			"a module-level alias of the subscription called bare",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
const useFormat = useNumberFormat;
export function Sample() { useFormat(); return <p />; }`,
			},
			["components/sample.tsx:3 Sample useNumberFormat() result unused"],
		],
		[
			"a name exported through export * over an unexported local declaration",
			{
				"lib/other.ts": `export { formatUSD as label } from "@/lib/format";`,
				"lib/amount.ts": `function label(value: number) { return String(value); }
export * from "@/lib/other";
export const local = label;`,
				"components/sample.tsx": `import { label } from "@/lib/amount";
export function Sample({ value }: { value: number }) { return <p>{label(value)}</p>; }`,
			},
			["components/sample.tsx:2 Sample label"],
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
			"a module-level alias that only non-React code calls",
			{
				"lib/sample-csv.ts": `import { formatUSD } from "@/lib/format";
const fmt = formatUSD;
export function csvCell(value: number) { return fmt(value); }`,
			},
		],
		[
			"module-level formatters in code no component or hook calls",
			{
				"lib/sample-export.ts": `import { formatToken } from "@/lib/format";
export function buildCsvCell(value: string) { return formatToken(value); }`,
			},
		],
		[
			"formatters declared in a switch clause or a for initializer and used there",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
export function Sample({ kind }: { kind: number }) {
	switch (kind) {
		case 1:
			const numberFormat = useNumberFormat();
			return <p>{numberFormat.formatUSD(1)}</p>;
	}
	for (let formatters = useNumberFormat(); ; ) return <p>{formatters.formatUSD(2)}</p>;
}`,
			},
		],
		[
			"a formatter bound at import that only non-React code calls",
			{
				"lib/sample-csv.ts": `import { formatUSD } from "@/lib/format";
const usd = formatUSD.bind(null);
export function csvCell(value: number) { return usd(value); }`,
			},
		],
		[
			"a formatter bound through a string key at import that only non-React code calls",
			{
				"lib/sample-csv.ts": `import { formatUSD } from "@/lib/format";
const usd = formatUSD["bind"](null);
export function csvCell(value: number) { return usd(value); }`,
			},
		],
		[
			"an internal import shadowed by a safe name exported through export *",
			{
				"lib/safe.ts": "export function label(value: number) { return String(value); }",
				"lib/unsafe.ts": `export { formatUSD as label } from "@/lib/format";`,
				"lib/amount.ts": `import { label } from "@/lib/unsafe";
export * from "@/lib/safe";
export function csvCell(value: number) { return label(value); }`,
				"components/sample.tsx": `import { label } from "@/lib/amount";
export function Sample({ value }: { value: number }) { return <p>{label(value)}</p>; }`,
			},
		],
		[
			"an unexported local declaration hidden by a safe name exported through export *",
			{
				"lib/safe.ts": "export function label(value: number) { return String(value); }",
				"lib/amount.ts": `import { formatUSD } from "@/lib/format";
function label(value: number) { return formatUSD(value); }
export * from "@/lib/safe";
export function csvCell(value: number) { return label(value); }`,
				"components/sample.tsx": `import { label } from "@/lib/amount";
export function Sample({ value }: { value: number }) { return <p>{label(value)}</p>; }`,
			},
		],
		[
			"a member of the subscription function rather than the subscription",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
const describe = useNumberFormat.toString;
export function Sample() { describe(); return <p />; }`,
			},
		],
		[
			"a class expression named like a formatter",
			{
				"components/sample.tsx": `import { formatUSD } from "@/lib/format";
export function exportCell(value: number) { return formatUSD(value); }
export function Sample() { const Cell = class formatUSD { static make() { return new formatUSD(); } }; return <p>{String(Cell.make())}</p>; }`,
			},
		],
		[
			"a module-level table of formatters that only non-React code calls",
			{
				"lib/sample-csv.ts": `import { formatToken, formatUSD } from "@/lib/format";
const CELL_FORMATTERS = { token: formatToken, usd: formatUSD };
export function csvCell(kind: "token" | "usd", value: number) { return CELL_FORMATTERS[kind](value); }`,
			},
		],
	])("allows %s", (_name, files) => {
		expect(findNumberFormatViolations(withFormatStubs(files))).toEqual([]);
	});
});

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

function findNumberFormatViolations(sources: Map<string, string>): string[] {
	const modules = describeModules(sources);

	const formatting = new Set([
		...[...GLOBAL_NUMBER_FORMAT_READERS].map((name) => `${FORMAT_MODULE}#${name}`),
		...[...REACTIVITY_READERS].map((name) => `${REACTIVITY_MODULE}#${name}`),
	]);
	const references = new Map<string, Set<string>>();
	for (const module of modules.values()) {
		if (module.path === FORMAT_MODULE || module.path === REACTIVITY_MODULE) continue;
		for (const [name, nodes] of module.declarations) {
			if (nodes.some((node) => ts.isFunctionLike(node) && getComponentOrHookName(node, module.path) !== undefined)) {
				continue;
			}
			const keys = new Set(nodes.flatMap((node) => [...collectModuleReferences(modules, module, node)]));
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
				const name = getComponentOrHookName(node, module.path);
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
				const atImport = currentOwner === null && !isInsideFunction(node) && runsAtImport(node);
				if (reference && formatting.has(reference.key) && (currentOwner !== null || atImport)) {
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
		if (key && (formatting.has(key) || followAliases(modules, key) === NUMBER_FORMAT_HOOK)) return true;
	}
	return false;
}

// A result counts as used when a reference that resolves to its own binding does something with it;
// discarding it (`void result`, a bare `result;` statement, the left operand of a comma) does not.
function numberFormatResultIsUsed(call: ts.CallExpression, scope: ts.Node): boolean {
	const value = outermostTransparentExpression(call);
	const declaration = value.parent;
	if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== value) {
		return !isDiscarded(climbMemberReads(call));
	}
	const bindings: ts.Identifier[] = [];
	collectBindingIdentifiers(declaration.name, bindings);
	if (bindings.length === 0) return false;
	const declaringScope = findDeclaringScope(bindings[0]);
	const names = new Set(bindings.map((binding) => binding.text));
	let used = false;
	const visit = (node: ts.Node) => {
		if (used) return;
		if (
			ts.isIdentifier(node) &&
			names.has(node.text) &&
			isValueReference(node) &&
			!isDiscarded(climbMemberReads(node)) &&
			findDeclaringScope(node) === declaringScope
		) {
			used = true;
		}
		ts.forEachChild(node, visit);
	};
	visit(scope);
	return used;
}

// `result.formatUSD` read and dropped is as unused as `result` itself; calling it is a use.
function climbMemberReads(expression: ts.Expression): ts.Expression {
	let value: ts.Expression = outermostTransparentExpression(expression);
	while (
		(ts.isPropertyAccessExpression(value.parent) || ts.isElementAccessExpression(value.parent)) &&
		value.parent.expression === value
	) {
		value = outermostTransparentExpression(value.parent);
	}
	return value;
}

function isDiscarded(expression: ts.Expression): boolean {
	const value = outermostTransparentExpression(expression);
	const parent = value.parent;
	if (ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) return true;
	return (
		ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.CommaToken && parent.left === value
	);
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
		if (isFunctionLikeDeclaration(node) && getComponentOrHookName(node, file.fileName) === name) match = node;
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
