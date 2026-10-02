import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	calleeName,
	findDeclaringScope,
	getComponentOrHookName,
	getStaticName,
	isWithin,
	outermostTransparentExpression,
	parseSource,
	skipTransparentExpressions,
} from "./harness/react-source";

const SOURCE_ROOT = resolve(__dirname, "../..");
const SHORT_CIRCUIT_OPERATORS = new Set([
	ts.SyntaxKind.AmpersandAmpersandToken,
	ts.SyntaxKind.BarBarToken,
	ts.SyntaxKind.QuestionQuestionToken,
	ts.SyntaxKind.AmpersandAmpersandEqualsToken,
	ts.SyntaxKind.BarBarEqualsToken,
	ts.SyntaxKind.QuestionQuestionEqualsToken,
]);
const DEFERRED_OPTION_KEYS = new Set(["mutationFn", "queryFn"]);
const EFFECT_HOOKS = new Set(["useEffect", "useInsertionEffect", "useLayoutEffect"]);

const REACTIVE_COMPONENTS = [
	"components/funding-comparison/funding-comparison-view.tsx",
	"components/pages/application-error-page.tsx",
	"components/pages/not-found-page.tsx",
	"components/trade/chart/chart-panel.tsx",
	"components/trade/chart/funding-history-chart.tsx",
	"components/trade/chart/funding-history-load-boundary.tsx",
	"components/trade/chart/funding-history-panel.tsx",
	"components/trade/header/desktop-utilities-menu.tsx",
	"components/trade/chart/token-selector.tsx",
	"components/trade/header/top-nav.tsx",
	"components/trade/header/language-switcher.tsx",
	"components/trade/header/user-menu.tsx",
	"components/trade/header/theme-toggle.tsx",
	"components/trade/chart/token-selector-content.tsx",
	"components/trade/chart/tradingview-chart.tsx",
	"components/trade/components/market-asset-info.tsx",
	"components/trade/components/mobile-agent-qr-scanner.tsx",
	"components/trade/components/mobile-agent-sync-modal.tsx",
	"components/trade/components/spot-swap-modal.tsx",
	"components/trade/components/trading-action-button.tsx",
	"components/trade/footer/footer-bar.tsx",
	"components/trade/header/favorites-strip.tsx",
	"components/trade/header/theme-toggle.tsx",
	"components/trade/market-overview.tsx",
	"components/trade/mobile/mobile-header.tsx",
	"components/trade/mobile/mobile-market-bar.tsx",
	"components/trade/mobile/offline-banner.tsx",
	"components/trade/mobile/mobile-account-view.tsx",
	"components/trade/mobile/mobile-book-view.tsx",
	"components/trade/mobile/mobile-funding-tab.tsx",
	"components/trade/mobile/mobile-history-tab.tsx",
	"components/trade/mobile/mobile-nav-drawer.tsx",
	"components/trade/mobile/mobile-orders-history-tab.tsx",
	"components/trade/mobile/mobile-orders-tab.tsx",
	"components/trade/mobile/mobile-position-card.tsx",
	"components/trade/mobile/mobile-positions-tab.tsx",
	"components/trade/mobile/mobile-trade-layout.tsx",
	"components/trade/mobile/mobile-trade-view.tsx",
	"components/trade/mobile/mobile-twap-fill-history-list.tsx",
	"components/trade/mobile/mobile-twap-tab.tsx",
	"components/trade/orderbook/orderbook-row.tsx",
	"components/trade/positions/balances-tab.tsx",
	"components/trade/positions/funding-tab.tsx",
	"components/trade/positions/history-tab.tsx",
	"components/trade/positions/orders-history-tab.tsx",
	"components/trade/positions/orders-tab.tsx",
	"components/trade/positions/position-close-sizing-controls.tsx",
	"components/trade/positions/position-inline-actions.tsx",
	"components/trade/positions/position-isolated-margin-modal.tsx",
	"components/trade/positions/position-market-close-modal.tsx",
	"components/trade/positions/position-pnl-share-modal.tsx",
	"components/trade/positions/position-row.tsx",
	"components/trade/positions/position-tpsl-modal.tsx",
	"components/trade/positions/positions-tab.tsx",
	"components/trade/positions/send-modal.tsx",
	"components/trade/positions/transfer-modal.tsx",
	"components/trade/positions/twap-fill-history-table.tsx",
	"components/trade/positions/twap-tab.tsx",
	"components/trade/testnet-banner.tsx",
	"components/trade/tradebox/account-panel.tsx",
	"components/trade/tradebox/deposit-modal.tsx",
	"components/trade/tradebox/deposit/amount-input.tsx",
	"components/trade/tradebox/deposit/deposit-form.tsx",
	"components/trade/tradebox/deposit/funding-address-card.tsx",
	"components/trade/tradebox/deposit/withdraw-form.tsx",
	"components/trade/tradebox/embedded-deposit-auto-bridge.tsx",
	"components/trade/tradebox/leverage-editor.tsx",
	"components/trade/tradebox/leverage-modal.tsx",
	"components/trade/tradebox/leverage-position-limit-row.tsx",
	"components/trade/tradebox/leverage-slider.tsx",
	"components/trade/tradebox/margin-mode-modal.tsx",
	"components/trade/tradebox/order-toast.tsx",
	"components/trade/tradebox/price-input-with-percent.tsx",
	"components/trade/tradebox/tp-sl-section.tsx",
	"components/trade/tradebox/trade-form-scale.tsx",
	"components/trade/tradebox/trade-form-tif.tsx",
	"components/trade/tradebox/trade-form-twap.tsx",
	"components/trade/tradebox/trade-header.tsx",
	"components/trade/tradebox/trade-form-fields.tsx",
	"components/trade/tradebox/trade-form-tif.tsx",
	"hooks/trade/use-account-overview-labels.ts",
	"hooks/trade/use-funds-action-availability.ts",
	"hooks/trade/use-order-entry-data.ts",
	"hooks/trade/use-order-display-labels.ts",
	"hooks/trade/use-position-close-all-submit.ts",
	"hooks/trade/use-position-limit-close-submit.ts",
	"hooks/trade/use-position-market-close-submit.ts",
	"hooks/trade/use-position-reverse-submit.ts",
	"hooks/trade/use-twap-fill-history-csv.ts",
];

