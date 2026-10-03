import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import {
	collectBindingIdentifiers,
	findDeclaringScope,
	getStaticName,
	hasModifier,
	outermostTransparentExpression,
	parseSource,
	skipTransparentExpressions,
} from "./react-source";

// The module graph the source-level contracts share: what each module imports, declares and exports,
// and how a reference resolves across imports, re-exports, `export *`, aliases and namespace imports.
// Keys are `path#name`, with paths relative to the terminal `src` directory.

const SOURCE_ROOT = resolve(__dirname, "../../..");

export interface ModuleBinding {
	path: string | null;
	name: string;
}

export interface SourceModule {
	path: string;
	file: ts.SourceFile;
	imports: Map<string, ModuleBinding>;
	namespaces: Map<string, string | null>;
	reexports: Map<string, ModuleBinding>;
	starExports: (string | null)[];
	localExports: Map<string, string>;
	// Declarations other modules can import by name: those written with `export` and the default export.
	// A declaration without `export` stays local, so an `export *` of the same name is what importers get.
	exportedDeclarations: Set<string>;
	// The nodes a module-level name takes its value from: an initializer, plus the defaults on its
	// destructuring path, or the function or class declaration itself.
	declarations: Map<string, ts.Node[]>;
	// A name destructured from a namespace with a default or through a nested pattern takes its value
	// from the namespace export or from the defaults on its path.
	namespaceSources: Map<string, ModuleBinding>;
}

export function readSourceTree(directory: string): Map<string, string> {
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

export function describeModules(sources: Map<string, string>): Map<string, SourceModule> {
	const modules = new Map<string, SourceModule>();
	for (const [path, text] of sources) modules.set(path, describeModule(path, text, sources));
	return modules;
}

export function describeModule(path: string, text: string, sources: Map<string, string>): SourceModule {
	const file = parseSource(text, path);
	const module: SourceModule = {
		path,
		file,
		imports: new Map(),
		namespaces: new Map(),
		reexports: new Map(),
		starExports: [],
		localExports: new Map(),
		exportedDeclarations: new Set(),
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
			if (ts.isIdentifier(expression)) {
				module.localExports.set("default", expression.text);
			} else {
				module.declarations.set("default", [expression]);
				module.exportedDeclarations.add("default");
			}
		} else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
			const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
			const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
			if (statement.name) {
				module.declarations.set(statement.name.text, [statement]);
				if (isDefault) module.localExports.set("default", statement.name.text);
				else if (isExported) module.exportedDeclarations.add(statement.name.text);
			} else if (isDefault) {
				module.declarations.set("default", [statement]);
				module.exportedDeclarations.add("default");
			}
		} else if (ts.isVariableStatement(statement)) {
			const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
			for (const declaration of statement.declarationList.declarations) {
				if (!declaration.initializer) continue;
				describeVariable(module, declaration.name, declaration.initializer, exported);
				if (!exported) continue;
				const bound: ts.Identifier[] = [];
				collectBindingIdentifiers(declaration.name, bound);
				for (const identifier of bound) {
					if (module.declarations.has(identifier.text)) module.exportedDeclarations.add(identifier.text);
				}
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

export function getDestructuredKey(element: ts.BindingElement): string | undefined {
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

// At module scope a value that is called, or handed to a call, runs once at import; one that is only
// stored, as an alias, a bound copy or in a table, is checked where it is called.
export function runsAtImport(identifier: ts.Identifier): boolean {
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

export function resolveReference(
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
export function getNamespaceMember(identifier: ts.Identifier): string | undefined {
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

export function resolveCallee(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	call: ts.CallExpression,
): string | null {
	return followAliases(modules, resolveExpressionKey(modules, module, call.expression));
}

// The module-level key an expression names: an unshadowed identifier or a member of a namespace
// import. A member of anything else, such as `formatter.toString`, names no declaration.
export function resolveExpressionKey(
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
		if (ts.isIdentifier(object) && module.namespaces.has(object.text) && !isLocallyBound(object)) {
			return resolveReference(modules, module, object)?.key ?? null;
		}
	}
	return null;
}

// A module-level `const alias = name` is `name` under another name; the chain ends at a declaration.
export function followAliases(modules: Map<string, SourceModule>, key: string | null): string | null {
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

export function resolveBinding(
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

export function resolveExport(
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
	if (module.exportedDeclarations.has(name)) return key;
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

export function collectModuleReferences(
	modules: Map<string, SourceModule>,
	module: SourceModule,
	root: ts.Node,
): Set<string> {
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

export function isValueReference(identifier: ts.Identifier): boolean {
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

export function isLocallyBound(identifier: ts.Identifier): boolean {
	return !ts.isSourceFile(findDeclaringScope(identifier));
}

export function isInsideFunction(node: ts.Node): boolean {
	for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
		if (ts.isFunctionLike(current)) return true;
	}
	return false;
}
