import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { skipTransparentExpressions } from "./harness/react-source";

// A string from toFixed or toPrecision always has a "." decimal point and no grouping, so text built from it
// ignores the number-format setting. Display code passes such a string to formatDecimalString, which keeps the
// caller's digits and writes the active separators (docs/number-format-setting.md rule 10). Every other call is
// registered below by file with its use and exact count, so a new call has to be classified before it lands.
// Source-level rule: a registered helper whose result is displayed elsewhere is not followed; its use says
// where the display formats it.
const SOURCE_ROOT = resolve(__dirname, "../..");
const FORMAT_MODULE = "lib/format.ts";
const FIXED_POINT_METHODS = new Set(["toFixed", "toPrecision"]);
const DECIMAL_STRING_FORMATTER = "formatDecimalString";
const HAND_WRITTEN_GROUPING = /(?:\\d|\[0-9\])\{3\}\)\+/g;

interface Registration {
	count: number;
	use: string;
}

const REGISTERED_FIXED_POINT_CALLS: Readonly<Record<string, Registration>> = {
	"components/funds-action/funds-amount.ts": {
		count: 5,
		use: "atomic and decimal amounts of the signed Vault transfer and its marker; the recovery host and operation references show the decimal amount through formatDecimalString; two helpers have no production caller",
	},
	"components/leaderboard/leaderboard-fixture.tsx": {
		count: 8,
		use: "development-only fixture rows, rendered through formatUSD and formatPercent",
	},
	"components/portfolio/portfolio-performance-chart.tsx": {
		count: 1,
		use: "axis tick values rounded before formatUSD",
	},
	"components/staking/domain/staking.ts": {
		count: 2,
		use: "normalized protocol decimals and the submitted HYPE amount, shown through formatStakingAmount",
	},
	"components/trade/positions/position-tpsl-modal.tsx": {
		count: 6,
		use: "TP/SL price and size input prefills, also sent in the trigger orders",
	},
	"components/trade/tradebox/bridge/amount-entry-screen.tsx": {
		count: 2,
		use: "USD amount input values for the percentage and Max shortcuts",
	},
	"components/trade/tradebox/trade-form-tp-sl.tsx": {
		count: 1,
		use: "TP/SL return input value",
	},
	"components/ui/number-input.tsx": {
		count: 1,
		use: "arrow-key stepping writes the input value",
	},
	"components/vaults/domain/vaults.ts": {
		count: 1,
		use: "max withdrawable quantized to micro-USDC before comparisons and formatVaultUsd",
	},
	"components/vaults/vault-action-domain.ts": {
		count: 1,
		use: "atomic amount for the preflight balance comparison",
	},
	"domain/earn.ts": {
		count: 13,
		use: "normalized reserve and account decimals, protocol amounts and Max values; displays use lib/format formatters",
	},
	"domain/market/calculations.ts": {
		count: 4,
		use: "funding projections and market cap rounded before formatPercent and formatQuoteAmount",
	},
	"domain/market/funding-comparison.ts": {
		count: 5,
		use: "period rates, spreads and open interest rounded for sorting, formatPercent and formatUSD",
	},
	"domain/market/funding-rate-history.ts": {
		count: 4,
		use: "rates and extrema rounded before formatPercent and the chart model",
	},
	"domain/trade/funds-execution-guard.ts": {
		count: 1,
		use: "total debit for the fresh-balance guard",
	},
	"domain/trade/isolated-margin.ts": {
		count: 1,
		use: "leverage sent with the isolated margin top-up",
	},
	"domain/trade/order-execution-summary.ts": {
		count: 3,
		use: "exchange fill sizes and average price kept with the notification; sizes are shown through formatDecimalString, the price through formatPrice or formatToken",
	},
	"domain/trade/order/liquidation.ts": {
		count: 1,
		use: "maximum position notional shown through formatUSD",
	},
	"domain/trade/order/reduce-only.ts": {
		count: 1,
		use: "maximum reducible size for the order guard",
	},
	"domain/trade/order/size.ts": {
		count: 11,
		use: "order size protocol strings and size input values",
	},
	"domain/trade/orders.ts": {
		count: 2,
		use: "protocol price and size strings; the TWAP activation hint and the Mid labels show prices through formatDecimalString",
	},
	"domain/trade/position-market-close.ts": {
		count: 1,
		use: "close percentage for comparisons; the slider text shows it through formatDecimalString",
	},
	"domain/trade/position-toolbar.ts": {
		count: 1,
		use: "funding sign flip before formatUSD",
	},
	"domain/trade/position-tpsl-size.ts": {
		count: 1,
		use: "TP/SL size input value",
	},
	"domain/trade/trading-toolbar-metrics.ts": {
		count: 3,
		use: "PnL, funding and size totals shown through formatUSD and formatToken",
	},
	"lib/bridge/format.ts": {
		count: 1,
		use: "LI.FI quote request amount",
	},
	"lib/chart/funding-history-chart-model.ts": {
		count: 2,
		use: "chart tick values before formatPercent",
	},
	"lib/lifi/use-quote.ts": {
		count: 1,
		use: "LI.FI smallest-unit amount",
	},
	"lib/trade/cctp-deposit.ts": {
		count: 2,
		use: "CCTP fee and allowance integers",
	},
	"lib/trade/leverage-position-limit-presentation.ts": {
		count: 1,
		use: "truncated notional before formatUSD and formatQuoteAmount",
	},
	"lib/trade/numbers.ts": {
		count: 3,
		use: "shared fixed-point, floor and plain-notation helpers for input values and protocol strings; displays pass their result to formatDecimalString",
	},
	"lib/trade/order-notification-copy.ts": {
		count: 1,
		use: "average price rounded to eight significant digits before formatPrice or formatToken",
	},
	"lib/trade/orderbook.ts": {
		count: 1,
		use: "price-grouping label kept as a plain decimal; both order books show it through formatDecimalString",
	},
	"lib/trade/position-close-sizing-presentation.ts": {
		count: 1,
		use: "close percentage input value",
	},
	"lib/trade/referral.ts": {
		count: 1,
		use: "progress percentage for a CSS width and aria-valuenow",
	},
	"lib/trade/tpsl.ts": {
		count: 5,
		use: "TP/SL target prices for the inputs and trigger orders",
	},
	"lib/trade/withdrawal.ts": {
		count: 3,
		use: "withdrawal minimum, maximum and net amounts for validation and the Max input; displays use formatDecimalString or formatNumber",
	},
};