describe("live localization source contract", () => {
	it("keeps the Chinese terminal labels in the production catalog", () => {
		const catalog = readFileSync(resolve(__dirname, "../../locales/zh/messages.po"), "utf8");
		for (const [source, translated] of [
			["Post Only", "只挂单"],
			["Connect your wallet to view positions.", "连接钱包查看仓位。"],
			["Switch to dark mode", "切换到深色模式"],
			["Switch to light mode", "切换到浅色模式"],
		]) {
			expect(catalog).toContain(`msgid ${JSON.stringify(source)}\nmsgstr ${JSON.stringify(translated)}`);
		}
	});

	it.each(REACTIVE_COMPONENTS)("translates %s during render", (relativePath) => {
		const source = readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

		expect(nonDescriptorCoreMacroImports(source)).toEqual([]);
		expect(source).not.toContain("UI_TEXT");
		expect(source).toContain("@lingui/react/macro");
	});
});

// Core msg/defineMessage retain semantics for later translation. Core t/plural/select
// eagerly produce strings and must not replace a locale-subscribed render translator.
function nonDescriptorCoreMacroImports(source: string): string[] {
	const file = ts.createSourceFile("presentation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const violations: string[] = [];
	for (const statement of file.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			statement.moduleSpecifier.text !== "@lingui/core/macro"
		)
			continue;
		const clause = statement.importClause;
		if (clause?.isTypeOnly) continue;
		if (!clause) {
			violations.push("side-effect");
			continue;
		}
		if (clause.name) violations.push("default");
		const bindings = clause.namedBindings;
		if (!bindings) continue;
		if (ts.isNamespaceImport(bindings)) {
			violations.push("namespace");
			continue;
		}
		for (const binding of bindings.elements) {
			if (binding.isTypeOnly) continue;
			const imported = (binding.propertyName ?? binding.name).text;
			if (imported !== "msg" && imported !== "defineMessage") violations.push(imported);
		}
	}
	return violations;
}

describe("lazy descriptor imports in reactive presentation", () => {
	it.each([
		'import { msg } from "@lingui/core/macro";',
		'import { msg as describeMessage, defineMessage } from "@lingui/core/macro";',
	])("allows locale-independent descriptors: %s", (coreImport) => {
		expect(nonDescriptorCoreMacroImports(coreImport)).toEqual([]);
	});

	it.each([
		['import { t } from "@lingui/core/macro";', "t"],
		['import { t as translate } from "@lingui/core/macro";', "t"],
		['import { msg, t } from "@lingui/core/macro";', "t"],
		['import { plural } from "@lingui/core/macro";', "plural"],
		['import * as core from "@lingui/core/macro";', "namespace"],
		['import core from "@lingui/core/macro";', "default"],
	])("rejects imperative core imports even alongside a React locale subscription: %s", (coreImport, violation) => {
		const source = `${coreImport}
import { useLingui } from "@lingui/react/macro";
function View() { const { t } = useLingui(); return t({ id: "label" }); }`;
		expect(nonDescriptorCoreMacroImports(source)).toEqual([violation]);
	});
});

