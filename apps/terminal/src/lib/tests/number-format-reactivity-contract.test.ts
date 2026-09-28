import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = resolve(__dirname, "../../components");
const DOCUMENT_TITLE_SOURCE = readFileSync(resolve(__dirname, "../../hooks/use-document-title.ts"), "utf8");
const NUMBER_FORMATTERS = new Set([
	"formatLiquidationPrice",
	"formatNumber",
	"formatPercent",
	"formatPrice",
	"formatQuoteAmount",
	"formatToken",
	"formatUSD",
]);
const RENDER_HELPER_OWNERS = new Map([
	["funding-history-chart.tsx", ["FundingHistoryChart"]],
	["portfolio-performance-chart.tsx", ["PortfolioPerformanceChart"]],
	["mobile-market-bar.tsx", ["MobileMarketBar"]],
	["orders-tab.tsx", ["OrderRow"]],
	["order-toast.tsx", ["OrderToast"]],
	["leverage-position-limit-row.tsx", ["LeveragePositionLimitRow"]],
]);

describe("number format reactivity contract", () => {
	it("subscribes every component that formats localized numbers during render", () => {
		const violations: string[] = [];

		for (const filePath of findTsxFiles(COMPONENTS_DIR)) {
			const sourceText = readFileSync(filePath, "utf8");
			const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
			const formatterAliases = getNumberFormatterAliases(sourceFile);
			const helperOwners = RENDER_HELPER_OWNERS.get(basename(filePath)) ?? [];
			if (formatterAliases.size === 0 && helperOwners.length === 0) continue;

			const components = getFormattingComponents(sourceFile, formatterAliases);
			for (const owner of helperOwners) components.add(owner);

			for (const componentName of components) {
				const component = findFunction(sourceFile, componentName);
				if (!component?.body || !hasDirectNumberFormatSubscription(component)) {
					violations.push(`${filePath}: ${componentName}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it.each([
		["trade/orderbook/orderbook-row.tsx", "OrderbookRowComponent"],
		["trade/orderbook/trade-row.tsx", "TradeRowComponent"],
	])("keeps memoized row %s subscribed in its component body", (relativePath, componentName) => {
		const filePath = resolve(COMPONENTS_DIR, relativePath);
		const sourceFile = ts.createSourceFile(
			filePath,
			readFileSync(filePath, "utf8"),
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX,
		);
		const component = findFunction(sourceFile, componentName);

		expect(component?.body && hasDirectNumberFormatSubscription(component)).toBe(true);
	});

	it("recomputes the document title when the number format changes", () => {
		expect(DOCUMENT_TITLE_SOURCE).toContain("const numberFormatRevision = useNumberFormatRevision()");
		expect(DOCUMENT_TITLE_SOURCE).toContain('style: "decimal"');
		expect(DOCUMENT_TITLE_SOURCE).toContain("[isSpot, markPx, numberFormatRevision, pairName, szDecimals]");
	});
});

function findTsxFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) return findTsxFiles(entryPath);
		return entry.name.endsWith(".tsx") ? [entryPath] : [];
	});
}

function getNumberFormatterAliases(sourceFile: ts.SourceFile): Set<string> {
	const aliases = new Set<string>();
	for (const statement of sourceFile.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			statement.moduleSpecifier.text !== "@/lib/format"
		) {
			continue;
		}
		const bindings = statement.importClause?.namedBindings;
		if (!bindings || !ts.isNamedImports(bindings)) continue;
		for (const element of bindings.elements) {
			if (NUMBER_FORMATTERS.has(element.propertyName?.text ?? element.name.text)) aliases.add(element.name.text);
		}
	}
	return aliases;
}

function getFormattingComponents(sourceFile: ts.SourceFile, formatterAliases: Set<string>): Set<string> {
	const components = new Set<string>();
	const visit = (node: ts.Node) => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && formatterAliases.has(node.expression.text)) {
			for (let parent = node.parent; parent; parent = parent.parent) {
				if (!isFunctionLikeDeclaration(parent)) continue;
				const name = getFunctionName(parent);
				if (name && /^[A-Z]/.test(name)) {
					components.add(name);
					break;
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return components;
}

function findFunction(sourceFile: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | undefined {
	let match: ts.FunctionLikeDeclaration | undefined;
	const visit = (node: ts.Node) => {
		if (isFunctionLikeDeclaration(node) && getFunctionName(node) === name) match = node;
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return match;
}

function getFunctionName(node: ts.FunctionLikeDeclaration): string | undefined {
	if (node.name && ts.isIdentifier(node.name)) return node.name.text;
	if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
	return undefined;
}

function isFunctionLikeDeclaration(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node)
	);
}

function hasDirectNumberFormatSubscription(component: ts.FunctionLikeDeclaration): boolean {
	if (!component.body || !ts.isBlock(component.body)) return false;
	return component.body.statements.some((statement) =>
		getStatementExpressions(statement).some(isNumberFormatRevisionCall),
	);
}

function getStatementExpressions(statement: ts.Statement): ts.Expression[] {
	if (ts.isExpressionStatement(statement)) return [statement.expression];
	if (!ts.isVariableStatement(statement)) return [];
	return statement.declarationList.declarations.flatMap((declaration) =>
		declaration.initializer ? [declaration.initializer] : [],
	);
}

function isNumberFormatRevisionCall(expression: ts.Expression): boolean {
	return (
		ts.isCallExpression(expression) &&
		ts.isIdentifier(expression.expression) &&
		expression.expression.text === "useNumberFormatRevision" &&
		expression.arguments.length === 0
	);
}