describe("decimal display contract", () => {
	it("passes every display string built with toFixed or toPrecision to formatDecimalString", () => {
		expect(findFixedPointViolations(readSourceTree(SOURCE_ROOT), REGISTERED_FIXED_POINT_CALLS)).toEqual([]);
	}, 30_000);

	it("keeps thousands grouping inside lib/format.ts", () => {
		expect(findHandWrittenGrouping(readSourceTree(SOURCE_ROOT))).toEqual([]);
	}, 30_000);
});

describe("decimal display contract checker", () => {
	it.each([
		[
			"an unregistered display string",
			{ "lib/label.ts": `export function label(v: Big) { return \`\${v.toFixed(2)}%\`; }` },
			{},
			["lib/label.ts:1 toFixed is not passed to formatDecimalString and the file is not registered"],
		],
		[
			"toPrecision as well",
			{ "lib/label.ts": "export function label(v: Big) { return v.toPrecision(5); }" },
			{},
			["lib/label.ts:1 toPrecision is not passed to formatDecimalString and the file is not registered"],
		],
		[
			"a call in a callback inside the formatter argument",
			{
				"lib/label.ts":
					"export function label(n: NumberFormatters, vs: Big[]) { return n.formatDecimalString(vs.map((v) => v.toFixed(2)).join()); }",
			},
			{},
			["lib/label.ts:1 toFixed is not passed to formatDecimalString and the file is not registered"],
		],
		[
			"a call passed as a later argument",
			{ "lib/label.ts": "export function label(v: Big) { return formatDecimalString(value, v.toFixed(2)); }" },
			{},
			["lib/label.ts:1 toFixed is not passed to formatDecimalString and the file is not registered"],
		],
		[
			"a parenthesized, bracketed or borrowed method",
			{
				"lib/label.ts": [
					"export const a = (v: Big) => (v.toFixed)(2);",
					'export const b = (v: Big) => v["toFixed"](2);',
					"export const c = (v: Big) => v.toFixed.call(v, 2);",
					'export const d = (v: Big) => (v as Big)["toPrecision"].apply(v, [3]);',
				].join("\n"),
			},
			{},
			[
				"lib/label.ts:1 toFixed is not passed to formatDecimalString and the file is not registered",
				"lib/label.ts:2 toFixed is not passed to formatDecimalString and the file is not registered",
				"lib/label.ts:3 toFixed is not passed to formatDecimalString and the file is not registered",
				"lib/label.ts:4 toPrecision is not passed to formatDecimalString and the file is not registered",
			],
		],
		[
			"a registered file whose count changed",
			{ "lib/size.ts": "export const a = (v: Big) => v.toFixed(2);\nexport const b = (v: Big) => v.toFixed(3);" },
			{ "lib/size.ts": { count: 1, use: "input values" } },
			["lib/size.ts registers 1 call (input values) but has 2: lines 1, 2"],
		],
		[
			"a registration whose calls are gone",
			{ "lib/size.ts": "export const a = (n: NumberFormatters, v: Big) => n.formatDecimalString(v.toFixed(2));" },
			{ "lib/size.ts": { count: 1, use: "input values" } },
			["lib/size.ts registers 1 call (input values) but has 0: lines none"],
		],
	])("reports %s", (_name, files, registry, expected) => {
		expect(findFixedPointViolations(new Map(Object.entries(files)), registry)).toEqual(expected);
	});

	it.each([
		["a call passed to formatDecimalString", "export const a = (v: Big) => formatDecimalString(v.toFixed(2));"],
		[
			"a call inside a template passed to the formatter object",
			`export const a = (n: NumberFormatters, v: Big) => n.formatDecimalString(\`-\${v.abs().toFixed(2)}\`, { trimTrailingZeros: true });`,
		],
		[
			"a call passed to a parenthesized or bracketed formatter",
			'export const a = (n: NumberFormatters, v: Big) => (n.formatDecimalString)(v.toFixed(2)) + n["formatDecimalString"](v.toFixed(3));',
		],
		["calls in lib/format.ts", ""],
	])("allows %s", (_name, source) => {
		const files = new Map([
			["lib/label.ts", source],
			[FORMAT_MODULE, "export function bps(v: number) { return v.toFixed(2); }"],
		]);
		expect(findFixedPointViolations(files, {})).toEqual([]);
	});

	it("reports thousands grouping written outside lib/format.ts", () => {
		const files = new Map([
			["lib/label.ts", 'export const group = (s: string) => s.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");'],
			["lib/other.ts", 'export const group = (s: string) => s.replace(/\\B(?=(?:[0-9]{3})+(?![0-9]))/g, ".");'],
			[FORMAT_MODULE, "const pattern = /\\B(?=(\\d{3})+(?!\\d))/g;"],
		]);
		expect(findHandWrittenGrouping(files)).toEqual([
			"lib/label.ts:1 groups thousands by hand",
			"lib/other.ts:1 groups thousands by hand",
		]);
	});
});

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

