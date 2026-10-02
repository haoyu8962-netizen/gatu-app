import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	calleeName,
	findBinding,
	getComponentOrHookName,
	getStaticName,
	isTransparentExpression,
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
			"a locale destructured inside a render callback",
			"return <div>{groups.map((group) => { const { locale } = i18n; return formatList(group, { locale }); })}</div>;",
		],
		[
			"a locale destructured inside a select option",
			'useQuery({ queryKey: ["rows"], select: (data) => { const { locale } = i18n; return format(data, { locale }); } }); return null;',
		],
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
		[
			"a callback parameter that only shares the name i18n",
			'return <div>{groups.map((i18n) => (i18n.length > 0 ? i18n.locale : ""))}</div>;',
		],
		[
			"a locale destructured at the top of the component",
			"const { locale } = i18n; return at === null ? null : format(at, { locale });",
		],
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
			"a useLingui imported under another name",
			`import { useLingui as useI18n } from "@lingui/react";
function Sample({ at }: Props) { const { i18n: intl } = useI18n(); return at === null ? null : format(at, { locale: intl.locale }); }`,
		],
		[
			"a binding whose name another component uses for a different Lingui value",
			`function Other() { const intl = useLingui(); return intl.i18n.locale; }
function Sample({ at }: Props) { const { i18n: intl } = useLingui(); const clockI18n = intl; return at === null ? null : format(at, { locale: clockI18n.locale }); }`,
		],
		[
			"a static alias of useLingui",
			`const useI18n = useLingui;
function Sample({ at }: Props) { const { i18n: intl } = useI18n(); return at === null ? null : format(at, { locale: intl.locale }); }`,
		],
		[
			"the i18n object read from a @lingui/core namespace",
			`import * as core from "@lingui/core";
function Sample({ at }: Props) { useLingui(); return at === null ? null : format(at, { locale: core.i18n.locale }); }`,
		],
		[
			"a local alias of the i18n object",
			`function Sample({ at }: Props) { const { i18n } = useLingui(); const intl = i18n; return at === null ? null : format(at, { locale: intl.locale }); }`,
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
			"no dependency when the callback reads it with a string key",
			'return useMemo(() => format(at, { locale: i18n["locale"] }), [at, i18n.locale]);',
			[],
		],
		[
			"no dependency when the callback reads it through an assertion",
			"return useMemo(() => format(at, { locale: (i18n as I18n).locale }), [at, i18n.locale]);",
			[],
		],
		[
			"no dependency when the callback destructures it",
			"return useMemo(() => { const { locale } = i18n; return format(at, { locale }); }, [at, i18n.locale]);",
			[],
		],
		[
			"a dependency below lingui.i18n when the callback reads only lingui.i18n",
			"const lingui = useLingui(); return useMemo(() => format(at, lingui.i18n), [at, lingui.i18n.locale]);",
			["lingui.i18n.locale"],
		],
		[
			"no dependency when the callback reads it through a local alias",
			"return useMemo(() => { const intl = i18n; return format(at, { locale: intl.locale }); }, [at, i18n.locale]);",
			[],
		],
		[
			"a dependency destructured inside the callback and then dropped",
			"return useMemo(() => { const { locale } = i18n; void locale; return format(at); }, [at, i18n.locale]);",
			["i18n.locale"],
		],
		[
			"a dependency read only by a dropped expression",
			"const locale = i18n.locale; return useMemo(() => { void locale; return format(at); }, [at, locale]);",
			["locale"],
		],
		[
			"a dependency written with a string key that the callback never reads",
			'return useMemo(() => format(at), [at, i18n["locale"]]);',
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

type LinguiRole = "coreNamespace" | "hook" | "hookNamespace" | "i18n" | "lingui";

interface FileContext {
	fileName: string;
	// The Lingui role of each binding, keyed by its declaring identifier: Lingui's i18n object, a
	// useLingui() result, the useLingui hook, or a namespace import of @lingui/core or @lingui/react.
	roles: Map<ts.Identifier, LinguiRole>;
	// React hooks imported under another name.
	hookAliases: Map<string, string>;
}

const LINGUI_HOOK_MODULES = new Set(["@lingui/react", "@lingui/react/macro"]);

function describeFile(file: ts.SourceFile, fileName: string): FileContext {
	const context: FileContext = { fileName, roles: new Map(), hookAliases: new Map() };
	const declarations: ts.VariableDeclaration[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			describeImport(node, node.moduleSpecifier.text, context);
		}
		if (ts.isVariableDeclaration(node) && node.initializer) declarations.push(node);
		ts.forEachChild(node, visit);
	};
	visit(file);
	let changed = true;
	while (changed) {
		changed = false;
		for (const declaration of declarations) {
			for (const [binding, role] of describeLinguiBinding(declaration, context)) {
				if (context.roles.get(binding) !== role) {
					context.roles.set(binding, role);
					changed = true;
				}
			}
		}
	}
	return context;
}

