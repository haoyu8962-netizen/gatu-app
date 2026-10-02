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
			"an i18n object taken as a destructuring default",
			"const { intl = i18n } = options; return <div>{groups.map((group) => formatList(group, { locale: intl.locale }))}</div>;",
		],
		[
			"an i18n object chosen by ??",
			"const intl = alternate ?? i18n; return at === null ? null : format(at, { locale: intl.locale });",
		],
		[
			"an i18n object wrapped in an object literal",
			"const context = { i18n }; const { i18n: intl } = context; return at === null ? null : format(at, { locale: intl.locale });",
		],
		[
			"an i18n object wrapped in an object and read through an alias",
			"const box = { intl: i18n }; const copy = box; return at === null ? null : format(at, { locale: copy.intl.locale });",
		],
		[
			"an i18n object nested in an object and destructured",
			"const box = { inner: { intl: i18n } }; const { inner } = box; return at === null ? null : format(at, { locale: inner.intl.locale });",
		],
		[
			"an i18n object taken from one of two object literals",
			'const intl = (flag ? { intl: { locale: "en" } } : { intl: i18n }).intl; return at === null ? null : format(at, { locale: intl.locale });',
		],
		[
			"an object holding i18n read through an alias inside a render callback",
			"const box = { i18n }; const alias = box; return <div>{groups.map((group) => alias.i18n.locale + group[0])}</div>;",
		],
		[
			"a locale destructured from a hook's result inside a render callback",
			'const intl = useI18nObject(); return <div>{groups.map((group) => { const { locale = "en" } = intl; return formatList(group, { locale }); })}</div>;',
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
			"a locale member of a value that no hook returned",
			"const settings = readSettings(); return at === null ? null : format(at, { locale: settings.locale });",
		],
		[
			"an i18n member of a value that no hook returned",
			"const settings = readSettings(); return at === null ? null : format(at, { locale: settings.i18n.locale });",
		],
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
			"a function in the same file that returns the i18n object through ||",
			`import { i18n as globalIntl } from "@lingui/core";
function getIntl() { return globalIntl || null; }
function Sample({ at }: Props) { useLingui(); const intl = getIntl(); return at === null || intl === null ? null : format(at, { locale: intl.locale }); }`,
		],
		[
			"an i18n object taken as a parameter default",
			`import { i18n as globalIntl } from "@lingui/core";
function Sample({ at, intl = globalIntl }: Props) { useLingui(); return at === null ? null : format(at, { locale: intl.locale }); }`,
		],
		[
			"a hook in the same file that returns useLingui()",
			`function useLocaleContext() { return useLingui(); }
function Sample({ at }: Props) { const { i18n } = useLocaleContext(); return at === null ? null : format(at, { locale: i18n.locale }); }`,
		],
		[
			"a hook in the same file that returns the i18n object",
			`function useI18nObject() { return useLingui().i18n; }
function Sample({ at }: Props) { const intl = useI18nObject(); return at === null ? null : format(at, { locale: intl.locale }); }`,
		],
		[
			"a hook from another module that returns the i18n object",
			`import { useI18nObject } from "@/hooks/use-i18n-object";
function Sample({ at }: Props) { const intl = useI18nObject(); return at === null ? null : format(at, { locale: intl.locale }); }`,
		],
		[
			"a hook from another module whose result carries i18n",
			`import { useLocaleContext } from "@/hooks/use-locale-context";
function Sample({ at }: Props) { const { i18n } = useLocaleContext(); return at === null ? null : format(at, { locale: i18n.locale }); }`,
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
			"a locale dependency below an i18n object chosen between two object literals",
			"const box = flag ? { i18n: other } : { i18n }; return useMemo(() => format(at, box.i18n), [at, box.i18n.locale]);",
			["box.i18n.locale"],
		],
		[
			"a locale dependency of an i18n object taken as a destructuring default",
			"const { intl = i18n } = options; return useMemo(() => formatAll(groups, intl), [groups, intl, intl.locale]);",
			["intl.locale"],
		],
		[
			"a locale alias dependency of an i18n object taken as a destructuring default",
			"const { intl = i18n } = options; const locale = intl.locale; return useMemo(() => formatAll(groups, intl), [groups, intl, locale]);",
			["locale"],
		],
		[
			"a locale dependency of a hook's result when the callback reads only the result",
			"const intl = useI18nObject(); return useMemo(() => format(at, intl), [at, intl, intl.locale]);",
			["intl.locale"],
		],
		[
			"a locale alias dependency of a hook's result when the callback reads only the result",
			"const intl = useI18nObject(); const locale = intl.locale; return useMemo(() => format(at, intl), [at, intl, locale]);",
			["locale"],
		],
		[
			"a locale alias dependency when the callback reads only the i18n object",
			"const locale = i18n.locale; return useMemo(() => format(at, i18n), [at, locale]);",
			["locale"],
		],
		[
			"a destructured locale dependency when the callback reads only the i18n object",
			"const { locale } = i18n; return useMemo(() => format(at, i18n), [at, locale]);",
			["locale"],
		],
		[
			"a dependency destructured with a default inside the callback and then dropped",
			'return useMemo(() => { const { locale = "en" } = i18n; void locale; return format(at); }, [at, i18n.locale]);',
			["i18n.locale"],
		],
		[
			"no dependency when the dependency is written through an outer alias",
			"const intl = i18n; return useMemo(() => format(at, { locale: i18n.locale }), [at, intl.locale]);",
			[],
		],
		[
			"no dependency when a function reads a local declared after it",
			"return useMemo(() => { function read() { return locale; } const { locale } = i18n; return format(at, { locale: read() }); }, [at, i18n.locale]);",
			[],
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

type LinguiRole = "coreNamespace" | "hook" | "hookNamespace" | "hookResult" | "i18n" | "lingui";
type Roles = ReadonlySet<LinguiRole>;

// What is known about a value: the Lingui roles it may hold, and for an object built from literals the
// values its members may hold. Values nest at most MAX_VALUE_DEPTH levels so the analysis settles.
interface LinguiValue {
	roles: Roles;
	members: ReadonlyMap<string, LinguiValue>;
}

const NO_VALUE: LinguiValue = { roles: new Set(), members: new Map() };
const MAX_VALUE_DEPTH = 4;

interface FileContext {
	fileName: string;
	// What each binding may hold, keyed by its declaring identifier. The roles are Lingui's i18n object, a
	// useLingui() result, the useLingui hook, a namespace import of @lingui/core or @lingui/react, or a
	// hook's result that may be one of these.
	values: Map<ts.Identifier, LinguiValue>;
	// What a call to a function in this file may return, keyed by the function's declaring identifier.
	returnValues: Map<ts.Identifier, LinguiValue>;
	// React hooks imported under another name.
	hookAliases: Map<string, string>;
}

const LINGUI_HOOK_MODULES = new Set(["@lingui/react", "@lingui/react/macro"]);

function describeFile(file: ts.SourceFile, fileName: string): FileContext {
	const context: FileContext = { fileName, values: new Map(), returnValues: new Map(), hookAliases: new Map() };
	const declarations: (ts.VariableDeclaration | ts.ParameterDeclaration)[] = [];
	const functions: [ts.Identifier, ts.SignatureDeclaration][] = [];
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			describeImport(node, node.moduleSpecifier.text, context);
		}
		if ((ts.isVariableDeclaration(node) && node.initializer) || ts.isParameter(node)) declarations.push(node);
		if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
			const value = skipTransparentExpressions(node.initializer);
			if (ts.isFunctionExpression(value) || ts.isArrowFunction(value)) functions.push([node.name, value]);
		}
		if (ts.isFunctionDeclaration(node) && node.name) functions.push([node.name, node]);
		ts.forEachChild(node, visit);
	};
	visit(file);
	let changed = true;
	while (changed) {
		changed = false;
		for (const declaration of declarations) {
			for (const [binding, value] of describeLinguiBinding(declaration, context)) {
				changed = addValue(context.values, binding, value) || changed;
			}
		}
		for (const [binding, fn] of functions) {
			changed = addValue(context.returnValues, binding, getReturnValue(fn, context)) || changed;
		}
	}
	return context;
}

