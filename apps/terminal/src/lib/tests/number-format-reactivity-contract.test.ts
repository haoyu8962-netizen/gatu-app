import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	collectBindingIdentifiers,
	findDeclaringScope,
	getComponentOrHookName,
	getStaticName,
	hasModifier,
	outermostTransparentExpression,
	parseSource,
	skipTransparentExpressions,
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
			"a module-level alias of the subscription called bare",
			{
				"components/sample.tsx": `import { useNumberFormat } from "@/lib/format";
const useFormat = useNumberFormat;
export function Sample() { useFormat(); return <p />; }`,
			},
			["components/sample.tsx:3 Sample useNumberFormat() result unused"],
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
	// The nodes a module-level name takes its value from: an initializer, plus the defaults on its
	// destructuring path, or the function or class declaration itself.
	declarations: Map<string, ts.Node[]>;
	// A name destructured from a namespace with a default or through a nested pattern takes its value
	// from the namespace export or from the defaults on its path.
	namespaceSources: Map<string, ModuleBinding>;
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
				const atImport = currentOwner === null && !isInsideFunction(node) && formatsAtImport(node);
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
		namespaceSources: new Map(),
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
			const expression = skipTransparentExpressions(statement.expression);
			if (ts.isIdentifier(expression)) module.localExports.set("default", expression.text);
			else module.declarations.set("default", [expression]);
		} else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
			const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
			if (statement.name) {
				module.declarations.set(statement.name.text, [statement]);
				if (isDefault) module.localExports.set("default", statement.name.text);
			} else if (isDefault) {
				module.declarations.set("default", [statement]);
			}
		} else if (ts.isVariableStatement(statement)) {
			const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
			for (const declaration of statement.declarationList.declarations) {
				if (declaration.initializer) describeVariable(module, declaration.name, declaration.initializer, exported);
			}
		}
	}
	return module;
}

// A destructured namespace import is an alias of the namespace's export; any other destructured or
// assigned name is a declaration whose value is the initializer or a default on its path.
function describeVariable(
	module: SourceModule,
	name: ts.BindingName,
	initializer: ts.Expression,
	exported: boolean,
): void {
	if (ts.isIdentifier(name)) {
		module.declarations.set(name.text, [initializer]);
		return;
	}
	const source = skipTransparentExpressions(initializer);
	const namespaceTarget = ts.isIdentifier(source) ? module.namespaces.get(source.text) : undefined;
	for (const element of name.elements) {
		if (ts.isOmittedExpression(element)) continue;
		if (namespaceTarget === undefined || !ts.isObjectBindingPattern(name)) {
			describeBindingElement(module, element, [initializer]);
		} else if (element.dotDotDotToken && ts.isIdentifier(element.name)) {
			module.namespaces.set(element.name.text, namespaceTarget);
		} else {
			describeNamespaceElement(module, element, namespaceTarget, [initializer], exported);
		}
	}
}

// A plain destructured namespace member is an alias of the export. With a default, or through a
// nested pattern, each bound name takes the export (or the member of it) or a default on its path.
function describeNamespaceElement(
	module: SourceModule,
	element: ts.BindingElement,
	namespaceTarget: string | null,
	values: ts.Node[],
	exported: boolean,
): void {
	const exportName = getDestructuredKey(element);
	if (exportName === undefined) {
		describeBindingElement(module, element, values);
		return;
	}
	const binding = { path: namespaceTarget, name: exportName };
	if (ts.isIdentifier(element.name) && !element.initializer) {
		module.imports.set(element.name.text, binding);
		if (exported) module.localExports.set(element.name.text, element.name.text);
		return;
	}
	const bound: ts.Identifier[] = [];
	collectBindingIdentifiers(element.name, bound);
	for (const identifier of bound) {
		module.declarations.set(identifier.text, collectPathDefaults(element, identifier));
		module.namespaceSources.set(identifier.text, binding);
	}
}

function collectPathDefaults(element: ts.BindingElement, identifier: ts.Identifier): ts.Node[] {
	const defaults: ts.Node[] = [];
	for (let node: ts.Node = identifier; node !== element.parent; node = node.parent) {
		if (ts.isBindingElement(node) && node.initializer) defaults.push(node.initializer);
	}
	return defaults;
}

function getDestructuredKey(element: ts.BindingElement): string | undefined {
	if (element.propertyName) return getStaticName(element.propertyName);
	return ts.isIdentifier(element.name) ? element.name.text : undefined;
}

function describeBindingElement(module: SourceModule, element: ts.BindingElement, values: ts.Node[]): void {
	const elementValues = element.initializer ? [...values, element.initializer] : values;
	if (ts.isIdentifier(element.name)) {
		module.declarations.set(element.name.text, elementValues);
		return;
	}
	for (const child of element.name.elements) {
		if (!ts.isOmittedExpression(child)) describeBindingElement(module, child, elementValues);
	}
}