const PURE_PRESENTATION_VIEWS = [
	"../dashboard/dashboard-frame-view.tsx",
	"mobile/mobile-token-selector-view.tsx",
	"mobile/mobile-positions-tabs-view.tsx",
	"mobile/mobile-trade-available-view.tsx",
	"mobile/mobile-trade-summary-view.tsx",
	"mobile/mobile-trade-size-view.tsx",
	"mobile/mobile-terminal-frame-view.tsx",
	"mobile/mobile-trade-frame-view.tsx",
	"mobile/mobile-header-view.tsx",
	"mobile/mobile-wallet-cta-view.tsx",
	"mobile/mobile-market-bar-view.tsx",
	"mobile/mobile-trade-header-view.tsx",
	"mobile/mobile-bottom-nav-view.tsx",
	"mobile/mobile-book-chrome-view.tsx",
	"mobile/mobile-trade-cta-frame-view.tsx",

	"positions/account-table-header-view.tsx",
	"tradebox/account-overview-view.tsx",
	"tradebox/account-action-button-view.tsx",
	"tradebox/account-panel-frame-view.tsx",
	"components/trade-slider-view.tsx",
	"tradebox/trade-input-frame-view.tsx",
	"tradebox/trade-available-row-view.tsx",
	"tradebox/trade-panel-body-view.tsx",
	"tradebox/trade-control-button-view.tsx",
	"tradebox/trade-percent-frame-view.tsx",
	"tradebox/trade-header-view.tsx",
	"tradebox/trade-size-unit-view.tsx",
	"tradebox/trade-option-checkboxes-view.tsx",
	"tradebox/trade-panel-footer-view.tsx",
	"tradebox/trade-size-slider-row-view.tsx",
	"tradebox/trade-cta-view.tsx",
	"tradebox/order-type-tab-view.tsx",
	"tradebox/trade-form-fields-view.tsx",
	"components/summary-row-view.tsx",
	"header/favorites-strip-view.tsx",
	"header/top-nav-view.tsx",
	"header/nav-menu-trigger-view.tsx",
	"header/header-icon-button-view.tsx",
	"header/wallet-cta-view.tsx",
	"footer/footer-bar-view.tsx",
	"layout/desktop-terminal-frame-view.tsx",
	"chart/token-selector-trigger-view.tsx",
	"components/asset-icon-slot-view.tsx",
	"market-overview-view.tsx",
	"layout/market-header-view.tsx",
	"orderbook/orderbook-panel-view.tsx",
	"orderbook/orderbook-grouping-trigger-view.tsx",
];