function addValue(map: Map<ts.Identifier, LinguiValue>, binding: ts.Identifier, value: LinguiValue): boolean {
	const known = map.get(binding) ?? NO_VALUE;
	const merged = truncateValue(mergeValues(known, value), MAX_VALUE_DEPTH);
	if (serializeValue(merged) === serializeValue(known)) return false;
	map.set(binding, merged);
	return true;
}

function describeImport(declaration: ts.ImportDeclaration, from: string, context: FileContext): void {
	const bindings = declaration.importClause?.namedBindings;
	if (bindings && ts.isNamespaceImport(bindings)) {
		if (from === "@lingui/core") addValue(context.values, bindings.name, roleValue("coreNamespace"));
		if (LINGUI_HOOK_MODULES.has(from)) addValue(context.values, bindings.name, roleValue("hookNamespace"));
	}
	if (!bindings || !ts.isNamedImports(bindings)) return;
	for (const element of bindings.elements) {
		const imported = (element.propertyName ?? element.name).text;
		if (from === "react" && element.propertyName) context.hookAliases.set(element.name.text, imported);
		if (LINGUI_HOOK_MODULES.has(from) && imported === "useLingui") {
			addValue(context.values, element.name, roleValue("hook"));
		}
		if (from === "@lingui/core" && imported === "i18n") addValue(context.values, element.name, roleValue("i18n"));
	}
}

