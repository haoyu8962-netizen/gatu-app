import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	FUNDS_MODAL_BODY_CLASS,
	FUNDS_MODAL_BODY_SLOT,
	FUNDS_MODAL_BODY_TOP_PADDING_CLASS,
	FUNDS_MODAL_HEADER_CLASS,
	FUNDS_MODAL_HEADING_CLASS,
	FUNDS_MODAL_HEADING_SLOT,
	FUNDS_MODAL_LEADING_HEADING_CLASS,
	FUNDS_MODAL_POPUP_CLASS,
} from "@/lib/ui/funds-modal-scroll";
import { parseSource } from "./harness/react-source";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const UI_PACKAGE_ROOT = resolve(SOURCE_ROOT, "../../../packages/ui/src");

// Every dialog of the Deposit / Withdraw / Bridge flow keeps its header fixed and scrolls only its
// body, with the scrollbar hidden, on the desktop modal and the phone sheet alike
// (.claude/rules/style-ui-guide.md, Dialog chrome). tests/browser/account-actions.pw.ts measures the
// rendered result; this file only checks the shape of the source.
const FUNDS_DIALOG_SOURCES = [
	"components/trade/components/funds-modal-shell.tsx",
	"components/trade/tradebox/deposit/shared-ui.tsx",
];
// The flow is the deposit directory plus every project file these entries reach through imports.
const FUNDS_FLOW_ENTRIES = [
	"components/trade/tradebox/deposit-modal.tsx",
	"components/trade/components/deposit-modal-host.tsx",
	"components/trade/components/deposit-modal-loading-fallback.tsx",
];
// The host mounts the shell once and hands it the back button; the dialog body only reports it.
const BACK_BUTTON_DIALOG = FUNDS_FLOW_ENTRIES[1];
const FUNDS_FLOW_DIRECTORY = "components/trade/tradebox/deposit";
// Where the walk stops. The wrapper is itself counted as a primitive: its popup, header and body
// come from the shell. A dialog of another feature reached through shared code is added here with
// its reason, never left to fail or listed above.
const FUNDS_FLOW_BOUNDARIES = [
	"components/trade/components/pending-action-modal.tsx",
	// The registry of every lazy global modal: the host takes the lazy deposit body from it by name,
	// and following its dynamic imports would walk into the dialogs of every other feature.
	"components/trade/components/lazy-global-modals.ts",
];
const UI_PACKAGE = "@sairn/ui";
// The UI package builds dialogs in these two modules only, and its entry re-exports them by name.
const UI_DIALOG_MODULES = ["modal.tsx", "drawer.tsx"];
const UI_ENTRY = "index.ts";
const BASE_UI_COMPONENT = /^@base-ui\/react\/([a-z-]+)$/;
const BASE_UI_DIALOGS = ["dialog", "alert-dialog", "drawer"];
// Every value export of those two modules has one of three roles; a new export fails the
// classification test until it is given one, and an export form the test cannot read fails as well.
const UI_DIALOG_SURFACES = ["AdaptiveModal", "Modal", "ModalPopup", "Drawer", "DrawerContent"];
const UI_DIALOG_PARTS = ["ModalHeader", "ModalContent"];
const UI_DIALOG_INERT = [
	"ModalTrigger",
	"ModalClose",
	"ModalTitle",
	"ModalDescription",
	"ModalFooter",
	"modalPopupVariants",
	"DrawerTrigger",
	"DrawerClose",
	"DrawerOverlay",
	"DrawerHeader",
	"DrawerTitle",
	"DrawerDescription",
	"DrawerBody",
	"DrawerFooter",
	"drawerContentVariants",
];
const DIALOG_PRIMITIVES = new Set([...UI_DIALOG_SURFACES, "PendingActionModal"]);
const DIALOG_PARTS = new Set(UI_DIALOG_PARTS);
const ASSET_SPECIFIER = /\.(?:css|json|svg|png|webp)$/;
const SCROLL_MODULE = "lib/ui/funds-modal-scroll.ts";
const SCROLL_CONSTANTS = [
	"FUNDS_MODAL_BODY_CLASS",
	"FUNDS_MODAL_BODY_SLOT",
	"FUNDS_MODAL_HEADER_CLASS",
	"FUNDS_MODAL_POPUP_CLASS",
];
const CLASS_MERGE_MODULE = "lib/cn.ts";
// The shell's back button is one function: the dialog and the browser fixture both call it, so the
// element the browser test measures is the element the dialog ships.
const BACK_BUTTON_MODULE = "components/trade/components/funds-modal-back-button.tsx";
const BACK_BUTTON_RENDERER = "renderFundsModalBackButton";
const BACK_BUTTON_FIXTURE = "../tests/browser/funds-forms.fixture.tsx";
const SELF_TEST_FILE = `${FUNDS_FLOW_DIRECTORY}/self-test.tsx`;

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

/** `specifier` is null when the module name is computed at run time. */
type ModuleReference =
	| { kind: "import"; specifier: string | null; node: ts.ImportDeclaration }
	| { kind: "re-export"; specifier: string | null; node: ts.ExportDeclaration }
	| { kind: "load"; specifier: string | null; node: ts.Node };

type Resolution = { kind: "package" } | { kind: "asset" } | { kind: "source"; file: string } | { kind: "unresolved" };

interface DialogUse {
	/** Value imports of a dialog primitive, by the name the primitive was exported under. */
	imported: string[];
	/** Every identifier outside the imports that names an imported primitive. */
	primitiveReferences: ts.Identifier[];
	/** Every identifier outside the imports that names an imported `ModalHeader` or `ModalContent`. */
	partReferences: ts.Identifier[];
	/** Local name of each imported primitive, header and body, mapped to its exported name. */
	locals: Map<string, string>;
	/** Every route to a primitive that is not a named import, described for the failure message. */
	indirect: string[];
	/** Elements with children whose tag is an imported primitive. */
	dialogElements: ts.JsxElement[];
	source: ts.SourceFile;
}

interface DialogShape {
	dialog: ts.JsxOpeningElement;
	header: JsxTag;
	body: JsxTag;
}

function read(file: string): string {
	return readFileSync(resolve(SOURCE_ROOT, file), "utf8");
}

function isSource(name: string): boolean {
	return /\.tsx?$/.test(name) && !name.endsWith(".d.ts");
}

function listSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return listSources(path);
		return isSource(entry.name) ? [relative(SOURCE_ROOT, path)] : [];
	});
}

/**
 * What a module name stands for. A relative or `@/` name must be a source file under `src` (as
 * written, with `.ts` / `.tsx` added, or a directory index) or an existing asset; any other form,
 * such as a `.js` name for a `.ts` file, is unresolved, and the flow test fails on it instead of
 * skipping the file behind it.
 */
