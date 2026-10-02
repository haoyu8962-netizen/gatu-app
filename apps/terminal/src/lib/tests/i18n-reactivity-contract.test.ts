import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { calleeName, findDeclaringScope, getComponentOrHookName, isWithin, parseSource } from "./harness/react-source";

const SOURCE_ROOT = resolve(__dirname, "../..");
const SHORT_CIRCUIT_OPERATORS = new Set([
	ts.SyntaxKind.AmpersandAmpersandToken,
	ts.SyntaxKind.BarBarToken,
	ts.SyntaxKind.QuestionQuestionToken,
]);
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
			if (!source.includes("i18n.locale")) return [];
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
			"a useCallback callback",
			"const label = useCallback(() => format(at, { locale: i18n.locale }), [at, i18n.locale]); return label();",
		],
		["an if statement", 'let label = ""; if (at !== null) label = format(at, { locale: i18n.locale }); return label;'],
		[
			"a loop body",
			"const labels: string[] = []; for (const group of groups) labels.push(formatList(group, { locale: i18n.locale })); return labels;",
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
	])("flags a branch-only locale read in %s", (_, declaration) => {
		expect(findBranchOnlyLocaleReads(`import { useLingui } from "@lingui/react/macro";\n${declaration}`)).toHaveLength(
			1,
		);
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

function findBranchOnlyLocaleReads(source: string, fileName = "sample.tsx"): number[] {
	const file = parseSource(source, fileName);
	const lines: number[] = [];
	const visit = (node: ts.Node) => {
		if (isLocaleRead(node) && isBranchOnlyRenderRead(node, fileName)) {
			lines.push(file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return lines;
}

function isLocaleRead(node: ts.Node): node is ts.PropertyAccessExpression {
	return (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "i18n" &&
		node.name.text === "locale"
	);
}

function isBranchOnlyRenderRead(read: ts.Node, fileName: string): boolean {
	let branched = false;
	let child = read;
	for (let parent = read.parent; parent; child = parent, parent = parent.parent) {
		if (ts.isFunctionLike(parent)) {
			if (getComponentOrHookName(parent, fileName) !== undefined) return branched;
			if (isDeferredCallback(parent)) return false;
			if (!isHookCallback(parent, "useMemo")) branched = true;
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

function isDeferredCallback(node: ts.Node): boolean {
	const parent = node.parent;
	if (ts.isCallExpression(parent)) {
		const hookName = calleeName(parent) ?? "";
		if (EFFECT_HOOKS.has(hookName) || hookName === "useState") return parent.arguments[0] === node;
		return hookName === "useReducer" && parent.arguments[2] === node;
	}
	if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
		const attributeName = parent.parent.name.getText();
		return attributeName === "ref" || /^on[A-Z]/.test(attributeName);
	}
	if (ts.isPropertyAssignment(parent) && ts.isObjectLiteralExpression(parent.parent)) {
		const call = parent.parent.parent;
		const hookName = ts.isCallExpression(call) ? (calleeName(call) ?? "") : "";
		return /^use[A-Z]/.test(hookName) && hookName !== "useMemo";
	}
	return false;
}

function isHookCallback(node: ts.Node, hookName: string): boolean {
	const call = node.parent;
	return ts.isCallExpression(call) && call.arguments[0] === node && calleeName(call) === hookName;
}

function findUnreadMemoDependencies(source: string, fileName = "sample.tsx"): string[] {
	const file = parseSource(source, fileName);
	const violations: string[] = [];
	const visit = (node: ts.Node) => {
		const hookName = ts.isCallExpression(node) ? calleeName(node) : undefined;
		if (
			ts.isCallExpression(node) &&
			(hookName === "useMemo" || hookName === "useCallback") &&
			node.arguments.length === 2 &&
			ts.isFunctionLike(node.arguments[0]) &&
			ts.isArrayLiteralExpression(node.arguments[1])
		) {
			const reads = collectReadPaths(node.arguments[0]);
			for (const dependency of node.arguments[1].elements) {
				const path = getReadPath(dependency);
				if (!path || isPathRead(path, reads)) continue;
				const line = file.getLineAndCharacterOfPosition(dependency.getStart()).line + 1;
				violations.push(`${line} ${hookName} ${path}`);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return violations;
}

// Reads whose root name resolves to a binding outside the callback: a parameter or local of the
// callback that shadows a dependency's name does not read the dependency.
function collectReadPaths(callback: ts.Node): string[] {
	const reads: string[] = [];
	const readsOuterBinding = (identifier: ts.Identifier) => !isWithin(findDeclaringScope(identifier), callback);
	const visit = (node: ts.Node): void => {
		if (ts.isIdentifier(node)) {
			if (readsOuterBinding(node)) reads.push(node.text);
			return;
		}
		if (ts.isPropertyAccessExpression(node)) {
			const path = getReadPath(node);
			const root = getReadRoot(node);
			if (path && root && readsOuterBinding(root)) reads.push(path);
			visit(node.expression);
			return;
		}
		if (ts.isShorthandPropertyAssignment(node)) {
			if (readsOuterBinding(node.name)) reads.push(node.name.text);
			return;
		}
		if (ts.isPropertyAssignment(node)) {
			if (ts.isComputedPropertyName(node.name)) visit(node.name.expression);
			visit(node.initializer);
			return;
		}
		if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
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

function getReadRoot(node: ts.Expression): ts.Identifier | undefined {
	if (ts.isIdentifier(node)) return node;
	return ts.isPropertyAccessExpression(node) ? getReadRoot(node.expression) : undefined;
}

function isPathRead(path: string, reads: readonly string[]): boolean {
	return reads.some((read) => read === path || read.startsWith(`${path}.`) || path.startsWith(`${read}.`));
}