// What a variable or parameter binds: whatever its initializer may hold (an alias, a hook call, an
// object, a conditional or logical choice), and for a destructured name the member it takes or its
// default.
function describeLinguiBinding(
	declaration: ts.VariableDeclaration | ts.ParameterDeclaration,
	context: FileContext,
): [ts.Identifier, LinguiValue][] {
	const source = declaration.initializer ? getLinguiValue(declaration.initializer, context) : NO_VALUE;
	if (ts.isIdentifier(declaration.name)) return [[declaration.name, source]];
	return ts.isObjectBindingPattern(declaration.name) ? describePatternValues(declaration.name, source, context) : [];
}

function describePatternValues(
	pattern: ts.ObjectBindingPattern,
	source: LinguiValue,
	context: FileContext,
): [ts.Identifier, LinguiValue][] {
	return pattern.elements.flatMap((element): [ts.Identifier, LinguiValue][] => {
		const value = getElementValue(element, source, context);
		if (ts.isIdentifier(element.name)) return [[element.name, value]];
		return ts.isObjectBindingPattern(element.name) ? describePatternValues(element.name, value, context) : [];
	});
}

function getElementValue(element: ts.BindingElement, source: LinguiValue, context: FileContext): LinguiValue {
	if (element.dotDotDotToken) return { roles: NO_VALUE.roles, members: source.members };
	const member = getMemberValue(source, getDestructuredKey(element));
	return element.initializer ? mergeValues(member, getLinguiValue(element.initializer, context)) : member;
}

// The value a destructuring pattern takes apart: its declaration's initializer, or for a nested
// pattern the member (or default) of the enclosing one.
function getPatternSource(pattern: ts.ObjectBindingPattern, context: FileContext): LinguiValue {
	const owner = pattern.parent;
	if (ts.isBindingElement(owner) && ts.isObjectBindingPattern(owner.parent)) {
		return getElementValue(owner, getPatternSource(owner.parent, context), context);
	}
	if ((ts.isVariableDeclaration(owner) || ts.isParameter(owner)) && owner.initializer) {
		return getLinguiValue(owner.initializer, context);
	}
	return NO_VALUE;
}

