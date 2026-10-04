import { readdirSync, readFileSync } from "node:fs";
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
// rendered result.
const FUNDS_DIALOG_SOURCES = [
	"components/trade/components/funds-modal-shell.tsx",
	"components/trade/tradebox/deposit/shared-ui.tsx",
	"components/trade/tradebox/deposit/wrong-network-screen.tsx",
];
const DIALOG_PRIMITIVES = new Set([
	"AdaptiveModal",
	"Modal",
	"ModalPopup",
	"Drawer",
	"DrawerContent",
	"PendingActionModal",
]);
const SCROLL_MODULE = "@/lib/ui/funds-modal-scroll";
const SCROLL_CONSTANTS = [
	"FUNDS_MODAL_BODY_CLASS",
	"FUNDS_MODAL_BODY_SLOT",
	"FUNDS_MODAL_HEADER_CLASS",
	"FUNDS_MODAL_POPUP_CLASS",
];

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

interface DialogUse {
	/** Value imports of a dialog primitive, by the name the primitive was exported under. */
	imported: string[];
	/** Every identifier outside the imports that names an imported primitive. */
	references: ts.Identifier[];
	/** Every `namespace.Primitive` member access, in a JSX tag or anywhere else. */
	namespaceReferences: number;
	/** Elements with children whose tag is an imported primitive. */
	dialogElements: ts.JsxElement[];
	source: ts.SourceFile;
}

function read(file: string): string {
	return readFileSync(resolve(SOURCE_ROOT, file), "utf8");
}

function listSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return listSources(path);
		return entry.name.endsWith(".tsx") ? [relative(SOURCE_ROOT, path)] : [];
	});
}

function isJsxTag(node: ts.Node): node is JsxTag {
	return ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node);
}

function describeDialogUse(text: string, fileName = "source.tsx"): DialogUse {
	const source = parseSource(text, fileName);
	const localPrimitives = new Map<string, string>();
	const namespaces = new Set<string>();

	for (const statement of source.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		const clause = statement.importClause;
		if (!clause || clause.isTypeOnly || !clause.namedBindings) continue;
		if (ts.isNamespaceImport(clause.namedBindings)) {
			namespaces.add(clause.namedBindings.name.text);
			continue;
		}
		for (const element of clause.namedBindings.elements) {
			if (element.isTypeOnly) continue;
			const exportedName = (element.propertyName ?? element.name).text;
			if (DIALOG_PRIMITIVES.has(exportedName)) localPrimitives.set(element.name.text, exportedName);
		}
	}

	const references: ts.Identifier[] = [];
	const dialogElements: ts.JsxElement[] = [];
	let namespaceReferences = 0;
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node)) return;
		if (ts.isIdentifier(node) && localPrimitives.has(node.text)) references.push(node);
		if (
			ts.isPropertyAccessExpression(node) &&
			ts.isIdentifier(node.expression) &&
			namespaces.has(node.expression.text) &&
			DIALOG_PRIMITIVES.has(node.name.text)
		) {
			namespaceReferences += 1;
		}
		if (
			ts.isJsxElement(node) &&
			ts.isIdentifier(node.openingElement.tagName) &&
			localPrimitives.has(node.openingElement.tagName.text)
		) {
			dialogElements.push(node);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);

	return { imported: [...localPrimitives.values()], references, namespaceReferences, dialogElements, source };
}

function usesDialogPrimitive(use: DialogUse): boolean {
	return use.imported.length > 0 || use.namespaceReferences > 0;
}

/**
 * The file's only dialog, or null unless it is written in the one accepted form: a single element
 * with children whose opening and closing tags are the only places the file names a dialog
 * primitive. A second element, a self-closing element, `createElement`, a namespace member, a
 * `children` attribute or any other mention of a primitive is rejected rather than interpreted.
 */
function getOnlyDialog(use: DialogUse): ts.JsxElement | null {
	if (use.dialogElements.length !== 1 || use.namespaceReferences !== 0 || use.references.length !== 2) return null;
	const [dialog] = use.dialogElements;
	const tags: ts.Node[] = [dialog.openingElement, dialog.closingElement];
	if (!use.references.every((reference) => tags.includes(reference.parent))) return null;
	if (getAttribute(dialog.openingElement, "children")) return null;
	return dialog;
}

