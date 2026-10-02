import ts from "typescript";

// Shared by the source-level contracts that reason about React Compiler caching
// (i18n-reactivity-contract, number-format-reactivity-contract), so both recognize the same
// components and hooks and resolve names through the same lexical scopes.

const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo"]);
const ROUTE_COMPONENT_PROPERTIES = new Set(["component", "errorComponent", "notFoundComponent", "pendingComponent"]);

type TransparentExpression =
	| ts.AsExpression
	| ts.NonNullExpression
	| ts.ParenthesizedExpression
	| ts.SatisfiesExpression
	| ts.TypeAssertion;

export function parseSource(source: string, fileName: string): ts.SourceFile {
	const scriptKind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
	return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
}

// Parentheses, type assertions and non-null assertions do not change the value they wrap.
export function isTransparentExpression(node: ts.Node): node is TransparentExpression {
	return (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isTypeAssertionExpression(node) ||
		ts.isNonNullExpression(node)
	);
}

export function skipTransparentExpressions(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (isTransparentExpression(current)) current = current.expression;
	return current;
}

// The outermost expression that only wraps `node`; its parent is where the value is used.
export function outermostTransparentExpression(node: ts.Expression): ts.Expression {
	let current = node;
	while (isTransparentExpression(current.parent) && current.parent.expression === current) current = current.parent;
	return current;
}

// React Compiler infers components and hooks from a function's name, from the variable, assignment
// target or object key that receives it, and treats a memo or forwardRef callback as a component
// whatever its own name. The contracts recognize a superset that does not depend on what the
// compiler compiles today: wrappers may nest or be parenthesized or asserted, and an anonymous
// default export in a .tsx module and a route's component option are components too.
export function getComponentOrHookName(node: ts.SignatureDeclaration, fileName: string): string | undefined {
	const ownName = node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
	if (ownName !== undefined && isComponentOrHookName(ownName)) return ownName;
	if (ts.isMethodDeclaration(node)) {
		const isRouteOption = ts.isObjectLiteralExpression(node.parent) && ROUTE_COMPONENT_PROPERTIES.has(ownName ?? "");
		return isRouteOption ? ownName : undefined;
	}
	if (ts.isFunctionDeclaration(node)) {
		const isAnonymousDefault = ownName === undefined && hasModifier(node, ts.SyntaxKind.DefaultKeyword);
		return isAnonymousDefault && fileName.endsWith(".tsx") ? "<default>" : undefined;
	}
	if (!ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) return undefined;

	let value: ts.Expression = node;
	let wrapper: string | undefined;
	for (;;) {
		const parent = value.parent;
		if (isTransparentExpression(parent)) {
			value = parent;
		} else if (
			ts.isCallExpression(parent) &&
			parent.arguments[0] === value &&
			COMPONENT_WRAPPERS.has(calleeName(parent) ?? "")
		) {
			wrapper = calleeName(parent);
			value = parent;
		} else {
			break;
		}
	}
	const receiver = getReceivingName(value);
	if (receiver !== undefined) {
		const isRouteOption = ts.isPropertyAssignment(value.parent) && ROUTE_COMPONENT_PROPERTIES.has(receiver);
		return isComponentOrHookName(receiver) || wrapper !== undefined || isRouteOption ? receiver : undefined;
	}
	if (ts.isExportAssignment(value.parent)) {
		return wrapper !== undefined || (ownName === undefined && fileName.endsWith(".tsx")) ? "<default>" : undefined;
	}
	return wrapper === undefined ? undefined : (ownName ?? `<${wrapper}>`);
}

function getReceivingName(value: ts.Expression): string | undefined {
	const parent = value.parent;
	if (
		(ts.isVariableDeclaration(parent) || ts.isBindingElement(parent) || ts.isParameter(parent)) &&
		parent.initializer === value
	) {
		return ts.isIdentifier(parent.name) ? parent.name.text : undefined;
	}
	if (
		ts.isBinaryExpression(parent) &&
		parent.right === value &&
		parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
	) {
		if (ts.isIdentifier(parent.left)) return parent.left.text;
		return ts.isPropertyAccessExpression(parent.left) ? parent.left.name.text : undefined;
	}
	if (ts.isPropertyAssignment(parent) && parent.initializer === value) {
		return ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) ? parent.name.text : undefined;
	}
	return undefined;
}

export function isComponentOrHookName(name: string): boolean {
	return /^(?:[A-Z]|use[A-Z0-9])/.test(name);
}

export function calleeName(call: ts.CallExpression): string | undefined {
	const callee = skipTransparentExpressions(call.expression);
	if (ts.isIdentifier(callee)) return callee.text;
	if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
	return undefined;
}

export function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

// The innermost function, block, case block, catch clause or for statement between `identifier` and
// its source file that declares the identifier's name, or the source file when none does.
export function findDeclaringScope(identifier: ts.Identifier): ts.Node {
	for (let node: ts.Node = identifier.parent; !ts.isSourceFile(node); node = node.parent) {
		if (scopeDeclares(node, identifier.text)) return node;
	}
	return identifier.getSourceFile();
}

export function isWithin(node: ts.Node, ancestor: ts.Node): boolean {
	for (let current: ts.Node | undefined = node; current; current = current.parent) {
		if (current === ancestor) return true;
	}
	return false;
}

const scopeNameCache = new WeakMap<ts.Node, ReadonlySet<string>>();

function scopeDeclares(scope: ts.Node, name: string): boolean {
	let names = scopeNameCache.get(scope);
	if (!names) {
		names = new Set(collectScopeNames(scope).map((identifier) => identifier.text));
		scopeNameCache.set(scope, names);
	}
	return names.has(name);
}

function collectScopeNames(scope: ts.Node): ts.Identifier[] {
	const names: ts.Identifier[] = [];
	if (ts.isFunctionLike(scope)) {
		for (const parameter of scope.parameters) collectBindingIdentifiers(parameter.name, names);
		if (ts.isFunctionExpression(scope) && scope.name) names.push(scope.name);
	} else if (ts.isCatchClause(scope)) {
		if (scope.variableDeclaration) collectBindingIdentifiers(scope.variableDeclaration.name, names);
	} else if (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) {
		if (scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
			for (const declaration of scope.initializer.declarations) collectBindingIdentifiers(declaration.name, names);
		}
	} else if (ts.isBlock(scope) || ts.isCaseBlock(scope)) {
		const statements = ts.isBlock(scope) ? scope.statements : scope.clauses.flatMap((clause) => [...clause.statements]);
		for (const statement of statements) {
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					collectBindingIdentifiers(declaration.name, names);
				}
			} else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
				names.push(statement.name);
			}
		}
	}
	return names;
}

export function collectBindingIdentifiers(name: ts.BindingName, into: ts.Identifier[]): void {
	if (ts.isIdentifier(name)) {
		into.push(name);
		return;
	}
	for (const element of name.elements) {
		if (!ts.isOmittedExpression(element)) collectBindingIdentifiers(element.name, into);
	}
}