// What every `return` value (or an expression body) may hold.
function getReturnValue(fn: ts.SignatureDeclaration, context: FileContext): LinguiValue {
	const body = (fn as ts.FunctionLikeDeclaration).body;
	if (!body) return NO_VALUE;
	if (!ts.isBlock(body)) return getLinguiValue(body, context);
	let value = NO_VALUE;
	const visit = (node: ts.Node) => {
		if (ts.isFunctionLike(node)) return;
		if (ts.isReturnStatement(node) && node.expression)
			value = mergeValues(value, getLinguiValue(node.expression, context));
		ts.forEachChild(node, visit);
	};
	ts.forEachChild(body, visit);
	return value;
}

// A call to useLingui returns its result; a call to a function in this file returns what that function
// returns; a call to any other hook may return the i18n object or a context that carries it, so it is
// treated as possibly either (stricter, never looser). A conditional or logical expression may hold
// any of its operands, and an object literal holds what its members hold.
function getLinguiValue(expression: ts.Expression, context: FileContext, depth = 0): LinguiValue {
	if (depth > MAX_VALUE_DEPTH) return NO_VALUE;
	const target = skipTransparentExpressions(expression);
	if (ts.isObjectLiteralExpression(target)) return getObjectValue(target, context, depth);
	if (ts.isIdentifier(target)) {
		const binding = findBinding(target);
		return (binding && context.values.get(binding)) ?? NO_VALUE;
	}
	if (ts.isConditionalExpression(target)) {
		return mergeValues(
			getLinguiValue(target.whenTrue, context, depth),
			getLinguiValue(target.whenFalse, context, depth),
		);
	}
	if (ts.isBinaryExpression(target) && SHORT_CIRCUIT_OPERATORS.has(target.operatorToken.kind)) {
		return mergeValues(getLinguiValue(target.left, context, depth), getLinguiValue(target.right, context, depth));
	}
	if (ts.isCallExpression(target)) return getCallValue(target, context);
	if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return NO_VALUE;
	return getMemberValue(getLinguiValue(target.expression, context, depth), getMemberKey(target));
}

function getObjectValue(literal: ts.ObjectLiteralExpression, context: FileContext, depth: number): LinguiValue {
	let members = new Map<string, LinguiValue>();
	for (const property of literal.properties) {
		if (ts.isSpreadAssignment(property)) {
			members = mergeMembers(members, getLinguiValue(property.expression, context, depth + 1).members);
			continue;
		}
		if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
		const key = getStaticName(property.name);
		if (key === undefined) continue;
		const valueExpression = ts.isPropertyAssignment(property) ? property.initializer : property.name;
		members.set(key, mergeValues(members.get(key) ?? NO_VALUE, getLinguiValue(valueExpression, context, depth + 1)));
	}
	return { roles: NO_VALUE.roles, members };
}

function getCallValue(call: ts.CallExpression, context: FileContext): LinguiValue {
	if (getLinguiValue(call.expression, context).roles.has("hook")) return roleValue("lingui");
	const callee = skipTransparentExpressions(call.expression);
	const binding = ts.isIdentifier(callee) ? findBinding(callee) : undefined;
	const returned = binding ? context.returnValues.get(binding) : undefined;
	if (returned && (returned.roles.size > 0 || returned.members.size > 0)) return returned;
	return /^use[A-Z0-9]/.test(calleeName(call) ?? "") ? roleValue("hookResult") : NO_VALUE;
}

function getMemberValue(owner: LinguiValue, key: string | undefined): LinguiValue {
	if (key === undefined) return NO_VALUE;
	const roles = new Set<LinguiRole>();
	for (const role of owner.roles) {
		const member = getMemberRole(role, key);
		if (member) roles.add(member);
	}
	const member = owner.members.get(key);
	return member ? mergeValues({ roles, members: new Map() }, member) : { roles, members: new Map() };
}

function roleValue(role: LinguiRole): LinguiValue {
	return { roles: new Set([role]), members: new Map() };
}

function mergeValues(first: LinguiValue, second: LinguiValue): LinguiValue {
	return { roles: new Set([...first.roles, ...second.roles]), members: mergeMembers(first.members, second.members) };
}