it.each(PURE_PRESENTATION_VIEWS)("receives translated presentation props in %s", (path) => {
	const source = readFileSync(resolve(__dirname, "../../components/trade", path), "utf8");
	expect(source).toContain("interface Props");
	expect(source).not.toMatch(/@lingui|use[A-Z]\w*\(|@\/stores|window|document|Date\.|Math\.random/);
});

// React Compiler records `i18n.locale` as a memo dependency only when the memoized computation
// reads it unconditionally. A read that only happens in a branch or inside a function called during
// render is recorded as the `i18n` object, which stays the same Lingui instance across a language
// switch, and dependency-array entries that the useMemo or useCallback callback never reads are
// dropped. Effects, lazy state initializers, JSX event handlers and options passed to other hooks run
// outside the cached render output and may read the live locale.
describe("dependencies React Compiler can see", () => {
	it("reads i18n.locale unconditionally during render in every component and hook", () => {
		const violations = listSourceFiles(SOURCE_ROOT).flatMap((filePath) => {
			const source = readFileSync(filePath, "utf8");
			if (!source.includes("locale")) return [];
			return findBranchOnlyLocaleReads(source, filePath).map((line) => `${relative(SOURCE_ROOT, filePath)}:${line}`);
		});

		expect(violations).toEqual([]);
	});

	it("lists only values the callback reads in useMemo and useCallback dependencies", () => {
		const violations = listSourceFiles(SOURCE_ROOT).flatMap((filePath) => {
			const source = readFileSync(filePath, "utf8");
			if (!source.includes("useMemo") && !source.includes("useCallback")) return [];
			return findUnreadMemoDependencies(source, filePath).map(
				(violation) => `${relative(SOURCE_ROOT, filePath)}:${violation}`,
			);
		});

		expect(violations).toEqual([]);
	});

	it.each([
		["a conditional expression branch", "return at === null ? null : format(at, { locale: i18n.locale });"],
		["the right side of &&", "return <span>{at !== null && format(at, { locale: i18n.locale })}</span>;"],
		["the right side of ??", "return <span>{groups[0]?.[0] ?? i18n.locale}</span>;"],
		["a JSX branch", "return <p>{at === null ? <b /> : <i>{format(at, { locale: i18n.locale })}</i>}</p>;"],
		["an optional call", "return formatter?.format(at, { locale: i18n.locale });"],
		[
			"a render-time map callback",
			"return <div>{groups.map((group) => <p key={group[0]}>{formatList(group, { locale: i18n.locale })}</p>)}</div>;",
		],
		[
			"a named render helper",
			"function renderGroup(group: string[]) { return <p>{formatList(group, { locale: i18n.locale })}</p>; } return <div>{groups.map(renderGroup)}</div>;",
		],
		["an Array.from callback", "return Array.from(groups, (group) => formatList(group, { locale: i18n.locale }));"],
		[
			"a callback called through an element key named like a hook",
			'const useEffect = "map"; return <div>{groups[useEffect]((group) => formatList(group, { locale: i18n.locale }))}</div>;',
		],
		[
			"a useCallback callback",
			"const label = useCallback(() => format(at, { locale: i18n.locale }), [at, i18n.locale]); return label();",
		],
		["an if statement", 'let label = ""; if (at !== null) label = format(at, { locale: i18n.locale }); return label;'],
		[
			"a loop body",
			"const labels: string[] = []; for (const group of groups) labels.push(formatList(group, { locale: i18n.locale })); return labels;",
		],
		[
			"a callback given to a custom hook that may run it during render",
			"return useLabels({ render: () => format(at, { locale: i18n.locale }) });",
		],
		["a read through a type assertion", "return at === null ? null : format(at, { locale: (i18n as I18n).locale });"],
		["a read through a string key", 'return at === null ? null : format(at, { locale: i18n["locale"] });'],
		["a logical assignment", 'let label = ""; label ||= format(at, { locale: i18n.locale }); return label;'],
		["a destructuring default", "const { label = format(at, { locale: i18n.locale }) } = options; return label;"],
		[
			"a branch inside useMemo",
			"return useMemo(() => (at === null ? null : format(at, { locale: i18n.locale })), [at]);",
		],
	])("flags a locale read in %s", (_, body) => {
		expect(findBranchOnlyLocaleReads(sampleComponent(body))).toHaveLength(1);
	});

	it.each([
		[
			"a local read before the branch",
			"const locale = i18n.locale; return at === null ? null : format(at, { locale });",
		],
		["the condition of a conditional expression", 'return isRtlLocale(i18n.locale) ? "rtl" : "ltr";'],
		[
			"the iterable of a for-of loop",
			"const labels: string[] = []; for (const group of sortGroups(groups, i18n.locale)) labels.push(group[0]); return labels;",
		],
		[
			"an effect",
			"useEffect(() => { if (at !== null) document.title = format(at, { locale: i18n.locale }); }, [at, i18n.locale]); return null;",
		],
		[
			"a callback inside an effect",
			"useEffect(() => { const timer = setTimeout(() => send(i18n.locale), 0); return () => clearTimeout(timer); }, [i18n.locale]); return null;",
		],
		[
			"an event handler",
			'return <button type="button" onClick={() => at !== null && send(format(at, { locale: i18n.locale }))} />;',
		],
		["a lazy state initializer", "const [initial] = useState(() => i18n.locale); return initial;"],
		["a query function", "useQuery({ queryKey: [i18n.locale], queryFn: () => load(i18n.locale) }); return null;"],
		["a mutation callback", "useMutation({ mutationFn: send, onSuccess: () => notify(i18n.locale) }); return null;"],
		["a parenthesized effect callback", "useEffect((() => { send(i18n.locale); }), [i18n.locale]); return null;"],
	])("allows a locale read in %s", (_, body) => {
		expect(findBranchOnlyLocaleReads(sampleComponent(body))).toEqual([]);
	});

	const BRANCHED_READ =
		"const { i18n } = useLingui(); return at === null ? null : format(at, { locale: i18n.locale });";

	it.each([
		[
			"a memoized component whose function has a lowercase name",
			`const Sample = memo(function render({ at }: Props) { ${BRANCHED_READ} });`,
		],
		[
			"a memoized default export whose function has a lowercase name",
			`export default memo(function render({ at }: Props) { ${BRANCHED_READ} });`,
		],
		["an anonymous default-exported component", `export default function ({ at }: Props) { ${BRANCHED_READ} }`],
		["an anonymous default-exported arrow component", `export default ({ at }: Props) => { ${BRANCHED_READ} };`],
		[
			"a route component",
			`export const Route = createFileRoute("/sample")({ component: function render() { ${BRANCHED_READ} } });`,
		],
		["a component held by an object key", `export const cells = { Time: ({ at }: Props) => { ${BRANCHED_READ} } };`],
		[
			"a route component method under a string key",
			`export const Route = createFileRoute("/sample")({ "component"() { ${BRANCHED_READ} } });`,
		],
		[
			"a function that opts in to compilation with a directive",
			`function label({ at }: Props) { "use memo"; ${BRANCHED_READ} }`,
		],
		[
			"a renamed useLingui binding",
			"function Sample({ at }: Props) { const { i18n: lingui } = useLingui(); return at === null ? null : format(at, { locale: lingui.locale }); }",
		],
		[
			"a component wrapped through a computed React member",
			`const memo = "memo"; export const row = React[memo](function render({ at }: Props) { ${BRANCHED_READ} });`,
		],
	])("flags a branch-only locale read in %s", (_, declaration) => {
		expect(findBranchOnlyLocaleReads(`import { useLingui } from "@lingui/react/macro";\n${declaration}`)).toHaveLength(
			1,
		);
	});

	it("follows React hooks imported under another name", () => {
		const source = `import { useMemo as memoize } from "react";
import { useLingui } from "@lingui/react/macro";
function Sample({ at }: Props) { const { i18n } = useLingui(); return memoize(() => format(at), [at, i18n.locale]); }`;
		expect(findUnreadMemoDependencies(source).map((violation) => violation.split(" ").slice(1).join(" "))).toEqual([
			"useMemo i18n.locale",
		]);
	});

	it("allows a branch-only locale read in a helper that is neither named nor wrapped as a component", () => {
		const source =
			"function label(at: number | null, i18n: I18n) { return at === null ? null : format(at, { locale: i18n.locale }); }";
		expect(findBranchOnlyLocaleReads(source)).toEqual([]);
	});

	it.each([
		["a dependency the callback never reads", "return useMemo(() => format(at), [at, i18n.locale]);", ["i18n.locale"]],
		[
			"a dependency named only as an object key or a property",
			"return useMemo(() => format(at, { locale: options.locale }), [at, locale, options.locale]);",
			["locale"],
		],
		[
			"a dependency of a generic useMemo",
			"return useMemo<string>(() => format(at), [at, numberFormatRevision]);",
			["numberFormatRevision"],
		],
		[
			"no dependency when the callback reads every entry",
			"const locale = i18n.locale; return useMemo(() => format(at, { locale }), [at, locale]);",
			[],
		],
		["no dependency for a property of a read object", "return useMemo(() => groups.map(String), [groups.length]);", []],
		[
			"a dependency of a parenthesized and asserted callback",
			"return useMemo((() => format(at)) as () => string, [at, i18n.locale]);",
			["i18n.locale"],
		],
		[
			"a dependency of a callback declared by name",
			"const compute = () => format(at); return useMemo(compute, [at, i18n.locale]);",
			["i18n.locale"],
		],
		[
			"a dependency named only in a type",
			"const locale = i18n.locale; return useMemo(() => { type Locale = typeof locale; return format(at) as Locale; }, [at, locale]);",
			["locale"],
		],
		[
			"an i18n dependency when the callback reads only the i18n object",
			"return useMemo(() => formatAll(at, i18n), [at, i18n.locale]);",
			["i18n.locale"],
		],
		[
			"an i18n dependency when the callback reads another i18n property",
			"return useMemo(() => format(at, i18n.messages), [at, i18n.locale]);",
			["i18n.locale"],
		],
		[
			"no dependency when the callback reads the i18n path itself",
			"return useMemo(() => format(at, { locale: i18n.locale }), [at, i18n.locale]);",
			[],
		],
		[
			"a dependency that only a shadowing callback parameter reads",
			"const locale = i18n.locale; return useMemo(() => groups.map((locale) => locale[0]), [groups, locale]);",
			["locale"],
		],
		[
			"a dependency that only a shadowing local reads",
			'const locale = i18n.locale; return useMemo(() => { const locale = "en"; return format(at, { locale }); }, [at, locale]);',
			["locale"],
		],
		[
			"a property dependency read only through a shadowing parameter",
			"return useMemo(() => groups.map((i18n) => i18n.locale), [groups, i18n.locale]);",
			["i18n.locale"],
		],
		[
			"no dependency when a destructuring default reads it",
			"const locale = i18n.locale; return useMemo(() => { const { label = locale } = options; return label; }, [options, locale]);",
			[],
		],
		[
			"no dependency when a computed destructuring key reads it",
			"const locale = i18n.locale; return useMemo(() => { const { [locale]: label } = labels; return label; }, [labels, locale]);",
			[],
		],
		[
			"a dependency named only as an object method",
			'const locale = i18n.locale; return useMemo(() => ({ locale() { return "en"; } }), [locale]);',
			["locale"],
		],
		[
			"no dependency for a call through an element key named like useMemo",
			'const locale = i18n.locale; const useMemo = "map"; return groups[useMemo]((group) => group[0], [groups, locale]);',
			[],
		],
		[
			"no dependency when a nested callback reads the outer binding",
			"const locale = i18n.locale; return useMemo(() => groups.map((group) => formatList(group, { locale })), [groups, locale]);",
			[],
		],
	])("reports %s", (_, body, expected) => {
		expect(findUnreadMemoDependencies(sampleComponent(body)).map((violation) => violation.split(" ").at(-1))).toEqual(
			expected,
		);
	});
});

function sampleComponent(body: string): string {
	return `import { useLingui } from "@lingui/react/macro";
function Sample({ at, groups }: { at: number | null; groups: string[][] }) {
	const { i18n } = useLingui();
	${body}
}`;
}

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			return ["__tests__", "locales", "tests"].includes(entry.name) ? [] : listSourceFiles(entryPath);
		}
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$|\.gen\.ts$/.test(entry.name) ? [entryPath] : [];
	});
}