function describeImport(declaration: ts.ImportDeclaration, from: string, context: FileContext): void {
	const bindings = declaration.importClause?.namedBindings;
	if (bindings && ts.isNamespaceImport(bindings)) {
		if (from === "@lingui/core") context.roles.set(bindings.name, "coreNamespace");
		if (LINGUI_HOOK_MODULES.has(from)) context.roles.set(bindings.name, "hookNamespace");
	}
	if (!bindings || !ts.isNamedImports(bindings)) return;
	for (const element of bindings.elements) {
		const imported = (element.propertyName ?? element.name).text;
		if (from === "react" && element.propertyName) context.hookAliases.set(element.name.text, imported);
		if (LINGUI_HOOK_MODULES.has(from) && imported === "useLingui") context.roles.set(element.name, "hook");
		if (from === "@lingui/core" && imported === "i18n") context.roles.set(element.name, "i18n");
	}
}

// The Lingui roles a declaration binds: an alias of any Lingui value (`const useI18n = useLingui`,
// `const intl = i18n`), a useLingui() result, or a member destructured from one or from a namespace.
function describeLinguiBinding(
	declaration: ts.VariableDeclaration,
	context: FileContext,
): [ts.Identifier, LinguiRole][] {
	const sourceRole = getLinguiRole(declaration.initializer as ts.Expression, context);
	if (sourceRole === undefined) return [];
	if (ts.isIdentifier(declaration.name)) return [[declaration.name, sourceRole]];
	if (!ts.isObjectBindingPattern(declaration.name)) return [];
	return declaration.name.elements.flatMap((element): [ts.Identifier, LinguiRole][] => {
		const role = getMemberRole(sourceRole, getDestructuredKey(element));
		return role !== undefined && ts.isIdentifier(element.name) ? [[element.name, role]] : [];
	});
}

function getLinguiRole(expression: ts.Expression, context: FileContext): LinguiRole | undefined {
	const target = skipTransparentExpressions(expression);
	if (ts.isIdentifier(target)) {
		const binding = findBinding(target);
		return binding ? context.roles.get(binding) : undefined;
	}
	if (ts.isCallExpression(target)) return getLinguiRole(target.expression, context) === "hook" ? "lingui" : undefined;
	if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return undefined;
	const ownerRole = getLinguiRole(target.expression, context);
	return ownerRole === undefined ? undefined : getMemberRole(ownerRole, getMemberKey(target));
}

function getMemberRole(ownerRole: LinguiRole, key: string | undefined): LinguiRole | undefined {
	if (key === "i18n" && (ownerRole === "lingui" || ownerRole === "coreNamespace")) return "i18n";
	return key === "useLingui" && ownerRole === "hookNamespace" ? "hook" : undefined;
}