function mergeMembers(
	first: ReadonlyMap<string, LinguiValue>,
	second: ReadonlyMap<string, LinguiValue>,
): Map<string, LinguiValue> {
	const members = new Map(first);
	for (const [key, value] of second) members.set(key, mergeValues(members.get(key) ?? NO_VALUE, value));
	return members;
}

function truncateValue(value: LinguiValue, depth: number): LinguiValue {
	if (depth === 0) return { roles: value.roles, members: new Map() };
	return {
		roles: value.roles,
		members: new Map([...value.members].map(([key, member]) => [key, truncateValue(member, depth - 1)])),
	};
}

function serializeValue(value: LinguiValue): string {
	const members = [...value.members]
		.sort(([first], [second]) => first.localeCompare(second))
		.map(([key, member]) => `${key}:${serializeValue(member)}`);
	return `${[...value.roles].sort().join(",")}{${members.join(";")}}`;
}

function getMemberRole(ownerRole: LinguiRole, key: string): LinguiRole | undefined {
	if (key === "i18n" && (ownerRole === "lingui" || ownerRole === "coreNamespace" || ownerRole === "hookResult")) {
		return "i18n";
	}
	return key === "useLingui" && ownerRole === "hookNamespace" ? "hook" : undefined;
}

// Lingui's i18n object, or a hook's result, which may be that object returned from another module.
// Every rule that asks whether a value is the i18n object asks this, so they cannot disagree.
function mayBeI18nObject(roles: Roles): boolean {
	return roles.has("i18n") || roles.has("hookResult");
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
// the object, or directly on any hook's result, which may be the i18n object from another module.
function isLocaleRead(node: ts.Node, context: FileContext): boolean {
	if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return false;
	return getMemberKey(node) === "locale" && mayBeI18nObject(getLinguiValue(node.expression, context).roles);
}

// `const { locale } = i18n`, `const { i18n: { locale } } = useLingui()` and the same destructuring of
// any value that may be the i18n object read the locale where the binding is declared.
function isLocaleBinding(node: ts.Node, context: FileContext): boolean {
	if (!ts.isBindingElement(node) || getDestructuredKey(node) !== "locale" || !ts.isObjectBindingPattern(node.parent)) {
		return false;
	}
	return mayBeI18nObject(getPatternSource(node.parent, context).roles);
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
					const written = getReadPath(dependency);
					const path = getCanonicalPath(dependency)?.path;
					if (!written || !path || isPathRead(path, reads, getStableObjectPath(dependency, context))) continue;
					const line = file.getLineAndCharacterOfPosition(dependency.getStart()).line + 1;
					violations.push(`${line} ${hookName} ${written}`);
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

// The outer paths a callback reads, in canonical form: a `const` alias of a path (`const intl = i18n`,
// `const { locale } = i18n`) stands for that path wherever it is declared, so a dependency and a read
// of the same value compare equal, and an alias counts only where it is used. A member read counts as
// its path, written with dots, static keys or assertions; a method call also reads its receiver; a
// destructuring that cannot be an alias (a dynamic key, a rest element) reads its source where it is
// written. Types, shadowing parameters and dropped values (`void locale`) are not reads.
function collectReadPaths(callback: ts.Node): string[] {
	const reads: string[] = [];
	const pushRead = (node: ts.Node) => {
		const read = getCanonicalPath(node);
		const binding = read && findBinding(read.root);
		if (read && !(binding && isWithin(binding, callback))) reads.push(read.path);
	};
	const describePattern = (pattern: ts.ObjectBindingPattern, base: string) => {
		for (const element of pattern.elements) {
			const key = getDestructuredKey(element);
			if (key === undefined || element.dotDotDotToken) reads.push(base);
			else if (ts.isObjectBindingPattern(element.name)) describePattern(element.name, `${base}.${key}`);
		}
	};
	const visit = (node: ts.Node): void => {
		if (ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
		if (ts.isIdentifier(node)) {
			if (!isMemberOrLabelName(node) && !isDroppedRead(node)) pushRead(node);
			return;
		}
		if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
			if (getReadPath(node) === undefined) {
				ts.forEachChild(node, visit);
			} else if (!isDroppedRead(node)) {
				pushRead(node);
				const value = outermostTransparentExpression(node);
				if (ts.isCallExpression(value.parent) && value.parent.expression === value) pushRead(node.expression);
			}
			return;
		}
		if (ts.isShorthandPropertyAssignment(node)) {
			pushRead(node.name);
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
			const source =
				ts.isVariableDeclaration(node) && isConstDeclaration(node) ? getCanonicalPath(node.initializer) : undefined;
			const sourceBinding = source && findBinding(source.root);
			if (!source) visit(node.initializer);
			else if (ts.isObjectBindingPattern(node.name) && !(sourceBinding && isWithin(sourceBinding, callback))) {
				describePattern(node.name, source.path);
			}
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

// The path an expression reads, with `const` aliases of a path replaced by what they stand for, and
// the identifier the path starts from.
function getCanonicalPath(
	node: ts.Node,
	seen = new Set<ts.Identifier>(),
): { path: string; root: ts.Identifier } | undefined {
	if (ts.isIdentifier(node)) {
		const binding = findBinding(node);
		const alias = binding && !seen.has(binding) ? getAliasSource(binding) : undefined;
		if (binding && alias) {
			seen.add(binding);
			const base = getCanonicalPath(alias.source, seen);
			if (base) return { path: [base.path, ...alias.keys].join("."), root: base.root };
		}
		return { path: node.text, root: node };
	}
	if (isTransparentExpression(node)) return getCanonicalPath(node.expression, seen);
	if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return undefined;
	const base = getCanonicalPath(node.expression, seen);
	const key = getMemberKey(node);
	return base && key !== undefined ? { path: `${base.path}.${key}`, root: base.root } : undefined;
}

// A `const` binding that only renames a path: `const intl = i18n`, or a key destructured from such a
// path (a default only replaces an undefined value, so the binding still names that path).
function getAliasSource(binding: ts.Identifier): { source: ts.Expression; keys: string[] } | undefined {
	const keys: string[] = [];
	let name: ts.Node = binding;
	for (;;) {
		const owner = name.parent;
		if (ts.isVariableDeclaration(owner)) {
			if (owner.name !== name || !owner.initializer || !isConstDeclaration(owner)) return undefined;
			return getReadPath(owner.initializer) === undefined ? undefined : { source: owner.initializer, keys };
		}
		if (!ts.isBindingElement(owner) || owner.name !== name || owner.dotDotDotToken) return undefined;
		const key = getDestructuredKey(owner);
		if (key === undefined || !ts.isObjectBindingPattern(owner.parent)) return undefined;
		keys.unshift(key);
		name = owner.parent;
	}
}

function isConstDeclaration(declaration: ts.VariableDeclaration): boolean {
	return ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
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

// The canonical path of the part of a dependency that may be Lingui's i18n object, such as `i18n` or
// `lingui.i18n`: found on the dependency as written and inside the `const` aliases it goes through,
// so `const locale = i18n.locale`, `const { intl = i18n } = options` and `i18n.locale` all agree.
function getStableObjectPath(
	dependency: ts.Expression,
	context: FileContext,
	seen = new Set<ts.Identifier>(),
): string | undefined {
	const target = skipTransparentExpressions(dependency);
	if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
		const inner = getStableObjectPath(target.expression, context, seen);
		if (inner !== undefined) return inner;
	}
	if (mayBeI18nObject(getLinguiValue(target, context).roles)) return getCanonicalPath(target)?.path;
	if (!ts.isIdentifier(target)) return undefined;
	const binding = findBinding(target);
	const alias = binding && !seen.has(binding) ? getAliasSource(binding) : undefined;
	if (!binding || !alias) return undefined;
	seen.add(binding);
	return getStableObjectPath(alias.source, context, seen);
}
