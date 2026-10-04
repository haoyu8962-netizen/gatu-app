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
	/** JSX elements whose tag is an imported primitive or a member of a namespace import. */
	dialogs: JsxTag[];
	/** References to a primitive through a namespace import outside a JSX tag. */
	namespaceReferences: number;
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

	const dialogs: JsxTag[] = [];
	let namespaceReferences = 0;
	function isNamespacePrimitive(node: ts.Node): boolean {
		return (
			ts.isPropertyAccessExpression(node) &&
			ts.isIdentifier(node.expression) &&
			namespaces.has(node.expression.text) &&
			DIALOG_PRIMITIVES.has(node.name.text)
		);
	}
	function visit(node: ts.Node) {
		if (isJsxTag(node)) {
			const tag = node.tagName;
			if ((ts.isIdentifier(tag) && localPrimitives.has(tag.text)) || isNamespacePrimitive(tag)) dialogs.push(node);
		} else if (isNamespacePrimitive(node) && !isJsxTag(node.parent) && !ts.isJsxClosingElement(node.parent)) {
			namespaceReferences += 1;
		}
		ts.forEachChild(node, visit);
	}
	visit(source);

	return { imported: [...localPrimitives.values()], dialogs, namespaceReferences, source };
}

function usesDialogPrimitive(use: DialogUse): boolean {
	return use.imported.length > 0 || use.dialogs.length > 0 || use.namespaceReferences > 0;
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

		expect(use.dialogs).toHaveLength(1);
		expect(use.namespaceReferences).toBe(0);
		expect(importsScrollConstants(use.source)).toBe(true);
		expect(text).not.toMatch(/overflow-y-auto|overflow-hidden|scrollbar-none/);

		const dialog = use.dialogs[0];
		const headers = findTags(dialog.parent, "ModalHeader");
		const contents = findTags(dialog.parent, "ModalContent");
		expect(startsWithConstant(getAttribute(dialog, "className"), "FUNDS_MODAL_POPUP_CLASS")).toBe(true);
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
			'import { AdaptiveModal as DepositDialog } from "@sairn/ui";\nconst a = <DepositDialog open />;\nconst b = <DepositDialog open></DepositDialog>;',
		);
		const namespaced = describeDialogUse(
			'import * as UI from "@sairn/ui";\nconst a = <UI.AdaptiveModal open>x</UI.AdaptiveModal>;\nconst b = createElement(UI.Drawer);',
		);
		const typeOnly = describeDialogUse(
			'import type { AdaptiveModal } from "@sairn/ui";\nimport { type Modal, Button } from "@sairn/ui";\nimport * as React from "react";\ntype Props = typeof AdaptiveModal | typeof Modal;\nconst a = <Button />;',
		);
		const unusedValueImport = describeDialogUse(
			'import { Drawer } from "@sairn/ui";\nconst a = createElement(Drawer);',
		);

		expect(aliased.imported).toEqual(["AdaptiveModal"]);
		expect(aliased.dialogs).toHaveLength(2);
		expect(namespaced.imported).toEqual([]);
		expect(namespaced.dialogs).toHaveLength(1);
		expect(namespaced.namespaceReferences).toBe(1);
		expect(usesDialogPrimitive(namespaced)).toBe(true);
		expect(usesDialogPrimitive(typeOnly)).toBe(false);
		expect(usesDialogPrimitive(unusedValueImport)).toBe(true);
	});

	it("reads the class from the dialog element itself", () => {
		const use = describeDialogUse(
			'import { AdaptiveModal, ModalContent } from "@sairn/ui";\nconst a = <AdaptiveModal className={cn(FUNDS_MODAL_POPUP_CLASS, x)}><ModalContent className={cn("p-4", FUNDS_MODAL_BODY_CLASS)} /></AdaptiveModal>;',
		);
		const content = findTags(use.dialogs[0].parent, "ModalContent")[0];

		expect(startsWithConstant(getAttribute(use.dialogs[0], "className"), "FUNDS_MODAL_POPUP_CLASS")).toBe(true);
		expect(startsWithConstant(getAttribute(content, "className"), "FUNDS_MODAL_BODY_CLASS")).toBe(false);
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