function resolveSpecifier(from: string, specifier: string): Resolution {
	const isAlias = specifier.startsWith("@/");
	if (!isAlias && !specifier.startsWith(".")) return { kind: "package" };
	const base = isAlias ? resolve(SOURCE_ROOT, specifier.slice(2)) : resolve(SOURCE_ROOT, dirname(from), specifier);
	const candidates = [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")];
	const found = candidates.find((candidate) => isSource(candidate) && existsSync(candidate));
	const file = found ? relative(SOURCE_ROOT, found) : null;
	if (file && !file.startsWith("..")) return { kind: "source", file };
	return !file && ASSET_SPECIFIER.test(specifier) && existsSync(base) ? { kind: "asset" } : { kind: "unresolved" };
}

function readLiteral(expression: ts.Expression | undefined): string | null {
	return expression && ts.isStringLiteralLike(expression) ? expression.text : null;
}

/** False for `import type`, `export type` and a list whose every name carries an inline `type`. */
function carriesValues(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
	if (ts.isExportDeclaration(node)) {
		if (node.isTypeOnly) return false;
		const names = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : null;
		return !names || names.length === 0 || names.some((element) => !element.isTypeOnly);
	}
	const clause = node.importClause;
	if (!clause) return true;
	if (clause.isTypeOnly) return false;
	const bindings = clause.namedBindings;
	if (clause.name || !bindings || ts.isNamespaceImport(bindings)) return true;
	return bindings.elements.length === 0 || bindings.elements.some((element) => !element.isTypeOnly);
}

function isImportMetaCall(node: ts.CallExpression): boolean {
	return ts.isPropertyAccessExpression(node.expression) && ts.isMetaProperty(node.expression.expression);
}

/** `import()`, `require()` and `import.meta.*()` calls such as `import.meta.glob()`. */
function isModuleLoad(node: ts.Node): node is ts.CallExpression {
	if (!ts.isCallExpression(node)) return false;
	const callee = node.expression;
	return (
		callee.kind === ts.SyntaxKind.ImportKeyword ||
		(ts.isIdentifier(callee) && callee.text === "require") ||
		isImportMetaCall(node)
	);
}

/** Every import, re-export and run-time load that can carry a value; type-only forms are left out. */
function listModuleReferences(source: ts.SourceFile): ModuleReference[] {
	const references: ModuleReference[] = [];
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node) && carriesValues(node)) {
			references.push({ kind: "import", specifier: readLiteral(node.moduleSpecifier), node });
		}
		if (ts.isExportDeclaration(node) && node.moduleSpecifier && carriesValues(node)) {
			references.push({ kind: "re-export", specifier: readLiteral(node.moduleSpecifier), node });
		}
		if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
			references.push({ kind: "load", specifier: readLiteral(node.moduleReference.expression), node });
		}
		if (isModuleLoad(node)) {
			references.push({
				kind: "load",
				specifier: isImportMetaCall(node) ? null : readLiteral(node.arguments[0]),
				node,
			});
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return references;
}

/** The deposit directory and every project file the entries reach, up to the boundaries. */
function walkFundsFlow(): { files: string[]; unresolved: string[] } {
	const seen = new Set<string>();
	const unresolved: string[] = [];
	const queue = [...FUNDS_FLOW_ENTRIES, ...listSources(resolve(SOURCE_ROOT, FUNDS_FLOW_DIRECTORY))];
	for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
		if (seen.has(file) || FUNDS_FLOW_BOUNDARIES.includes(file)) continue;
		seen.add(file);
		for (const { specifier } of listModuleReferences(parseSource(read(file), file))) {
			if (specifier === null) continue;
			const resolution = resolveSpecifier(file, specifier);
			if (resolution.kind === "source") queue.push(resolution.file);
			if (resolution.kind === "unresolved") unresolved.push(`${file}: ${specifier}`);
		}
	}
	return { files: [...seen].sort(), unresolved };
}

/** The UI package, or the project wrapper the walk stops at, whichever way its file is named. */
function exportsDialogPrimitives(from: string, specifier: string): boolean {
	if (specifier === UI_PACKAGE || specifier.startsWith(`${UI_PACKAGE}/`)) return true;
	const resolution = resolveSpecifier(from, specifier);
	return resolution.kind === "source" && FUNDS_FLOW_BOUNDARIES.includes(resolution.file);
}

function reexportsPrimitiveName(node: ts.ExportDeclaration): boolean {
	const names = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : [];
	return names.some(
		(element) => !element.isTypeOnly && DIALOG_PRIMITIVES.has((element.propertyName ?? element.name).text),
	);
}

function describeDialogUse(text: string, fileName = SELF_TEST_FILE): DialogUse {
	const source = parseSource(text, fileName);
	const locals = new Map<string, string>();
	const namespaces = new Set<string>();
	const indirect: string[] = [];

	for (const reference of listModuleReferences(source)) {
		const { specifier } = reference;
		const reachesPrimitives = specifier === null || exportsDialogPrimitives(fileName, specifier);
		if (reference.kind === "load") {
			if (reachesPrimitives) indirect.push(`module loaded at run time: ${reference.node.getText()}`);
			continue;
		}
		if (reference.kind === "re-export") {
			if (reachesPrimitives || reexportsPrimitiveName(reference.node)) indirect.push(`re-export from ${specifier}`);
			continue;
		}
		const clause = reference.node.importClause;
		if (!clause) continue;
		if (clause.name && reachesPrimitives) indirect.push(`default import of ${specifier}`);
		const bindings = clause.namedBindings;
		if (!bindings) continue;
		if (ts.isNamespaceImport(bindings)) {
			namespaces.add(bindings.name.text);
			if (reachesPrimitives) indirect.push(`namespace import of ${specifier}`);
			continue;
		}
		for (const element of bindings.elements) {
			if (element.isTypeOnly) continue;
			const exportedName = (element.propertyName ?? element.name).text;
			if (DIALOG_PRIMITIVES.has(exportedName) || DIALOG_PARTS.has(exportedName)) {
				locals.set(element.name.text, exportedName);
			}
		}
	}

	const primitiveReferences: ts.Identifier[] = [];
	const partReferences: ts.Identifier[] = [];
	const dialogElements: ts.JsxElement[] = [];
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node)) return;
		if (ts.isExportDeclaration(node) && node.moduleSpecifier) return;
		if (ts.isIdentifier(node)) {
			const exportedName = locals.get(node.text);
			if (exportedName && DIALOG_PRIMITIVES.has(exportedName)) primitiveReferences.push(node);
			if (exportedName && DIALOG_PARTS.has(exportedName)) partReferences.push(node);
			if (namespaces.has(node.text)) {
				const parent = node.parent;
				const readsMember = ts.isPropertyAccessExpression(parent) && parent.expression === node;
				const readsType = ts.isQualifiedName(parent) && parent.left === node;
				if (readsMember && DIALOG_PRIMITIVES.has(parent.name.text))
					indirect.push(`namespace member ${parent.getText()}`);
				if (!readsMember && !readsType) indirect.push(`namespace ${node.text} read without a member name`);
			}
		}
		if (
			ts.isJsxElement(node) &&
			ts.isIdentifier(node.openingElement.tagName) &&
			DIALOG_PRIMITIVES.has(locals.get(node.openingElement.tagName.text) ?? "")
		) {
			dialogElements.push(node);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);

	return {
		imported: [...locals.values()].filter((name) => DIALOG_PRIMITIVES.has(name)),
		primitiveReferences,
		partReferences,
		locals,
		indirect,
		dialogElements,
		source,
	};
}

