import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	FUNDS_MODAL_BODY_CLASS,
	FUNDS_MODAL_BODY_SLOT,
	FUNDS_MODAL_HEADER_CLASS,
	FUNDS_MODAL_POPUP_CLASS,
} from "@/lib/ui/funds-modal-scroll";
import { parseSource } from "./harness/react-source";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Every dialog of the Deposit / Withdraw / Bridge flow keeps its header fixed and scrolls only its
// body, with the scrollbar hidden, on the desktop modal and the phone sheet alike
// (.claude/rules/style-ui-guide.md, Dialog chrome). tests/browser/account-actions.pw.ts measures the
// rendered result; this file only checks the shape of the source.
const FUNDS_DIALOG_SOURCES = [
	"components/trade/components/funds-modal-shell.tsx",
	"components/trade/tradebox/deposit/shared-ui.tsx",
	"components/trade/tradebox/deposit/wrong-network-screen.tsx",
];
// The flow is the deposit directory plus every project file these entries reach through imports.
const FUNDS_FLOW_ENTRIES = [
	"components/trade/tradebox/deposit-modal.tsx",
	"components/trade/components/deposit-modal-loading-fallback.tsx",
];
const FUNDS_FLOW_DIRECTORY = "components/trade/tradebox/deposit";
// Where the walk stops. The wrapper is itself counted as a primitive: its popup, header and body
// come from the shell. A dialog of another feature reached through shared code is added here with
// its reason, never left to fail or listed above.
const FUNDS_FLOW_BOUNDARIES = ["components/trade/components/pending-action-modal.tsx"];
const DIALOG_PRIMITIVES = new Set([
	"AdaptiveModal",
	"Modal",
	"ModalPopup",
	"Drawer",
	"DrawerContent",
	"PendingActionModal",
]);
const DIALOG_PARTS = new Set(["ModalHeader", "ModalContent"]);
const DIALOG_PRIMITIVE_MODULE = /^@sairn\/ui$|(?:^|\/)pending-action-modal$/;
const SCROLL_MODULE = "@/lib/ui/funds-modal-scroll";
const SCROLL_CONSTANTS = [
	"FUNDS_MODAL_BODY_CLASS",
	"FUNDS_MODAL_BODY_SLOT",
	"FUNDS_MODAL_HEADER_CLASS",
	"FUNDS_MODAL_POPUP_CLASS",
];
const CLASS_MERGE_MODULE = "@/lib/cn";

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

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

