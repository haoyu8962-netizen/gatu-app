import ts from "typescript";

// Shared by the source-level contracts that reason about React Compiler caching
// (i18n-reactivity-contract, number-format-reactivity-contract), so both recognize the same
// components and hooks and resolve names through the same lexical scopes.

const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo"]);
const ROUTE_COMPONENT_PROPERTIES = new Set(["component", "errorComponent", "notFoundComponent", "pendingComponent"]);
const MEMOIZATION_DIRECTIVES = new Set(["use forget", "use memo"]);

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

// babel-plugin-react-compiler 1.0.0 in its default infer mode visits function declarations,
// function expressions and arrow functions outside classes. It can compile one named like a component
// or hook, where the name is a function declaration's own or that of the variable a function
// expression or arrow function initializes (getFunctionName2; its assignment, object property and
// destructuring default branches compare Babel NodePath objects with primitives and never match in
// this version); a callback passed in any argument of memo or forwardRef, written plainly, as
// React.memo or as React[memo] (isReactAPI); and any function that opts in with "use memo" or
// "use forget". The contracts recognize a superset, so they do not depend on what the compiler
// compiles today: a function expression's own name, names from assignment targets, object and class
// properties and destructuring defaults, wrappers on any object or behind parentheses and assertions,
// string keys, an anonymous default export in a .tsx module and a route's component option, written
// as a function or a method. Recheck these rules when the compiler is upgraded or configured
// differently.
export function getComponentOrHookName(node: ts.SignatureDeclaration, fileName: string): string | undefined {
	const ownName = node.name === undefined ? undefined : getStaticName(node.name);
	if (ownName !== undefined && isComponentOrHookName(ownName)) return ownName;
	const inferred = inferComponentOrHookName(node, ownName, fileName);
	if (inferred !== undefined || !hasMemoizationDirective(node)) return inferred;
	const receiver =
		ts.isFunctionExpression(node) || ts.isArrowFunction(node)
			? getReceivingName(climbFunctionValue(node).value)
			: undefined;
	return ownName ?? receiver ?? "<use memo>";
}

function inferComponentOrHookName(
	node: ts.SignatureDeclaration,
	ownName: string | undefined,
	fileName: string,
): string | undefined {
	if (ts.isMethodDeclaration(node)) {
		const isRouteOption = ts.isObjectLiteralExpression(node.parent) && ROUTE_COMPONENT_PROPERTIES.has(ownName ?? "");
		return isRouteOption ? ownName : undefined;
	}
	if (ts.isFunctionDeclaration(node)) {
		const isAnonymousDefault = ownName === undefined && hasModifier(node, ts.SyntaxKind.DefaultKeyword);
		return isAnonymousDefault && fileName.endsWith(".tsx") ? "<default>" : undefined;
	}
	if (!ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) return undefined;
	const { value, wrapper } = climbFunctionValue(node);
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

// The expression that carries a function expression's value: past parentheses, assertions and any
// memo or forwardRef calls that receive it, with the outermost wrapper's name.
function climbFunctionValue(node: ts.Expression): { value: ts.Expression; wrapper: string | undefined } {
	let value = node;
	let wrapper: string | undefined;
	for (;;) {
		const parent = value.parent;
		if (isTransparentExpression(parent)) {
			value = parent;
		} else if (
			ts.isCallExpression(parent) &&
			parent.arguments.includes(value) &&
			COMPONENT_WRAPPERS.has(wrapperName(parent) ?? "")
		) {
			wrapper = wrapperName(parent);
			value = parent;
		} else {
			return { value, wrapper };
		}
	}
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
	if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && parent.initializer === value) {
		return getStaticName(parent.name);
	}
	if (ts.isShorthandPropertyAssignment(parent) && parent.objectAssignmentInitializer === value) return parent.name.text;
	return undefined;
}

export function getStaticName(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
	return ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression) ? name.expression.text : undefined;
}

function hasMemoizationDirective(node: ts.SignatureDeclaration): boolean {
	if (!ts.isFunctionDeclaration(node) && !ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) return false;
	if (!node.body || !ts.isBlock(node.body)) return false;
	for (const statement of node.body.statements) {
		if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
		if (MEMOIZATION_DIRECTIVES.has(statement.expression.text)) return true;
	}
	return false;
}

export function isComponentOrHookName(name: string): boolean {
	return /^(?:[A-Z]|use[A-Z0-9])/.test(name);
}

// The function a call names statically: an identifier, a property or a string-literal element key.
export function calleeName(call: ts.CallExpression): string | undefined {
	const callee = skipTransparentExpressions(call.expression);
	if (ts.isIdentifier(callee)) return callee.text;
	if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
	if (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)) {
		return callee.argumentExpression.text;
	}
	return undefined;
}

// The compiler's isReactAPI also takes React[memo], an element key that is an identifier named memo,
// although its value is unknown; only the wrapper check follows it, never hook semantics.
function wrapperName(call: ts.CallExpression): string | undefined {
	const callee = skipTransparentExpressions(call.expression);
	if (ts.isElementAccessExpression(callee) && ts.isIdentifier(callee.argumentExpression)) {
		return callee.argumentExpression.text;
	}
	return calleeName(call);
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