/**
 * A file can reach a primitive through a named value import, or through a route this check does not
 * interpret: a namespace or default import of a module that exports primitives, a re-export, a
 * module loaded at run time (that module, or any computed name), a namespace member named like a
 * primitive, or any namespace read without a member name (brackets, destructuring, passing it on).
 */
function usesDialogPrimitive(use: DialogUse): boolean {
	return use.imported.length > 0 || use.indirect.length > 0;
}

function getTag(node: JsxNode): JsxTag {
	return ts.isJsxElement(node) ? node.openingElement : node;
}

function listTags(node: JsxNode): ts.Node[] {
	return ts.isJsxElement(node) ? [node.openingElement, node.closingElement] : [node];
}

/** True when the references are exactly the tag names of the given elements. */
function nameOnlyTags(references: ts.Identifier[], elements: JsxNode[]): boolean {
	const tags = elements.flatMap(listTags);
	return references.length === tags.length && references.every((reference) => tags.includes(reference.parent));
}

function readPart(use: DialogUse, node: ts.JsxChild | undefined, name: string): JsxNode | null {
	if (!node || !(ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) return null;
	const tagName = getTag(node).tagName;
	return ts.isIdentifier(tagName) && use.locals.get(tagName.text) === name ? node : null;
}

function takesPropsFromElsewhere(tag: JsxTag): boolean {
	return tag.attributes.properties.some(
		(attribute) => ts.isJsxSpreadAttribute(attribute) || attribute.name.getText() === "children",
	);
}

/**
 * The file's only dialog, or null unless it is written in the one accepted form: a single source
 * element whose children are one `ModalHeader` followed by one `ModalContent` and nothing else,
 * where those three elements' tags are the only places the file names a dialog primitive, a header
 * or a body, none of them takes a spread or a `children` attribute, and the file has no other route
 * to a primitive. Everything else (a second element, a self-closing dialog, `createElement`, a copy
 * in a variable, a header nested in the body, a third child) is rejected rather than interpreted.
 * It counts source elements, not the instances a loop or a reused value renders.
 */
function readDialogShape(use: DialogUse): DialogShape | null {
	if (use.indirect.length > 0 || use.dialogElements.length !== 1) return null;
	const [dialog] = use.dialogElements;
	if (!nameOnlyTags(use.primitiveReferences, [dialog])) return null;

	const children = dialog.children.filter((child) => !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces));
	const header = readPart(use, children[0], "ModalHeader");
	const body = readPart(use, children[1], "ModalContent");
	if (children.length !== 2 || !header || !body) return null;
	if (!nameOnlyTags(use.partReferences, [header, body])) return null;

	const shape = { dialog: dialog.openingElement, header: getTag(header), body: getTag(body) };
	return Object.values(shape).some(takesPropsFromElsewhere) ? null : shape;
}

function getAttribute(tag: JsxTag, name: string): ts.Expression | undefined {
	for (const attribute of tag.attributes.properties) {
		if (!ts.isJsxAttribute(attribute) || attribute.name.getText() !== name) continue;
		const initializer = attribute.initializer;
		if (initializer && ts.isJsxExpression(initializer)) return initializer.expression;
		return initializer;
	}
	return undefined;
}

/** True when the class value is the constant itself or a `cn()` call that starts with it. */
function startsWithConstant(expression: ts.Expression | undefined, constant: string): boolean {
	if (!expression) return false;
	if (ts.isIdentifier(expression)) return expression.text === constant;
	if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return false;
	const first = expression.arguments[0];
	return (
		expression.expression.text === "cn" && first !== undefined && ts.isIdentifier(first) && first.text === constant
	);
}

/** True when every name is a plain, unaliased value import from the module, however it is named. */
function importsPlainly(source: ts.SourceFile, moduleFile: string, names: string[]): boolean {
	const imported = source.statements.filter(ts.isImportDeclaration).flatMap((statement) => {
		const specifier = readLiteral(statement.moduleSpecifier);
		const resolution = specifier === null ? null : resolveSpecifier(source.fileName, specifier);
		if (resolution?.kind !== "source" || resolution.file !== moduleFile) return [];
		const clause = statement.importClause;
		const bindings = clause && !clause.isTypeOnly ? clause.namedBindings : undefined;
		return bindings && ts.isNamedImports(bindings)
			? bindings.elements
					.filter((element) => !element.propertyName && !element.isTypeOnly)
					.map((element) => element.name.text)
			: [];
	});
	return names.every((name) => imported.includes(name));
}

function declaresBinding(node: ts.Identifier): boolean {
	const parent = node.parent;
	const declares =
		ts.isVariableDeclaration(parent) ||
		ts.isParameter(parent) ||
		ts.isBindingElement(parent) ||
		ts.isFunctionDeclaration(parent) ||
		ts.isFunctionExpression(parent) ||
		ts.isClassDeclaration(parent) ||
		ts.isClassExpression(parent) ||
		ts.isEnumDeclaration(parent) ||
		ts.isModuleDeclaration(parent) ||
		ts.isImportEqualsDeclaration(parent);
	return declares && parent.name === node;
}

/** True when the file binds one of the names itself, which would shadow the import somewhere. */
function redeclares(source: ts.SourceFile, names: string[]): boolean {
	let found = false;
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node)) return;
		if (ts.isIdentifier(node) && names.includes(node.text) && declaresBinding(node)) found = true;
		ts.forEachChild(node, visit);
	}
	visit(source);
	return found;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

/**
 * Names a module exports as values: `export { … }` lists, with or without a module name, and
 * exported `const`, `function` and `class` declarations. Types are left out. Every other way to
 * export a value (default, `export =`, `export *`, `export * as`, an enum, a namespace, a
 * destructuring declaration) throws, so a module this cannot read fails its test.
 */
function listValueExports(text: string, fileName: string): string[] {
	const unsupported = (statement: ts.Node) =>
		new Error(`${fileName} exports a value in a form this contract does not read: ${statement.getText().slice(0, 80)}`);
	return parseSource(text, fileName).statements.flatMap((statement) => {
		if (ts.isExportAssignment(statement)) throw unsupported(statement);
		if (ts.isExportDeclaration(statement)) {
			if (statement.isTypeOnly) return [];
			const names = statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause : null;
			if (!names) throw unsupported(statement);
			return names.elements.filter((element) => !element.isTypeOnly).map((element) => element.name.text);
		}
		if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) return [];
		if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return [];
		if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) throw unsupported(statement);
		if (ts.isVariableStatement(statement)) {
			return statement.declarationList.declarations.map((declaration) => {
				if (!ts.isIdentifier(declaration.name)) throw unsupported(statement);
				return declaration.name.text;
			});
		}
		if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
			return [statement.name.text];
		}
		throw unsupported(statement);
	});
}