/** The project source a relative or `@/` specifier names, or null for a package or an asset. */
function resolveProjectImport(from: string, specifier: string): string | null {
	const isAlias = specifier.startsWith("@/");
	if (!isAlias && !specifier.startsWith(".")) return null;
	const base = isAlias ? resolve(SOURCE_ROOT, specifier.slice(2)) : resolve(SOURCE_ROOT, dirname(from), specifier);
	const candidates = [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")];
	const found = candidates.find((candidate) => isSource(candidate) && existsSync(candidate));
	return found ? relative(SOURCE_ROOT, found) : null;
}

/** Module names of every import, re-export and run-time load that is not type-only. */
function listModuleSpecifiers(source: ts.SourceFile): string[] {
	const specifiers: string[] = [];
	function visit(node: ts.Node) {
		const isTypeOnly =
			(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
			(ts.isExportDeclaration(node) && node.isTypeOnly);
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && !isTypeOnly) {
			if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
		}
		if (isModuleLoad(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
			specifiers.push(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return specifiers;
}

/** The deposit directory and every project file the entries reach through imports, up to the boundaries. */
function listFundsFlowSources(): string[] {
	const seen = new Set<string>();
	const queue = [...FUNDS_FLOW_ENTRIES, ...listSources(resolve(SOURCE_ROOT, FUNDS_FLOW_DIRECTORY))];
	for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
		if (seen.has(file) || FUNDS_FLOW_BOUNDARIES.includes(file)) continue;
		seen.add(file);
		for (const specifier of listModuleSpecifiers(parseSource(read(file), file))) {
			const target = resolveProjectImport(file, specifier);
			if (target) queue.push(target);
		}
	}
	return [...seen].sort();
}

function isModuleLoad(node: ts.Node): node is ts.CallExpression {
	return (
		ts.isCallExpression(node) &&
		(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
			(ts.isIdentifier(node.expression) && node.expression.text === "require"))
	);
}

function exportsDialogPrimitives(specifier: ts.Expression | undefined): boolean {
	return specifier !== undefined && ts.isStringLiteralLike(specifier) && DIALOG_PRIMITIVE_MODULE.test(specifier.text);
}

function describeDialogUse(text: string, fileName = "source.tsx"): DialogUse {
	const source = parseSource(text, fileName);
	const locals = new Map<string, string>();
	const namespaces = new Set<string>();
	const indirect: string[] = [];

	for (const statement of source.statements) {
		if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier) {
			const names = statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause : null;
			const reexportsPrimitive = names?.elements.some(
				(element) => !element.isTypeOnly && DIALOG_PRIMITIVES.has((element.propertyName ?? element.name).text),
			);
			if (reexportsPrimitive || exportsDialogPrimitives(statement.moduleSpecifier)) {
				indirect.push(`re-export from ${statement.moduleSpecifier.getText()}`);
			}
		}
		if (!ts.isImportDeclaration(statement)) continue;
		const clause = statement.importClause;
		if (!clause || clause.isTypeOnly) continue;
		if (clause.name && exportsDialogPrimitives(statement.moduleSpecifier)) {
			indirect.push(`default import of ${statement.moduleSpecifier.getText()}`);
		}
		if (!clause.namedBindings) continue;
		if (ts.isNamespaceImport(clause.namedBindings)) {
			namespaces.add(clause.namedBindings.name.text);
			if (exportsDialogPrimitives(statement.moduleSpecifier)) {
				indirect.push(`namespace import of ${statement.moduleSpecifier.getText()}`);
			}
			continue;
		}
		for (const element of clause.namedBindings.elements) {
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
		if (isModuleLoad(node)) {
			const specifier = node.arguments[0];
			if (!specifier || !ts.isStringLiteralLike(specifier) || exportsDialogPrimitives(specifier)) {
				indirect.push(`module loaded at run time: ${node.getText()}`);
			}
		}
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
 * module loaded at run time, a namespace member named like a primitive, or any namespace read
 * without a member name (brackets, destructuring, passing it on).
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

/** True when every name is a plain, unaliased value import from the module. */
function importsPlainly(source: ts.SourceFile, module: string, names: string[]): boolean {
	const imported = source.statements
		.filter(ts.isImportDeclaration)
		.filter(
			(statement) => ts.isStringLiteralLike(statement.moduleSpecifier) && statement.moduleSpecifier.text === module,
		)
		.flatMap((statement) => {
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

/** True when the file declares one of the names itself, which would shadow the import. */
function redeclares(source: ts.SourceFile, names: string[]): boolean {
	let found = false;
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node)) return;
		if (ts.isIdentifier(node) && names.includes(node.text) && (node.parent as { name?: ts.Node }).name === node) {
			found = true;
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return found;
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
		const flow = listFundsFlowSources();
		const dialogSources = flow.filter((file) => usesDialogPrimitive(describeDialogUse(read(file), file)));

		expect(flow).toEqual(expect.arrayContaining([...FUNDS_FLOW_ENTRIES, ...FUNDS_DIALOG_SOURCES]));
		expect(flow).toContain("components/trade/tradebox/deposit-explorer-link.tsx");
		expect(flow).toContain("components/brand/status-glyph.tsx");
		expect(flow).toContain("lib/ui/funds-modal-scroll.ts");
		expect(flow).not.toContain(FUNDS_FLOW_BOUNDARIES[0]);
		expect(dialogSources).toEqual([...FUNDS_DIALOG_SOURCES].sort());
	});

	it("resolves relative and aliased project imports, and nothing else", () => {
		const from = "components/trade/tradebox/deposit-modal.tsx";

		expect(resolveProjectImport(from, "./deposit/shared-ui")).toBe("components/trade/tradebox/deposit/shared-ui.tsx");
		expect(resolveProjectImport(from, "../components/funds-modal-shell")).toBe(FUNDS_DIALOG_SOURCES[0]);
		expect(resolveProjectImport(from, "@/lib/ui/funds-modal-scroll")).toBe("lib/ui/funds-modal-scroll.ts");
		expect(resolveProjectImport(from, "@sairn/ui")).toBeNull();
		expect(resolveProjectImport(from, "./missing")).toBeNull();
		expect(
			listModuleSpecifiers(
				parseSource(
					'import type { A } from "./types";\nimport { b } from "./b";\nexport * from "./c";\nexport type { D } from "./d";\nconst e = import("./e");',
					"source.ts",
				),
			),
		).toEqual(["./b", "./c", "./e"]);
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
		{ name: "a module loaded at run time by a computed name", body: `${ACCEPTED_DIALOG}; const later = require(path)` },
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
	])("still accepts the form beside $name", ({ body, prelude }) => {
		expect(readDialogShape(describeVariant(body, prelude))).not.toBeNull();
	});

	it.each([
		{ name: "a value import under an alias", source: 'import { Drawer as Sheet } from "@sairn/ui";' },
		{ name: "a namespace import of the primitives' module", source: 'import * as UI from "@sairn/ui";' },
		{
			name: "a namespace import of the pending-action wrapper",
			source: 'import * as Pending from "../components/pending-action-modal";',
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
		{ name: "a module loaded at run time by a computed name", source: "const ui = await import(modulePath);" },
		{
			name: "a primitive in a plain script file",
			source: 'import { Drawer } from "@sairn/ui";\nexport const sheet = createElement(Drawer);',
			fileName: "sheet.ts",
		},
	])("counts $name as a route to a dialog primitive", ({ source, fileName }) => {
		expect(usesDialogPrimitive(describeDialogUse(source, fileName))).toBe(true);
	});

	it.each([
		{
			name: "type-only imports",
			source:
				'import type { AdaptiveModal } from "@sairn/ui";\nimport { type Modal, Button } from "@sairn/ui";\nimport type * as UI from "@sairn/ui";\nexport type { Drawer } from "@sairn/ui";\ntype Props = typeof AdaptiveModal | typeof Modal;',
		},
		{
			name: "a namespace import of another module read by member",
			source:
				'import * as React from "react";\nimport * as Icons from "@phosphor-icons/react";\nlet node: React.ReactNode = <Icons.CopyIcon />;',
		},
		{ name: "another module loaded at run time", source: 'const qr = await import("qrcode");' },
		{
			name: "the header and body alone",
			source: 'import { Button, ModalContent, ModalHeader } from "@sairn/ui";\nexport { Button } from "./button";',
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
			name: "a constant shadowed by a local",
			imports: ACCEPTED_IMPORTS,
			body: `(FUNDS_MODAL_BODY_CLASS: string) => ${ACCEPTED_DIALOG}`,
		},
		{
			name: "a class merge helper shadowed by a local",
			imports: ACCEPTED_IMPORTS,
			body: `${ACCEPTED_DIALOG}; function cn() {}`,
		},
	])("does not trust $name", ({ imports, body }) => {
		const use = describeDialogUse(`${imports}\nconst a = ${body};`);

		expect(readDialogShape(use)).not.toBeNull();
		expect(usesSharedNames(use.source)).toBe(false);
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
		expect(fixture).toContain("<WrongNetworkScreen");
		expect(fixture).not.toContain("<PendingActionModal");
	});
});