function findFixedPointViolations(
	sources: Map<string, string>,
	registry: Readonly<Record<string, Registration>>,
): string[] {
	const violations: string[] = [];
	const unwrappedByFile = new Map<string, { method: string; line: number }[]>();
	for (const [path, text] of sources) {
		if (path === FORMAT_MODULE) continue;
		const file = ts.createSourceFile(
			path,
			text,
			ts.ScriptTarget.Latest,
			true,
			path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		);
		const calls: { method: string; line: number }[] = [];
		const visit = (node: ts.Node) => {
			const method = ts.isCallExpression(node) ? getFixedPointMethod(node) : undefined;
			if (method !== undefined && !isInsideDecimalStringArgument(node)) {
				calls.push({ method, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
			}
			ts.forEachChild(node, visit);
		};
		visit(file);
		unwrappedByFile.set(path, calls);
	}

	for (const [path, calls] of unwrappedByFile) {
		if (calls.length === 0 || registry[path]) continue;
		for (const call of calls) {
			violations.push(
				`${path}:${call.line} ${call.method} is not passed to ${DECIMAL_STRING_FORMATTER} and the file is not registered`,
			);
		}
	}
	for (const [path, registration] of Object.entries(registry)) {
		const calls = unwrappedByFile.get(path) ?? [];
		if (calls.length === registration.count) continue;
		const lines = calls.length > 0 ? calls.map((call) => call.line).join(", ") : "none";
		const noun = registration.count === 1 ? "call" : "calls";
		violations.push(
			`${path} registers ${registration.count} ${noun} (${registration.use}) but has ${calls.length}: lines ${lines}`,
		);
	}
	return violations;
}

function isInsideDecimalStringArgument(node: ts.Node): boolean {
	let child = node;
	let parent = node.parent;
	while (parent && !ts.isFunctionLike(parent)) {
		if (
			ts.isCallExpression(parent) &&
			parent.arguments[0] === child &&
			getCalleeName(parent) === DECIMAL_STRING_FORMATTER
		) {
			return true;
		}
		child = parent;
		parent = parent.parent;
	}
	return false;
}

// The fixed-point method a call runs: `v.toFixed(2)`, `(v.toFixed)(2)`, `v["toFixed"](2)`, and the same method
// through `.call` or `.apply`. A method stored in a variable or passed elsewhere is not followed.
function getFixedPointMethod(call: ts.CallExpression): string | undefined {
	let callee = skipTransparentExpressions(call.expression);
	let name = getMemberName(callee);
	if ((name === "call" || name === "apply") && !ts.isIdentifier(callee)) {
		callee = skipTransparentExpressions(
			(callee as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression,
		);
		name = getMemberName(callee);
	}
	return name !== undefined && FIXED_POINT_METHODS.has(name) ? name : undefined;
}

function getMemberName(expression: ts.Expression): string | undefined {
	if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
	if (!ts.isElementAccessExpression(expression)) return undefined;
	const key = skipTransparentExpressions(expression.argumentExpression);
	return ts.isStringLiteralLike(key) ? key.text : undefined;
}

// `formatDecimalString(…)`, `n.formatDecimalString(…)`, `(n.formatDecimalString)(…)` and
// `n["formatDecimalString"](…)` all name the formatter.
function getCalleeName(call: ts.CallExpression): string | null {
	const callee = skipTransparentExpressions(call.expression);
	if (ts.isIdentifier(callee)) return callee.text;
	return getMemberName(callee) ?? null;
}

function findHandWrittenGrouping(sources: Map<string, string>): string[] {
	const violations: string[] = [];
	for (const [path, text] of sources) {
		if (path === FORMAT_MODULE) continue;
		for (const match of text.matchAll(HAND_WRITTEN_GROUPING)) {
			violations.push(`${path}:${text.slice(0, match.index).split("\n").length} groups thousands by hand`);
		}
	}
	return violations;
}