/** The file of the UI package a relative module name stands for, or null when it names none. */
function resolveUiSpecifier(from: string, specifier: string): string | null {
	const base = resolve(UI_PACKAGE_ROOT, dirname(from), specifier);
	const candidates = [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")];
	const found = candidates.find((candidate) => isSource(candidate) && existsSync(candidate));
	const file = found ? relative(UI_PACKAGE_ROOT, found) : null;
	return file && !file.startsWith("..") ? file : null;
}

/**
 * True when a module name in a file of the UI package can hand that file a dialog implementation:
 * the modal or drawer module or the entry, by whatever relative path; the package's own name; Base
 * UI's dialog, alert-dialog or drawer; and every name this cannot read (a computed name, a relative
 * name that resolves to no file, any `@base-ui` name that is not `@base-ui/react/<component>`).
 */
function reachesUiDialog(from: string, specifier: string | null): boolean {
	if (specifier === null) return true;
	if (specifier.startsWith(".")) {
		const file = resolveUiSpecifier(from, specifier);
		return file === null ? !ASSET_SPECIFIER.test(specifier) : [...UI_DIALOG_MODULES, UI_ENTRY].includes(file);
	}
	if (specifier === UI_PACKAGE || specifier.startsWith(`${UI_PACKAGE}/`)) return true;
	if (!specifier.startsWith("@base-ui/")) return false;
	const component = BASE_UI_COMPONENT.exec(specifier)?.[1];
	return component === undefined || BASE_UI_DIALOGS.includes(component);
}

/** Files of the UI package, other than the given ones, that can reach a dialog implementation. */
function listUiDialogDependents(except: string[]): string[] {
	return readdirSync(UI_PACKAGE_ROOT)
		.filter((file) => isSource(file) && !except.includes(file))
		.filter((file) =>
			listModuleReferences(parseSource(readFileSync(resolve(UI_PACKAGE_ROOT, file), "utf8"), file)).some((reference) =>
				reachesUiDialog(file, reference.specifier),
			),
		);
}

/** True when the entry is nothing but unaliased `export { … } from` lists of files of the package. */
function reexportsByNameOnly(text: string): boolean {
	return parseSource(text, UI_ENTRY).statements.every((statement) => {
		if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) return false;
		const names = statement.exportClause;
		const specifier = readLiteral(statement.moduleSpecifier);
		if (!names || !ts.isNamedExports(names) || specifier === null || !specifier.startsWith(".")) return false;
		return resolveUiSpecifier(UI_ENTRY, specifier) !== null && names.elements.every((element) => !element.propertyName);
	});
}

/** Parentheses and JSX expression containers do not change the value they wrap. */
function unwrap(node: ts.Expression | undefined): ts.Expression | undefined {
	let current = node;
	while (current && ts.isParenthesizedExpression(current)) current = current.expression;
	return current;
}

/**
 * True when the file hands the shell its back button in the one accepted form: a single
 * `headerStart` attribute whose value is the shared renderer called directly, or a conditional that
 * yields that call or `null`. The renderer must be a plain import of its module that the file does
 * not redeclare, that call must be the file's only mention of it, and the element that takes the
 * attribute may not take a spread. A wrapper element around the call, `cloneElement`, a variable or
 * a second use is rejected: each of them could put the shipped button on a layer the browser fixture
 * does not render. This is a shape check; `deposit-modal-withdrawal-routing-guard` renders the real
 * dialog and compares the button it ships with the renderer's.
 */
function passesBackButtonUnchanged(text: string, fileName: string): boolean {
	const source = parseSource(text, fileName);
	if (!importsPlainly(source, BACK_BUTTON_MODULE, [BACK_BUTTON_RENDERER])) return false;
	if (redeclares(source, [BACK_BUTTON_RENDERER])) return false;

	const mentions: ts.Identifier[] = [];
	const attributes: ts.JsxAttribute[] = [];
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node)) return;
		if (ts.isIdentifier(node) && node.text === BACK_BUTTON_RENDERER) mentions.push(node);
		if (ts.isJsxAttribute(node) && node.name.getText() === "headerStart") attributes.push(node);
		ts.forEachChild(node, visit);
	}
	visit(source);
	if (mentions.length !== 1 || attributes.length !== 1) return false;

	const initializer = attributes[0].initializer;
	const value = unwrap(initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined);
	if (attributes[0].parent.properties.some(ts.isJsxSpreadAttribute)) return false;
	const isRendererCall = (node: ts.Expression | undefined) =>
		node !== undefined && ts.isCallExpression(node) && unwrap(node.expression) === mentions[0];
	const isNull = (node: ts.Expression | undefined) => node?.kind === ts.SyntaxKind.NullKeyword;
	if (isRendererCall(value)) return true;
	if (!value || !ts.isConditionalExpression(value)) return false;
	const branches = [unwrap(value.whenTrue), unwrap(value.whenFalse)];
	return branches.some(isRendererCall) && branches.every((branch) => isRendererCall(branch) || isNull(branch));
}

function usesSharedNames(source: ts.SourceFile): boolean {
	return (
		importsPlainly(source, SCROLL_MODULE, SCROLL_CONSTANTS) &&
		importsPlainly(source, CLASS_MERGE_MODULE, ["cn"]) &&
		!redeclares(source, [...SCROLL_CONSTANTS, "cn"])
	);
}

const ACCEPTED_IMPORTS = `import { AdaptiveModal, ModalContent, ModalHeader } from "@sairn/ui";
import { cn } from "@/lib/cn";
import { FUNDS_MODAL_BODY_CLASS, FUNDS_MODAL_BODY_SLOT, FUNDS_MODAL_HEADER_CLASS, FUNDS_MODAL_POPUP_CLASS } from "@/lib/ui/funds-modal-scroll";`;
const ACCEPTED_DIALOG =
	"<AdaptiveModal open className={FUNDS_MODAL_POPUP_CLASS}><ModalHeader className={FUNDS_MODAL_HEADER_CLASS} /><ModalContent data-slot={FUNDS_MODAL_BODY_SLOT} className={cn(FUNDS_MODAL_BODY_CLASS, x)}>body</ModalContent></AdaptiveModal>";

function describeVariant(body: string, prelude = ""): DialogUse {
	return describeDialogUse(`${prelude}\n${ACCEPTED_IMPORTS}\nconst a = ${body};`);
}