function findTags(root: ts.Node, name: string): JsxTag[] {
	const found: JsxTag[] = [];
	function visit(node: ts.Node) {
		if (isJsxTag(node) && ts.isIdentifier(node.tagName) && node.tagName.text === name) found.push(node);
		ts.forEachChild(node, visit);
	}
	visit(root);
	return found;
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

function importsScrollConstants(source: ts.SourceFile): boolean {
	const names = source.statements
		.filter(ts.isImportDeclaration)
		.filter((statement) => (statement.moduleSpecifier as ts.StringLiteral).text === SCROLL_MODULE)
		.flatMap((statement) => {
			const bindings = statement.importClause?.namedBindings;
			return bindings && ts.isNamedImports(bindings)
				? bindings.elements.filter((element) => !element.propertyName).map((element) => element.name.text)
				: [];
		});
	return SCROLL_CONSTANTS.every((name) => names.includes(name));
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
		const dialog = getOnlyDialog(use);
		if (!dialog) throw new Error(`${file} must render exactly one dialog element with children`);

		expect(importsScrollConstants(use.source)).toBe(true);
		expect(text).not.toMatch(/overflow-y-auto|overflow-hidden|scrollbar-none/);

		const headers = findTags(dialog, "ModalHeader");
		const contents = findTags(dialog, "ModalContent");
		expect(startsWithConstant(getAttribute(dialog.openingElement, "className"), "FUNDS_MODAL_POPUP_CLASS")).toBe(true);
		expect(findTags(use.source, "ModalHeader")).toHaveLength(1);
		expect(findTags(use.source, "ModalContent")).toHaveLength(1);
		expect(headers).toHaveLength(1);
		expect(contents).toHaveLength(1);
		expect(startsWithConstant(getAttribute(headers[0], "className"), "FUNDS_MODAL_HEADER_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(contents[0], "className"), "FUNDS_MODAL_BODY_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(contents[0], "data-slot"), "FUNDS_MODAL_BODY_SLOT")).toBe(true);
	});

	it("lists every file of the deposit flow that uses a dialog primitive", () => {
		const depositFlow = [
			...listSources(resolve(SOURCE_ROOT, "components/trade/tradebox/deposit")),
			"components/trade/tradebox/deposit-modal.tsx",
			"components/trade/components/deposit-modal-loading-fallback.tsx",
			"components/trade/components/funds-modal-shell.tsx",
		];
		const dialogSources = depositFlow.filter((file) => usesDialogPrimitive(describeDialogUse(read(file), file))).sort();

		expect(dialogSources).toEqual([...FUNDS_DIALOG_SOURCES].sort());
	});

	it("recognises aliases and namespace members, and ignores type-only imports", () => {
		const aliased = describeDialogUse(
			'import { AdaptiveModal as DepositDialog } from "@sairn/ui";\nconst a = <DepositDialog open>x</DepositDialog>;',
		);
		const namespaced = describeDialogUse(
			'import * as UI from "@sairn/ui";\nconst a = <UI.AdaptiveModal open>x</UI.AdaptiveModal>;\nconst b = createElement(UI.Drawer);',
		);
		const typeOnly = describeDialogUse(
			'import type { AdaptiveModal } from "@sairn/ui";\nimport { type Modal, Button } from "@sairn/ui";\nimport * as React from "react";\ntype Props = typeof AdaptiveModal | typeof Modal;\nconst a = <Button />;',
		);
		const unusedValueImport = describeDialogUse('import { Drawer } from "@sairn/ui";');

		expect(aliased.imported).toEqual(["AdaptiveModal"]);
		expect(getOnlyDialog(aliased)).not.toBeNull();
		expect(namespaced.imported).toEqual([]);
		expect(namespaced.namespaceReferences).toBe(3);
		expect(usesDialogPrimitive(namespaced)).toBe(true);
		expect(getOnlyDialog(namespaced)).toBeNull();
		expect(usesDialogPrimitive(typeOnly)).toBe(false);
		expect(usesDialogPrimitive(unusedValueImport)).toBe(true);
	});

	it.each([
		{
			name: "a second element",
			body: "<><AdaptiveModal open>a</AdaptiveModal><AdaptiveModal open>b</AdaptiveModal></>",
		},
		{
			name: "a second dialog built with createElement",
			body: '<><AdaptiveModal open>a</AdaptiveModal>{createElement(AdaptiveModal, { open: true, children: "b" })}</>',
		},
		{
			name: "a self-closing dialog beside its header and body",
			body: "<><AdaptiveModal open className={FUNDS_MODAL_POPUP_CLASS} /><ModalHeader /><ModalContent /></>",
		},
		{
			name: "a self-closing dialog with a children attribute",
			body: "<AdaptiveModal open children={null} />",
		},
		{
			name: "an element that also passes a children attribute",
			body: "<AdaptiveModal open children={other}>a</AdaptiveModal>",
		},
		{
			name: "a dialog stored in a variable as well",
			body: "<AdaptiveModal open>a</AdaptiveModal>; const Other = AdaptiveModal",
		},
		{
			name: "a second dialog through a namespace",
			body: "<><AdaptiveModal open>a</AdaptiveModal><UI.Drawer open>b</UI.Drawer></>",
		},
	])("rejects $name instead of interpreting it", ({ body }) => {
		const use = describeDialogUse(
			`import * as UI from "@sairn/ui";\nimport { AdaptiveModal, ModalContent, ModalHeader } from "@sairn/ui";\nconst a = ${body};`,
		);

		expect(getOnlyDialog(use)).toBeNull();
	});

	it("reads the header and body from inside the dialog element only", () => {
		const use = describeDialogUse(
			'import { AdaptiveModal, ModalContent, ModalHeader } from "@sairn/ui";\nconst a = <><AdaptiveModal className={cn(FUNDS_MODAL_POPUP_CLASS, x)}><ModalContent className={cn("p-4", FUNDS_MODAL_BODY_CLASS)} /></AdaptiveModal><ModalHeader className={FUNDS_MODAL_HEADER_CLASS} /></>;',
		);
		const dialog = getOnlyDialog(use);
		if (!dialog) throw new Error("Expected the accepted dialog form");
		const content = findTags(dialog, "ModalContent")[0];

		expect(startsWithConstant(getAttribute(dialog.openingElement, "className"), "FUNDS_MODAL_POPUP_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(content, "className"), "FUNDS_MODAL_BODY_CLASS")).toBe(false);
		expect(findTags(dialog, "ModalHeader")).toHaveLength(0);
		expect(findTags(use.source, "ModalHeader")).toHaveLength(1);
		expect(importsScrollConstants(use.source)).toBe(false);
	});

	it("keeps the browser fixture on the real shell and screens", () => {
		const fixture = readFileSync(resolve(SOURCE_ROOT, "../tests/browser/funds-forms.fixture.tsx"), "utf8");

		expect(fixture).toContain("<FundsModalShell");
		expect(fixture).toContain("<StatusScreen");
		expect(fixture).toContain("<WrongNetworkScreen");
		expect(fixture).not.toContain("<PendingActionModal");
	});
});