interface FileContext {
	fileName: string;
	// Names bound to Lingui's i18n object: `i18n` and the aliases in `const { i18n: alias } = useLingui()`.
	i18nNames: ReadonlySet<string>;
	// Names bound to the whole `useLingui()` result, read as `lingui.i18n`.
	linguiNames: ReadonlySet<string>;
	// React hooks imported under another name.
	hookAliases: ReadonlyMap<string, string>;
}

function describeFile(file: ts.SourceFile, fileName: string): FileContext {
	const i18nNames = new Set(["i18n"]);
	const linguiNames = new Set<string>();
	const hookAliases = new Map<string, string>();
	const visit = (node: ts.Node) => {
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "react"
		) {
			const bindings = node.importClause?.namedBindings;
			if (bindings && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					if (element.propertyName) hookAliases.set(element.name.text, element.propertyName.text);
				}
			}
		}
		if (ts.isVariableDeclaration(node) && node.initializer) {
			const source = skipTransparentExpressions(node.initializer);
			if (ts.isCallExpression(source) && calleeName(source) === "useLingui") {
				if (ts.isIdentifier(node.name)) linguiNames.add(node.name.text);
				else if (ts.isObjectBindingPattern(node.name)) {
					for (const element of node.name.elements) {
						const key = element.propertyName ? getStaticName(element.propertyName) : undefined;
						if (key === "i18n" && ts.isIdentifier(element.name)) i18nNames.add(element.name.text);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return { fileName, i18nNames, linguiNames, hookAliases };
}

function resolveHookName(call: ts.CallExpression, context: FileContext): string | undefined {
	const name = calleeName(call);
	return name === undefined ? undefined : (context.hookAliases.get(name) ?? name);
}

function findBranchOnlyLocaleReads(source: string, fileName = "sample.tsx"): number[] {
	const file = parseSource(source, fileName);
	const context = describeFile(file, fileName);
	const lines: number[] = [];
	const visit = (node: ts.Node) => {
		if (isLocaleRead(node, context) && isBranchOnlyRenderRead(node, context)) {
			lines.push(file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return lines;
}

// `i18n.locale`, `i18n["locale"]` and `(i18n as I18n).locale` on Lingui's i18n object, whatever the
// local name of that object.
function isLocaleRead(node: ts.Node, context: FileContext): boolean {
	let object: ts.Expression;
	if (ts.isPropertyAccessExpression(node) && node.name.text === "locale") object = node.expression;
	else if (ts.isElementAccessExpression(node) && getLiteralKey(node) === "locale") object = node.expression;
	else return false;
	return isLinguiI18n(skipTransparentExpressions(object), context);
}

function isLinguiI18n(expression: ts.Expression, context: FileContext): boolean {
	if (ts.isIdentifier(expression)) return context.i18nNames.has(expression.text);
	if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== "i18n") return false;
	const owner = skipTransparentExpressions(expression.expression);
	if (ts.isIdentifier(owner)) return context.linguiNames.has(owner.text);
	return ts.isCallExpression(owner) && calleeName(owner) === "useLingui";
}

function getLiteralKey(node: ts.ElementAccessExpression): string | undefined {
	const key = skipTransparentExpressions(node.argumentExpression);
	return ts.isStringLiteralLike(key) ? key.text : undefined;
}

function isBranchOnlyRenderRead(read: ts.Node, context: FileContext): boolean {
	let branched = false;
	let child = read;
	for (let parent = read.parent; parent; child = parent, parent = parent.parent) {
		if (ts.isFunctionLike(parent)) {
			if (getComponentOrHookName(parent, context.fileName) !== undefined) return branched;
			if (isDeferredCallback(parent, context)) return false;
			if (!isHookCallback(parent, "useMemo", context)) branched = true;
			continue;
		}
		if (isBranch(parent, child)) branched = true;
	}
	return false;
}

function isBranch(parent: ts.Node, child: ts.Node): boolean {
	if (ts.isConditionalExpression(parent)) return child !== parent.condition;
	if (ts.isBinaryExpression(parent)) {
		return SHORT_CIRCUIT_OPERATORS.has(parent.operatorToken.kind) && child === parent.right;
	}
	if (ts.isCallExpression(parent) || ts.isElementAccessExpression(parent)) {
		return ts.isOptionalChain(parent) && child !== parent.expression;
	}
	if (ts.isBindingElement(parent) || ts.isParameter(parent)) return child === parent.initializer;
	if (ts.isShorthandPropertyAssignment(parent)) return child === parent.objectAssignmentInitializer;
	if (ts.isIfStatement(parent)) return child !== parent.expression;
	if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) return child === parent.statement;
	if (ts.isForStatement(parent)) return child !== parent.initializer;
	return (
		ts.isWhileStatement(parent) ||
		ts.isDoStatement(parent) ||
		ts.isCaseClause(parent) ||
		ts.isDefaultClause(parent) ||
		ts.isCatchClause(parent)
	);
}

function isDeferredCallback(fn: ts.SignatureDeclaration, context: FileContext): boolean {
	if (ts.isMethodDeclaration(fn)) {
		return ts.isObjectLiteralExpression(fn.parent) && isDeferredOption(fn.name, fn.parent, context);
	}
	if (!ts.isFunctionExpression(fn) && !ts.isArrowFunction(fn)) return false;
	const value = outermostTransparentExpression(fn);
	const parent = value.parent;
	if (ts.isCallExpression(parent)) {
		const hookName = resolveHookName(parent, context) ?? "";
		if (EFFECT_HOOKS.has(hookName) || hookName === "useState") return parent.arguments[0] === value;
		return hookName === "useReducer" && parent.arguments[2] === value;
	}
	if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
		const attributeName = parent.parent.name.getText();
		return attributeName === "ref" || /^on[A-Z]/.test(attributeName);
	}
	if (ts.isPropertyAssignment(parent) && ts.isObjectLiteralExpression(parent.parent)) {
		return isDeferredOption(parent.name, parent.parent, context);
	}
	return false;
}

// Options a hook's library runs outside render: query and mutation functions and event-style
// callbacks such as onSuccess. Any other callback handed to a hook may run during render.
function isDeferredOption(name: ts.PropertyName, options: ts.ObjectLiteralExpression, context: FileContext): boolean {
	const key = getStaticName(name);
	if (key === undefined || (!DEFERRED_OPTION_KEYS.has(key) && !/^on[A-Z]/.test(key))) return false;
	const call = outermostTransparentExpression(options).parent;
	if (!ts.isCallExpression(call)) return false;
	const hookName = resolveHookName(call, context) ?? "";
	return /^use[A-Z]/.test(hookName) && hookName !== "useMemo";
}

function isHookCallback(fn: ts.SignatureDeclaration, hookName: string, context: FileContext): boolean {
	if (!ts.isFunctionExpression(fn) && !ts.isArrowFunction(fn)) return false;
	const value = outermostTransparentExpression(fn);
	const call = value.parent;
	return ts.isCallExpression(call) && call.arguments[0] === value && resolveHookName(call, context) === hookName;
}

function findUnreadMemoDependencies(source: string, fileName = "sample.tsx"): string[] {
	const file = parseSource(source, fileName);
	const context = describeFile(file, fileName);
	const violations: string[] = [];
	const visit = (node: ts.Node) => {
		const hookName = ts.isCallExpression(node) ? resolveHookName(node, context) : undefined;
		if (
			ts.isCallExpression(node) &&
			(hookName === "useMemo" || hookName === "useCallback") &&
			node.arguments.length === 2
		) {
			const callback = resolveCallback(node.arguments[0]);
			const dependencies = skipTransparentExpressions(node.arguments[1]);
			if (callback && ts.isArrayLiteralExpression(dependencies)) {
				const reads = collectReadPaths(callback);
				for (const dependency of dependencies.elements) {
					const path = getReadPath(skipTransparentExpressions(dependency));
					if (!path || isPathRead(path, reads, context)) continue;
					const line = file.getLineAndCharacterOfPosition(dependency.getStart()).line + 1;
					violations.push(`${line} ${hookName} ${path}`);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return violations;
}

// The function given to useMemo or useCallback, written inline or declared by name in the scope that
// the call sees. Anything else cannot be read here and is skipped.
function resolveCallback(argument: ts.Expression): ts.SignatureDeclaration | undefined {
	const expression = skipTransparentExpressions(argument);
	if (ts.isFunctionExpression(expression) || ts.isArrowFunction(expression)) return expression;
	if (!ts.isIdentifier(expression)) return undefined;
	const scope = findDeclaringScope(expression);
	const statements = ts.isSourceFile(scope) || ts.isBlock(scope) ? scope.statements : [];
	for (const statement of statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name?.text === expression.text) return statement;
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || declaration.name.text !== expression.text) continue;
			const value = declaration.initializer && skipTransparentExpressions(declaration.initializer);
			if (value && (ts.isFunctionExpression(value) || ts.isArrowFunction(value))) return value;
		}
	}
	return undefined;
}

// Reads whose root name resolves to a binding outside the callback: a parameter or local of the
// callback that shadows a dependency's name does not read the dependency, and types are not reads.
// A property read counts as that path only; a method call also reads its receiver.
function collectReadPaths(callback: ts.Node): string[] {
	const reads: string[] = [];
	const readsOuterBinding = (identifier: ts.Identifier) => !isWithin(findDeclaringScope(identifier), callback);
	const visit = (node: ts.Node): void => {
		if (ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
		if (ts.isIdentifier(node)) {
			if (!isMemberOrLabelName(node) && readsOuterBinding(node)) reads.push(node.text);
			return;
		}
		if (ts.isPropertyAccessExpression(node)) {
			const path = getReadPath(node);
			const root = getReadRoot(node);
			if (path === undefined || root === undefined) {
				ts.forEachChild(node, visit);
			} else if (readsOuterBinding(root)) {
				reads.push(path);
				const value = outermostTransparentExpression(node);
				const receiver = getReadPath(node.expression);
				if (ts.isCallExpression(value.parent) && value.parent.expression === value && receiver) reads.push(receiver);
			}
			return;
		}
		if (ts.isShorthandPropertyAssignment(node)) {
			if (readsOuterBinding(node.name)) reads.push(node.name.text);
			if (node.objectAssignmentInitializer) visit(node.objectAssignmentInitializer);
			return;
		}
		if (ts.isPropertyAssignment(node)) {
			if (ts.isComputedPropertyName(node.name)) visit(node.name.expression);
			visit(node.initializer);
			return;
		}
		if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
			if (!ts.isIdentifier(node.name)) ts.forEachChild(node.name, visit);
			if (ts.isBindingElement(node) && node.propertyName && ts.isComputedPropertyName(node.propertyName)) {
				visit(node.propertyName.expression);
			}
			if (node.initializer) visit(node.initializer);
			return;
		}
		if (ts.isJsxAttribute(node)) {
			if (node.initializer) visit(node.initializer);
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(callback);
	return reads;
}

function getReadPath(node: ts.Node): string | undefined {
	if (ts.isIdentifier(node)) return node.text;
	if (ts.isPropertyAccessExpression(node)) {
		const base = getReadPath(node.expression);
		return base === undefined ? undefined : `${base}.${node.name.text}`;
	}
	return undefined;
}

function isMemberOrLabelName(identifier: ts.Identifier): boolean {
	const parent = identifier.parent;
	if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return parent.label === identifier;
	const isMember =
		ts.isMethodDeclaration(parent) ||
		ts.isGetAccessorDeclaration(parent) ||
		ts.isSetAccessorDeclaration(parent) ||
		ts.isPropertyDeclaration(parent);
	return isMember && parent.name === identifier;
}

function getReadRoot(node: ts.Expression): ts.Identifier | undefined {
	if (ts.isIdentifier(node)) return node;
	return ts.isPropertyAccessExpression(node) ? getReadRoot(node.expression) : undefined;
}

// Reading an object counts as reading its properties, because the object usually changes identity
// with them. Lingui's i18n object never does, so a dependency below it must itself be read.
function isPathRead(path: string, reads: readonly string[], context: FileContext): boolean {
	const stableRoot = context.i18nNames.has(path.split(".")[0]);
	return reads.some(
		(read) => read === path || read.startsWith(`${path}.`) || (!stableRoot && path.startsWith(`${read}.`)),
	);
}