describe("funds modal scroll contract", () => {
	it("clips the popup and scrolls only the body, without a visible scrollbar", () => {
		expect(FUNDS_MODAL_POPUP_CLASS).toBe("!overflow-hidden");
		expect(FUNDS_MODAL_HEADER_CLASS).toBe("shrink-0");
		expect(FUNDS_MODAL_BODY_CLASS.split(" ")).toEqual([
			"min-h-0",
			"flex-1",
			"overflow-y-auto",
			"overscroll-y-contain",
			"[scrollbar-width:none]",
			"[&::-webkit-scrollbar]:hidden",
		]);
		expect(FUNDS_MODAL_BODY_SLOT).toBe("funds-modal-body");
	});

	it("sticks a form heading to the top edge of the body on the dialog surface", () => {
		const padding = /^pt-(\d+)$/.exec(FUNDS_MODAL_BODY_TOP_PADDING_CLASS)?.[1];

		expect(padding).toBeDefined();
		expect(FUNDS_MODAL_HEADING_CLASS.split(" ")).toEqual(["sticky", `-top-${padding}`, "z-1", "bg-modal"]);
		expect(FUNDS_MODAL_LEADING_HEADING_CLASS.split(" ")).toEqual([
			...FUNDS_MODAL_HEADING_CLASS.split(" "),
			`-mt-${padding}`,
			`pt-${padding}`,
		]);
		expect(FUNDS_MODAL_HEADING_SLOT).toBe("funds-modal-heading");
		expect(read(FUNDS_DIALOG_SOURCES[0])).toContain("cn(FUNDS_MODAL_BODY_TOP_PADDING_CLASS,");
	});

	it("builds the back button of the dialog and of the browser fixture with one renderer", () => {
		const renderer = read(BACK_BUTTON_MODULE);
		const closeLayer = /absolute top-4 right-4 (z-\d+)/.exec(
			readFileSync(resolve(UI_PACKAGE_ROOT, "modal.tsx"), "utf8"),
		)?.[1];
		const bandLayer = Number(/\bz-(\d+)\b/.exec(FUNDS_MODAL_HEADING_CLASS)?.[1]);

		expect(passesBackButtonUnchanged(read(BACK_BUTTON_DIALOG), BACK_BUTTON_DIALOG)).toBe(true);
		expect(read(FUNDS_FLOW_ENTRIES[0])).not.toContain(BACK_BUTTON_RENDERER);
		expect(passesBackButtonUnchanged(read(BACK_BUTTON_FIXTURE), BACK_BUTTON_FIXTURE)).toBe(true);
		expect(closeLayer).toBe("z-10");
		expect(Number(closeLayer?.slice(2))).toBeGreaterThan(bandLayer);
		expect(renderer.split(` ${closeLayer} `)).toHaveLength(2);
	});

	it.each([
		{ name: "a direct call", value: "renderFundsModalBackButton({ label, onClick })" },
		{ name: "a conditional call", value: "canReturn ? renderFundsModalBackButton({ label, onClick }) : null" },
		{
			name: "a parenthesised conditional call",
			value: "canReturn ? (renderFundsModalBackButton({ label, onClick })) : (null)",
		},
		{ name: "a call through a parenthesised name", value: "(renderFundsModalBackButton)({ label, onClick })" },
	])("accepts a back button handed over as $name", ({ value }) => {
		const text = `import { renderFundsModalBackButton } from "@/components/trade/components/funds-modal-back-button";\nconst a = <FundsModalShell headerStart={${value}} />;`;

		expect(passesBackButtonUnchanged(text, SELF_TEST_FILE)).toBe(true);
	});

	it.each([
		{
			name: "a wrapper on a lower layer",
			value: '<div className="relative z-0">{renderFundsModalBackButton({ label, onClick })}</div>',
		},
		{
			name: "a cloned element",
			value: 'cloneElement(renderFundsModalBackButton({ label, onClick }), { className: "z-0" })',
		},
		{
			name: "another element in one branch",
			value: "canReturn ? renderFundsModalBackButton({ label, onClick }) : <Other />",
		},
		{
			name: "a variable",
			value: "backButton",
			prelude: "const backButton = renderFundsModalBackButton({ label, onClick });",
		},
		{
			name: "a second use",
			value: "renderFundsModalBackButton({ label, onClick })",
			prelude: "const again = renderFundsModalBackButton({ label, onClick });",
		},
		{ name: "its own button", value: '<ButtonIcon aria-label="Back" className="absolute z-0" />' },
		{
			name: "a spread that can replace it",
			value: "renderFundsModalBackButton({ label, onClick })} {...{ headerStart: <button /> }",
		},
		{ name: "no back button", value: "null" },
		{
			name: "a renderer of its own",
			value: "renderFundsModalBackButton({ label, onClick })",
			imports: 'import { renderFundsModalBackButton } from "./back-button";',
		},
		{
			name: "an aliased renderer",
			value: "render({ label, onClick })",
			imports:
				'import { renderFundsModalBackButton as render } from "@/components/trade/components/funds-modal-back-button";',
		},
	])("does not accept a back button handed over as $name", ({ value, prelude = "", imports }) => {
		const header =
			imports ?? 'import { renderFundsModalBackButton } from "@/components/trade/components/funds-modal-back-button";';
		const text = `${header}\n${prelude}\nconst a = <FundsModalShell headerStart={${value}} />;`;

		expect(passesBackButtonUnchanged(text, SELF_TEST_FILE)).toBe(false);
	});

	it.each(FUNDS_DIALOG_SOURCES)("gives the one dialog in %s the shared popup, header and body classes", (file) => {
		const text = read(file);
		const use = describeDialogUse(text, file);
		const shape = readDialogShape(use);
		if (!shape) {
			throw new Error(
				`${file} must render exactly one dialog element whose children are one ModalHeader and one ModalContent${use.indirect.map((route) => `; found ${route}`).join("")}`,
			);
		}

		expect(usesSharedNames(use.source)).toBe(true);
		expect(text).not.toMatch(/overflow-|scrollbar/);
		expect(startsWithConstant(getAttribute(shape.dialog, "className"), "FUNDS_MODAL_POPUP_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(shape.header, "className"), "FUNDS_MODAL_HEADER_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(shape.body, "className"), "FUNDS_MODAL_BODY_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(shape.body, "data-slot"), "FUNDS_MODAL_BODY_SLOT")).toBe(true);
	});

	it("lists every file of the deposit flow that can reach a dialog primitive", () => {
		const flow = walkFundsFlow();
		const dialogSources = flow.files.filter((file) => usesDialogPrimitive(describeDialogUse(read(file), file)));

		expect(flow.unresolved).toEqual([]);
		expect(flow.files).toEqual(expect.arrayContaining([...FUNDS_FLOW_ENTRIES, ...FUNDS_DIALOG_SOURCES]));
		expect(flow.files).toContain("components/trade/tradebox/deposit-explorer-link.tsx");
		expect(flow.files).toContain("components/brand/status-glyph.tsx");
		expect(flow.files).toContain("lib/ui/funds-modal-scroll.ts");
		for (const boundary of FUNDS_FLOW_BOUNDARIES) expect(flow.files).not.toContain(boundary);
		expect(dialogSources).toEqual([...FUNDS_DIALOG_SOURCES].sort());
	});

	it("gives every modal and drawer export of the UI package a role", () => {
		const exported = UI_DIALOG_MODULES.flatMap((file) =>
			listValueExports(readFileSync(resolve(UI_PACKAGE_ROOT, file), "utf8"), file),
		);

		expect([...exported].sort()).toEqual([...UI_DIALOG_SURFACES, ...UI_DIALOG_PARTS, ...UI_DIALOG_INERT].sort());
	});

	it("finds the UI package's dialogs only in its modal and drawer modules, re-exported by name", () => {
		const entry = readFileSync(resolve(UI_PACKAGE_ROOT, UI_ENTRY), "utf8");
		const directories = readdirSync(UI_PACKAGE_ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory());

		expect(directories).toEqual([]);
		expect(listUiDialogDependents([...UI_DIALOG_MODULES, UI_ENTRY])).toEqual([]);
		expect(listUiDialogDependents([])).toEqual([...UI_DIALOG_MODULES, UI_ENTRY].sort());
		expect(reexportsByNameOnly(entry)).toBe(true);
	});

	it.each([
		{ name: "an alias", entry: 'export { Modal as Sheet } from "./modal";' },
		{ name: "an alias through an equivalent path", entry: 'export { AdaptiveModal as Sheet } from "././modal";' },
		{ name: "a star", entry: 'export * from "./modal";' },
		{ name: "a namespace", entry: 'export * as Dialogs from "././drawer";' },
		{
			name: "an import it then exports itself",
			entry: 'import { Modal } from "./modal";\nexport const Sheet = Modal;',
		},
		{ name: "a declaration of its own", entry: "export const load = () => import(name);" },
		{ name: "a list without a module", entry: "const Sheet = 1;\nexport { Sheet };" },
		{ name: "a module outside the package", entry: 'export { Dialog } from "@base-ui/react/dialog";' },
		{ name: "a module that does not exist", entry: 'export { Sheet } from "./sheet";' },
	])("does not accept a UI entry with $name", ({ entry }) => {
		expect(reexportsByNameOnly(entry)).toBe(false);
	});

	it("accepts a UI entry of unaliased lists, whichever way the files are named", () => {
		expect(
			reexportsByNameOnly(
				'export { Modal, type ModalProps } from "./modal";\nexport type { ButtonProps } from "././button.tsx";\nexport { Button } from "./button";',
			),
		).toBe(true);
	});

	it.each([
		"./modal",
		"././modal",
		"./modal.tsx",
		"../src/drawer",
		"./index",
		".",
		"./missing",
		"@sairn/ui",
		"@base-ui/react",
		"@base-ui/react/dialog",
		"@base-ui/react/alert-dialog",
		"@base-ui/react/drawer",
		"@base-ui/react/dialog/index.js",
		"@base-ui/react/./dialog",
		"@base-ui/utils",
		null,
	])("counts %s in a UI file as a way to a dialog implementation", (specifier) => {
		expect(reachesUiDialog("tooltip.tsx", specifier)).toBe(true);
	});

	it.each([
		"./utils",
		"././button",
		"./use-presented-open.ts",
		"@base-ui/react/tooltip",
		"@base-ui/react/menu",
		"react",
	])("does not count %s in a UI file as a way to a dialog implementation", (specifier) => {
		expect(reachesUiDialog("tooltip.tsx", specifier)).toBe(false);
	});

	it("reads value exports and fails on the forms it cannot read", () => {
		const read = (text: string) => listValueExports(text, "x.tsx");

		expect(
			read(
				'export const a = 1, b = 2;\nexport function c() {}\nexport class G {}\nexport type D = 1;\nexport interface H {}\nconst e = 3;\nexport { e, type D as F };\nexport { i, type J } from "./i";\nexport type { K } from "./k";',
			),
		).toEqual(["a", "b", "c", "G", "e", "i"]);
		for (const unsupported of [
			"export default AdaptiveModal;",
			"export default function Sheet() {}",
			"export = AdaptiveModal;",
			'export * from "./drawer";',
			'export * as Extra from "./drawer";',
			"export namespace Extra { export const Popup = AdaptiveModal; }",
			"export enum Side { Left }",
			"export const { Popup } = parts;",
		]) {
			expect(() => read(unsupported), unsupported).toThrow("does not read");
		}
	});

	it("resolves project module names to source files and fails closed on the rest", () => {
		const from = "components/trade/tradebox/deposit-modal.tsx";
		const source = (file: string) => ({ kind: "source", file });

		expect(resolveSpecifier(from, "./deposit/shared-ui")).toEqual(source(FUNDS_DIALOG_SOURCES[1]));
		expect(resolveSpecifier(from, "./deposit/shared-ui.tsx")).toEqual(source(FUNDS_DIALOG_SOURCES[1]));
		expect(resolveSpecifier(from, "../components/funds-modal-shell")).toEqual(source(FUNDS_DIALOG_SOURCES[0]));
		expect(resolveSpecifier(from, "@/lib/ui/funds-modal-scroll")).toEqual(source("lib/ui/funds-modal-scroll.ts"));
		expect(resolveSpecifier(from, "@sairn/ui")).toEqual({ kind: "package" });
		expect(resolveSpecifier("config/brand.ts", "../../../../brand/brand.json")).toEqual({ kind: "asset" });
		expect(resolveSpecifier(from, "./missing")).toEqual({ kind: "unresolved" });
		expect(resolveSpecifier(from, "./missing.json")).toEqual({ kind: "unresolved" });
		expect(resolveSpecifier(from, "./deposit/shared-ui.js")).toEqual({ kind: "unresolved" });
		expect(resolveSpecifier(from, "../../../../../../packages/ui/src/modal")).toEqual({ kind: "unresolved" });
	});

	it("follows every import, re-export and run-time load that can carry a value", () => {
		const references = listModuleReferences(
			parseSource(
				[
					'import type { A } from "./type-import";',
					'import { type B } from "./inline-type-import";',
					'import { type C, d } from "./mixed-import";',
					'import "./side-effect";',
					'import e, * as f from "./default-and-namespace";',
					'export * from "./star";',
					'export { g, type H } from "./mixed-export";',
					'export type { I } from "./type-export";',
					'export { type J } from "./inline-type-export";',
					'import k = require("./import-equals");',
					'const l = import("./dynamic");',
					'const m = require("./required");',
					"const n = import(name);",
					'const o = import.meta.glob("./glob/*.tsx");',
				].join("\n"),
				"source.ts",
			),
		);

		expect(references.map((reference) => reference.specifier)).toEqual([
			"./mixed-import",
			"./side-effect",
			"./default-and-namespace",
			"./star",
			"./mixed-export",
			"./import-equals",
			"./dynamic",
			"./required",
			null,
			null,
		]);
	});

	it("accepts the one form the three files use, under an alias as well", () => {
		const plain = describeVariant(`open ? ${ACCEPTED_DIALOG} : null`);
		const aliased = describeDialogUse(
			'import { AdaptiveModal as DepositDialog, ModalContent as Body, ModalHeader as Header } from "@sairn/ui";\nconst a = <DepositDialog open><Header>title</Header><Body /></DepositDialog>;',
		);
		const shape = readDialogShape(plain);

		expect(shape).not.toBeNull();
		expect(usesSharedNames(plain.source)).toBe(true);
		expect(startsWithConstant(getAttribute(shape?.body as JsxTag, "className"), "FUNDS_MODAL_BODY_CLASS")).toBe(true);
		expect(aliased.imported).toEqual(["AdaptiveModal"]);
		expect(readDialogShape(aliased)).not.toBeNull();
	});

	it.each([
		{ name: "a second element", body: `<>${ACCEPTED_DIALOG}<AdaptiveModal open>b</AdaptiveModal></>` },
		{
			name: "a second dialog built with createElement",
			body: `<>${ACCEPTED_DIALOG}{createElement(AdaptiveModal, { open: true, children: "b" })}</>`,
		},
		{
			name: "a self-closing dialog beside its header and body",
			body: "<><AdaptiveModal open className={FUNDS_MODAL_POPUP_CLASS} /><ModalHeader /><ModalContent /></>",
		},
		{ name: "a self-closing dialog with a children attribute", body: "<AdaptiveModal open children={null} />" },
		{
			name: "a children attribute with a value",
			body: ACCEPTED_DIALOG.replace("<AdaptiveModal open", "<AdaptiveModal open children={other}"),
		},
		{
			name: "a bare children attribute",
			body: ACCEPTED_DIALOG.replace("<AdaptiveModal open", "<AdaptiveModal open children"),
		},
		{
			name: "a spread on the dialog",
			body: ACCEPTED_DIALOG.replace("<AdaptiveModal open", "<AdaptiveModal open {...rest}"),
		},
		{
			name: "a spread on the body",
			body: ACCEPTED_DIALOG.replace("<ModalContent", "<ModalContent {...rest}"),
		},
		{ name: "a dialog stored in a variable as well", body: `${ACCEPTED_DIALOG}; const Other = AdaptiveModal` },
		{ name: "a body stored in a variable as well", body: `${ACCEPTED_DIALOG}; const Other = ModalContent` },
		{
			name: "a second header inside the body",
			body: ACCEPTED_DIALOG.replace(">body<", "><ModalHeader />body<"),
		},
		{
			name: "a header nested in the body instead of before it",
			body: "<AdaptiveModal open><ModalContent><ModalHeader /></ModalContent></AdaptiveModal>",
		},
		{
			name: "the body before the header",
			body: "<AdaptiveModal open><ModalContent /><ModalHeader /></AdaptiveModal>",
		},
		{
			name: "a third child beside the header and body",
			body: ACCEPTED_DIALOG.replace("</AdaptiveModal>", "<footer /></AdaptiveModal>"),
		},
		{
			name: "an expression child beside the header and body",
			body: ACCEPTED_DIALOG.replace("</AdaptiveModal>", "{footer}</AdaptiveModal>"),
		},
		{
			name: "a header and body wrapped in another element",
			body: "<AdaptiveModal open><div><ModalHeader /><ModalContent /></div></AdaptiveModal>",
		},
		{
			name: "a second dialog through a namespace member",
			body: `<>${ACCEPTED_DIALOG}<UI.Drawer open>b</UI.Drawer></>`,
			prelude: 'import * as UI from "@sairn/ui";',
		},
		{
			name: "a second dialog read from a namespace with brackets",
			body: `<>${ACCEPTED_DIALOG}{createElement(UI["AdaptiveModal"])}</>`,
			prelude: 'import * as UI from "@sairn/ui";',
		},
		{
			name: "a second dialog destructured from a namespace",
			body: `${ACCEPTED_DIALOG}; const { Drawer: Extra } = UI; const b = <Extra open>b</Extra>`,
			prelude: 'import * as UI from "@sairn/ui";',
		},
		{
			name: "a namespace of the primitives' module that is never read",
			body: ACCEPTED_DIALOG,
			prelude: 'import * as UI from "@sairn/ui";',
		},
		{
			name: "a namespace of another module read with brackets",
			body: `${ACCEPTED_DIALOG}; const Extra = Local["Drawer"]`,
			prelude: 'import * as Local from "./dialogs";',
		},
		{
			name: "a default import of the primitives' module",
			body: ACCEPTED_DIALOG,
			prelude: 'import UI from "@sairn/ui";',
		},
		{
			name: "a re-export of a primitive",
			body: ACCEPTED_DIALOG,
			prelude: 'export { Drawer as FundsDrawer } from "@sairn/ui";',
		},
		{
			name: "the primitives' module loaded at run time",
			body: `${ACCEPTED_DIALOG}; const later = import("@sairn/ui")`,
		},
		{
			name: "the wrapper loaded at run time by its file name",
			body: `${ACCEPTED_DIALOG}; const Extra = lazy(() => import("@/components/trade/components/pending-action-modal.tsx").then((m) => ({ default: m.PendingActionModal })))`,
		},
		{ name: "a module loaded at run time by a computed name", body: `${ACCEPTED_DIALOG}; const later = require(path)` },
		{ name: "modules loaded through import.meta", body: `${ACCEPTED_DIALOG}; const all = import.meta.glob("./*.tsx")` },
	])("rejects $name instead of interpreting it", ({ body, prelude }) => {
		expect(readDialogShape(describeVariant(body, prelude))).toBeNull();
	});

	it.each([
		{
			name: "a namespace of another module read by member",
			prelude: 'import * as Icons from "@phosphor-icons/react";',
			body: `<>${ACCEPTED_DIALOG}<Icons.CopyIcon /></>`,
		},
		{
			name: "a namespace used as a type",
			prelude: 'import * as React from "react";',
			body: `${ACCEPTED_DIALOG}; let node: React.ReactNode`,
		},
		{ name: "another module loaded at run time", prelude: "", body: `${ACCEPTED_DIALOG}; const qr = import("qrcode")` },
		{
			name: "type-only names of the primitives' module",
			prelude: 'import { type AdaptiveModalProps } from "@sairn/ui";\nexport { type DrawerProps } from "@sairn/ui";',
			body: ACCEPTED_DIALOG,
		},
	])("still accepts the form beside $name", ({ body, prelude }) => {
		expect(readDialogShape(describeVariant(body, prelude))).not.toBeNull();
	});

	it.each([
		{ name: "a value import under an alias", source: 'import { Drawer as Sheet } from "@sairn/ui";' },
		{ name: "a namespace import of the primitives' module", source: 'import * as UI from "@sairn/ui";' },
		{
			name: "a namespace import of a path inside the primitives' package",
			source: 'import * as UI from "@sairn/ui/modal";',
		},
		{
			name: "a namespace import of the wrapper by a relative name",
			source: 'import * as Pending from "../../components/pending-action-modal";',
		},
		{
			name: "a default import of the wrapper by its file name",
			source: 'import Pending from "@/components/trade/components/pending-action-modal.tsx";',
		},
		{
			name: "the wrapper loaded at run time by its file name",
			source: 'const later = import("@/components/trade/components/pending-action-modal.tsx");',
		},
		{
			name: "a namespace member named like a primitive",
			source: 'import * as Local from "./dialogs";\nconst a = <Local.Drawer open />;',
		},
		{
			name: "a namespace read with brackets",
			source: 'import * as Local from "./dialogs";\nconst Extra = Local[name];',
		},
		{
			name: "a namespace that is destructured",
			source: 'import * as Local from "./dialogs";\nconst { Sheet } = Local;',
		},
		{ name: "a default import of the primitives' module", source: 'import UI from "@sairn/ui";' },
		{ name: "a re-export of the primitives' module", source: 'export * from "@sairn/ui";' },
		{ name: "a re-export of a primitive from another module", source: 'export { Drawer as Sheet } from "./dialogs";' },
		{ name: "the primitives' module loaded at run time", source: 'const ui = await import("@sairn/ui");' },
		{ name: "the primitives' module loaded with import-equals", source: 'import ui = require("@sairn/ui");' },
		{ name: "a module loaded at run time by a computed name", source: "const ui = await import(modulePath);" },
		{ name: "modules loaded through import.meta", source: 'const all = import.meta.glob("./dialogs/*.tsx");' },
		{
			name: "a primitive in a plain script file",
			source: 'import { Drawer } from "@sairn/ui";\nexport const sheet = createElement(Drawer);',
			fileName: `${FUNDS_FLOW_DIRECTORY}/sheet.ts`,
		},
	])("counts $name as a route to a dialog primitive", ({ source, fileName }) => {
		expect(usesDialogPrimitive(describeDialogUse(source, fileName))).toBe(true);
	});

	it.each([
		{
			name: "type-only imports and re-exports, declared or inline",
			source:
				'import type { AdaptiveModal } from "@sairn/ui";\nimport { type Modal, Button } from "@sairn/ui";\nimport { type Drawer } from "@sairn/ui";\nimport type * as UI from "@sairn/ui";\nexport type { DrawerContent } from "@sairn/ui";\nexport { type ModalPopup } from "@sairn/ui";\ntype Props = typeof AdaptiveModal | typeof Modal | UI.DrawerProps;',
		},
		{
			name: "a namespace import of another module read by member",
			source:
				'import * as React from "react";\nimport * as Icons from "@phosphor-icons/react";\nlet node: React.ReactNode = <Icons.CopyIcon />;',
		},
		{ name: "another module loaded at run time", source: 'const qr = await import("qrcode");' },
		{ name: "a side-effect import of the primitives' module", source: 'import "@sairn/ui";' },
		{
			name: "the header, body and inert parts alone",
			source:
				'import { Button, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@sairn/ui";\nexport { Button } from "./button";',
		},
	])("does not count $name as a route to a dialog primitive", ({ source }) => {
		expect(usesDialogPrimitive(describeDialogUse(source))).toBe(false);
	});

	it.each([
		{
			name: "an aliased constant",
			imports: ACCEPTED_IMPORTS.replace(
				"FUNDS_MODAL_BODY_CLASS,",
				"FUNDS_MODAL_POPUP_CLASS as FUNDS_MODAL_BODY_CLASS,",
			),
			body: ACCEPTED_DIALOG,
		},
		{
			name: "a constant from another module",
			imports: ACCEPTED_IMPORTS.replace("@/lib/ui/funds-modal-scroll", "./local-scroll"),
			body: ACCEPTED_DIALOG,
		},
		{
			name: "a class merge helper from another module",
			imports: ACCEPTED_IMPORTS.replace("@/lib/cn", "./local-cn"),
			body: ACCEPTED_DIALOG,
		},
		{
			name: "a constant shadowed by a parameter",
			imports: ACCEPTED_IMPORTS,
			body: `(FUNDS_MODAL_BODY_CLASS: string) => ${ACCEPTED_DIALOG}`,
		},
		{
			name: "a constant shadowed by a renaming destructure",
			imports: ACCEPTED_IMPORTS,
			body: `${ACCEPTED_DIALOG}; function render({ body: FUNDS_MODAL_BODY_CLASS }: Classes) {}`,
		},
		{
			name: "a class merge helper shadowed by a local function",
			imports: ACCEPTED_IMPORTS,
			body: `${ACCEPTED_DIALOG}; function cn() {}`,
		},
		{
			name: "a class merge helper shadowed by a catch binding",
			imports: ACCEPTED_IMPORTS,
			body: `${ACCEPTED_DIALOG}; try {} catch (cn) {}`,
		},
	])("does not trust $name", ({ imports, body }) => {
		const use = describeDialogUse(`${imports}\nconst a = ${body};`);

		expect(readDialogShape(use)).not.toBeNull();
		expect(usesSharedNames(use.source)).toBe(false);
	});

	it("accepts the shared names under an equivalent module path", () => {
		const use = describeDialogUse(
			`${ACCEPTED_IMPORTS.replace("@/lib/cn", "../../../../lib/cn.ts").replace("@/lib/ui/funds-modal-scroll", "@/lib/ui/./funds-modal-scroll")}\nconst a = ${ACCEPTED_DIALOG};`,
		);

		expect(usesSharedNames(use.source)).toBe(true);
	});

	it("does not mistake a property, a key or a type member for a shadowing binding", () => {
		const use = describeVariant(
			`${ACCEPTED_DIALOG}; const label = metadata.cn; const keyed = { cn: 1, FUNDS_MODAL_BODY_CLASS: 2 }; const { cn: merge } = helpers; interface Helpers { cn?: string }`,
		);

		expect(usesSharedNames(use.source)).toBe(true);
	});

	it("reads a class only when the constant comes first", () => {
		const shape = readDialogShape(
			describeVariant(
				ACCEPTED_DIALOG.replace("cn(FUNDS_MODAL_BODY_CLASS, x)", 'cn("p-4", FUNDS_MODAL_BODY_CLASS)').replace(
					"className={FUNDS_MODAL_HEADER_CLASS}",
					'className="shrink-0"',
				),
			),
		);
		if (!shape) throw new Error("Expected the accepted dialog form");

		expect(startsWithConstant(getAttribute(shape.dialog, "className"), "FUNDS_MODAL_POPUP_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(shape.header, "className"), "FUNDS_MODAL_HEADER_CLASS")).toBe(false);
		expect(startsWithConstant(getAttribute(shape.body, "className"), "FUNDS_MODAL_BODY_CLASS")).toBe(false);
		expect(startsWithConstant(getAttribute(shape.body, "data-slot"), "FUNDS_MODAL_BODY_SLOT")).toBe(true);
	});

	it("keeps the browser fixture on the real shell and screens", () => {
		const fixture = readFileSync(resolve(SOURCE_ROOT, "../tests/browser/funds-forms.fixture.tsx"), "utf8");

		expect(fixture).toContain("<FundsModalShell");
		expect(fixture).toContain("<StatusScreen");
		expect(fixture).not.toContain("<PendingActionModal");
	});
});