function getMemberKey(member: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | undefined {
	if (ts.isPropertyAccessExpression(member)) return member.name.text;
	const key = skipTransparentExpressions(member.argumentExpression);
	return ts.isStringLiteralLike(key) ? key.text : undefined;
}

function getDestructuredKey(element: ts.BindingElement): string | undefined {
	if (element.propertyName) return getStaticName(element.propertyName);
	return ts.isIdentifier(element.name) ? element.name.text : undefined;
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
		if ((isLocaleRead(node, context) || isLocaleBinding(node, context)) && isBranchOnlyRenderRead(node, context)) {
			lines.push(file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return lines;
}

// `.locale` or `["locale"]` on Lingui's i18n object, behind any assertion and whatever binding holds
// the object.
function isLocaleRead(node: ts.Node, context: FileContext): boolean {
	if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return false;
	return getMemberKey(node) === "locale" && getLinguiRole(node.expression, context) === "i18n";
}

// `const { locale } = i18n` and `const { i18n: { locale } } = useLingui()` read the locale where the
// binding is declared.
function isLocaleBinding(node: ts.Node, context: FileContext): boolean {
	if (!ts.isBindingElement(node) || getDestructuredKey(node) !== "locale" || !ts.isObjectBindingPattern(node.parent)) {
		return false;
	}
	const owner = node.parent.parent;
	if (ts.isVariableDeclaration(owner)) {
		return owner.initializer !== undefined && getLinguiRole(owner.initializer, context) === "i18n";
	}
	if (!ts.isBindingElement(owner) || !ts.isObjectBindingPattern(owner.parent)) return false;
	const declaration = owner.parent.parent;
	if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) return false;
	const sourceRole = getLinguiRole(declaration.initializer, context);
	return sourceRole !== undefined && getMemberRole(sourceRole, getDestructuredKey(owner)) === "i18n";
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
					const path = getReadPath(dependency);
					if (!path || isPathRead(path, reads, getStableObjectPath(dependency, context))) continue;
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
	const binding = findBinding(expression);
	const declaration = binding?.parent;
	if (declaration && ts.isFunctionDeclaration(declaration) && declaration.name === binding) return declaration;
	if (!declaration || !ts.isVariableDeclaration(declaration) || declaration.name !== binding) return undefined;
	const value = declaration.initializer && skipTransparentExpressions(declaration.initializer);
	return value && (ts.isFunctionExpression(value) || ts.isArrowFunction(value)) ? value : undefined;
}

// The outer paths a callback reads. A read counts once its root resolves to a binding outside the
// callback; a local alias (`const intl = i18n`) or a destructured local (`const { locale } = i18n`)
// counts as the outer path it stands for, and only where it is used, while a dynamic key or a rest
// element reads the whole object where it is destructured. A member read counts as its
// path, written with dots, static keys or assertions; a method call also reads its receiver. Types,
// shadowing parameters and dropped values (`void locale`) are not reads.
function collectReadPaths(callback: ts.Node): string[] {
	const reads: string[] = [];
	const aliases = new Map<ts.Identifier, string>();
	const expand = (node: ts.Node): string | undefined => {
		if (ts.isIdentifier(node)) {
			const binding = findBinding(node);
			if (binding && aliases.has(binding)) return aliases.get(binding);
			return binding && isWithin(binding, callback) ? undefined : node.text;
		}
		if (isTransparentExpression(node)) return expand(node.expression);
		if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return undefined;
		const base = expand(node.expression);
		const key = getMemberKey(node);
		return base === undefined || key === undefined ? undefined : `${base}.${key}`;
	};
	const describeAliases = (name: ts.BindingName, base: string) => {
		if (ts.isIdentifier(name)) {
			aliases.set(name, base);
			return;
		}
		if (!ts.isObjectBindingPattern(name)) {
			reads.push(base);
			return;
		}
		for (const element of name.elements) {
			const key = getDestructuredKey(element);
			if (key === undefined || element.dotDotDotToken) reads.push(base);
			else describeAliases(element.name, `${base}.${key}`);
		}
	};
	const visit = (node: ts.Node): void => {
		if (ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
		if (ts.isIdentifier(node)) {
			if (isMemberOrLabelName(node) || isDroppedRead(node)) return;
			const path = expand(node);
			if (path !== undefined) reads.push(path);
			return;
		}
		if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
			const path = getReadPath(node) === undefined ? undefined : expand(node);
			if (path === undefined) {
				ts.forEachChild(node, visit);
			} else if (!isDroppedRead(node)) {
				reads.push(path);
				const value = outermostTransparentExpression(node);
				const receiver = expand(node.expression);
				if (ts.isCallExpression(value.parent) && value.parent.expression === value && receiver) reads.push(receiver);
			}
			return;
		}
		if (ts.isShorthandPropertyAssignment(node)) {
			const path = expand(node.name);
			if (path !== undefined) reads.push(path);
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
			if (!node.initializer) return;
			const source = ts.isVariableDeclaration(node) ? expand(node.initializer) : undefined;
			if (source !== undefined) describeAliases(node.name, source);
			else visit(node.initializer);
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

function isDroppedRead(node: ts.Expression): boolean {
	const value = outermostTransparentExpression(node);
	const parent = value.parent;
	if (ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) return true;
	return (
		ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.CommaToken && parent.left === value
	);
}

function getReadPath(node: ts.Node): string | undefined {
	if (ts.isIdentifier(node)) return node.text;
	if (isTransparentExpression(node)) return getReadPath(node.expression);
	if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return undefined;
	const base = getReadPath(node.expression);
	const key = getMemberKey(node);
	return base === undefined || key === undefined ? undefined : `${base}.${key}`;
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

// Reading an object counts as reading its properties, because the object usually changes identity
// with them. Lingui's i18n object never does, so a dependency below it counts only when that path
// itself is read; reading an ancestor above it, such as the useLingui() result, still counts.
function isPathRead(path: string, reads: readonly string[], stableObject: string | undefined): boolean {
	return reads.some((read) => {
		if (read === path || read.startsWith(`${path}.`)) return true;
		if (!path.startsWith(`${read}.`)) return false;
		return stableObject === undefined || stableObject.startsWith(`${read}.`);
	});
}

// The path of the Lingui i18n object a dependency sits below, such as `i18n` or `lingui.i18n`.
function getStableObjectPath(dependency: ts.Expression, context: FileContext): string | undefined {
	const prefixes: ts.Expression[] = [];
	for (
		let node = skipTransparentExpressions(dependency);
		;
		node = skipTransparentExpressions((node as ts.PropertyAccessExpression).expression)
	) {
		prefixes.unshift(node);
		if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) break;
	}
	const stable = prefixes.find((prefix) => getLinguiRole(prefix, context) === "i18n");
	return stable === undefined ? undefined : getReadPath(stable);
}
