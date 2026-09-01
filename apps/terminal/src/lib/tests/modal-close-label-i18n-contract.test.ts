import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = resolve(__dirname, "../../components");
const MODAL_COMPONENTS = new Set(["AdaptiveModal", "ModalPopup"]);

describe("localized modal close-label contract", () => {
	it("gives every potentially visible application modal close button an explicit localized label", () => {
		const violations: string[] = [];

		for (const filePath of findTsxFiles(COMPONENTS_DIR)) {
			const sourceFile = ts.createSourceFile(
				filePath,
				readFileSync(filePath, "utf8"),
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TSX,
			);
			const visit = (node: ts.Node) => {
				if (ts.isJsxElement(node)) inspectOpeningElement(sourceFile, filePath, node.openingElement, violations);
				if (ts.isJsxSelfClosingElement(node)) inspectOpeningElement(sourceFile, filePath, node, violations);
				ts.forEachChild(node, visit);
			};
			visit(sourceFile);
		}

		expect(violations).toEqual([]);
	});
});

function inspectOpeningElement(
	sourceFile: ts.SourceFile,
	filePath: string,
	element: ts.JsxOpeningLikeElement,
	violations: string[],
) {
	if (!ts.isIdentifier(element.tagName) || !MODAL_COMPONENTS.has(element.tagName.text)) return;
	const attributes = element.attributes.properties.filter(ts.isJsxAttribute);
	const showClose = attributes.find((attribute) => attribute.name.getText(sourceFile) === "showClose");
	if (showClose && isFalseExpression(showClose.initializer)) return;
	const closeLabel = attributes.find((attribute) => attribute.name.getText(sourceFile) === "closeLabel");
	if (closeLabel?.initializer && !ts.isStringLiteral(closeLabel.initializer)) return;

	const { line } = sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile));
	violations.push(`${relative(COMPONENTS_DIR, filePath)}:${line + 1} <${element.tagName.text}>`);
}

function isFalseExpression(initializer: ts.JsxAttributeValue | undefined): boolean {
	return (
		!!initializer && ts.isJsxExpression(initializer) && initializer.expression?.kind === ts.SyntaxKind.FalseKeyword
	);
}

function findTsxFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) return findTsxFiles(entryPath);
		return entry.name.endsWith(".tsx") ? [entryPath] : [];
	});
}