// At module scope a formatter that is called, or handed to a call, formats once at import; one that
// is only stored, as an alias, a bound copy or in a table, is checked where it is called.
function formatsAtImport(identifier: ts.Identifier): boolean {
	let value: ts.Expression = outermostTransparentExpression(identifier);
	for (;;) {
		const member = value.parent;
		if (
			!(ts.isPropertyAccessExpression(member) || ts.isElementAccessExpression(member)) ||
			member.expression !== value
		) {
			break;
		}
		value = outermostTransparentExpression(member);
		if (getMemberName(member) === "bind") {
			const bindCall = value.parent;
			if (!ts.isCallExpression(bindCall) || bindCall.expression !== value) return false;
			value = outermostTransparentExpression(bindCall);
		}
	}
	const parent = value.parent;
	if (ts.isCallExpression(parent)) return parent.expression === value || parent.arguments.includes(value);
	if (ts.isNewExpression(parent)) return parent.expression === value || (parent.arguments?.includes(value) ?? false);
	return ts.isTaggedTemplateExpression(parent) && parent.tag === value;
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
	if (module.namespaces.has(identifier.text)) {
		const target = module.namespaces.get(identifier.text);
		const member = getNamespaceMember(identifier);
		if (!target || member === undefined) return null;
		const key = resolveExport(modules, target, member, new Set());
		return key ? { key, name: member } : null;
	}
	const key = resolveBinding(modules, module.path, identifier.text, new Set());
	return key ? { key, name: identifier.text } : null;
}

// `format.formatUSD`, `(format).formatUSD` and `format["formatUSD"]` name one export of a namespace.
function getNamespaceMember(identifier: ts.Identifier): string | undefined {
	const value = outermostTransparentExpression(identifier);
	const parent = value.parent;
	if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === value) {
		return getMemberName(parent);
	}
	return undefined;
}

function getMemberName(member: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | undefined {
	if (ts.isPropertyAccessExpression(member)) return member.name.text;
	const key = skipTransparentExpressions(member.argumentExpression);
	return ts.isStringLiteralLike(key) ? key.text : undefined;
}

function resolveCallee(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	call: ts.CallExpression,
): string | null {
	return followAliases(modules, resolveExpressionKey(modules, module, call.expression));
}

// The module-level key an expression names: an unshadowed identifier or a member of a namespace.
function resolveExpressionKey(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	expression: ts.Expression,
): string | null {
	const target = skipTransparentExpressions(expression);
	if (ts.isIdentifier(target)) {
		return isLocallyBound(target) ? null : (resolveReference(modules, module, target)?.key ?? null);
	}
	if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
		const object = skipTransparentExpressions(target.expression);
		if (ts.isIdentifier(object) && !isLocallyBound(object)) {
			return resolveReference(modules, module, object)?.key ?? null;
		}
	}
	return null;
}

// A module-level `const useFmt = useNumberFormat` is the hook under another name.
function followAliases(modules: Map<string, SourceModule>, key: string | null): string | null {
	const seen = new Set<string>();
	let current = key;
	while (current !== null && !seen.has(current)) {
		seen.add(current);
		const separator = current.lastIndexOf("#");
		const module = modules.get(current.slice(0, separator));
		const values = module?.declarations.get(current.slice(separator + 1));
		const value = values?.length === 1 ? values[0] : undefined;
		if (!module || value === undefined || ts.isFunctionDeclaration(value) || ts.isClassDeclaration(value)) {
			return current;
		}
		const next = resolveExpressionKey(modules, module, value as ts.Expression);
		if (next === null) return current;
		current = next;
	}
	return current;
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

// A result counts as used when a reference that resolves to its own binding does something with it;
// discarding it (`void result`, a bare `result;` statement, the left operand of a comma) does not.
function numberFormatResultIsUsed(call: ts.CallExpression, scope: ts.Node): boolean {
	const value = outermostTransparentExpression(call);
	const declaration = value.parent;
	if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== value) return !isDiscarded(value);
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
function climbMemberReads(identifier: ts.Identifier): ts.Expression {
	let value: ts.Expression = outermostTransparentExpression(identifier);
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

function isValueReference(identifier: ts.Identifier): boolean {
	const parent = identifier.parent;
	if (ts.isPropertyAccessExpression(parent)) return parent.expression === identifier;
	if (ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent)) return false;
	if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.initializer === identifier;
	if (ts.isBindingElement(parent)) return parent.initializer === identifier;
	if (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) return parent.initializer === identifier;
	if (
		ts.isFunctionDeclaration(parent) ||
		ts.isFunctionExpression(parent) ||
		ts.isClassDeclaration(parent) ||
		ts.isClassExpression(parent)
	) {
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
	return !ts.isSourceFile(findDeclaringScope(identifier));
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
