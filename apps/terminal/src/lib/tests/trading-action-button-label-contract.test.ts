import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = resolve(__dirname, "../../components");
const OWNER = "docs/confirmation-surfaces.md";
const TRANSLATORS = new Set(["t", "_", "i18n._"]);
const SIZE_HOLE = ["$", "{size}"].join("");

interface LabelReview {
	dynamic: string[];
	indirect: string[];
}

const REVIEWED_LABELS: Record<string, LabelReview> = {
	"trade/components/spot-swap-modal.tsx": { dynamic: [], indirect: [] },
	"trade/positions/position-close-all-modal.tsx": { dynamic: ["<Plural>"], indirect: ["progressLabel"] },
	"trade/positions/position-isolated-margin-modal.tsx": { dynamic: [], indirect: ["submitLabel"] },
	"trade/positions/position-limit-close-modal.tsx": { dynamic: [], indirect: ["progressLabel"] },
	"trade/positions/position-market-close-modal.tsx": { dynamic: [], indirect: [] },
	"trade/positions/position-reverse-confirmation-modal.tsx": { dynamic: [], indirect: [] },
	"trade/positions/position-tpsl-modal.tsx": { dynamic: [], indirect: [] },
	"trade/tradebox/leverage-modal.tsx": { dynamic: ["<Trans> with a value"], indirect: [] },
	"trade/tradebox/margin-mode-modal.tsx": { dynamic: [], indirect: [] },
	"trade/tradebox/order-confirmation-modal.tsx": { dynamic: [], indirect: ["sideLabel"] },
};

describe("TradingActionButton label contract", () => {
	const found = collectTradingActionButtonLabels();

	it("reviews every file that renders a TradingActionButton", () => {
		expect(
			Object.keys(found).sort(),
			`A file started or stopped rendering a TradingActionButton. Review its label against ${OWNER} and update REVIEWED_LABELS.`,
		).toEqual(Object.keys(REVIEWED_LABELS).sort());
	});

	it.each(Object.keys(REVIEWED_LABELS))("keeps runtime values out of the %s action label", (file) => {
		expect(
			found[file]?.dynamic,
			`The action label in ${file} gained or lost a runtime value. A confirm control names the action; the committed value belongs in the dialog body (${OWNER}).`,
		).toEqual(REVIEWED_LABELS[file]?.dynamic);
	});

	it.each(Object.keys(REVIEWED_LABELS))("keeps the indirect label sources of %s reviewed", (file) => {
		expect(
			found[file]?.indirect,
			`The action label in ${file} now reads a different expression. Confirm it resolves to static verbs, then update REVIEWED_LABELS (${OWNER}).`,
		).toEqual(REVIEWED_LABELS[file]?.indirect);
	});

	it("keeps the market close confirm control a static verb", () => {
		expect(found["trade/positions/position-market-close-modal.tsx"]).toEqual({ dynamic: [], indirect: [] });
	});
});

describe("TradingActionButton label scanner", () => {
	it.each([
		["a translated verb", "{t`Market Close`}"],
		["a descriptor passed to a translator", "{_(msg`Submitting...`)}"],
		["a Trans element without values", "<Trans>Confirm</Trans>"],
		["a spinner beside a verb", "{isUpdating && <SpinnerGapIcon className={cn(a, b)} />}<Trans>Confirm</Trans>"],
		["static branches", '{isSubmitting ? t`Reversing...` : "Sell / Short"}'],
	])("accepts %s", (_label, children) => {
		expect(reviewChildren(children)).toEqual({ dynamic: [], indirect: [] });
	});

	it.each([
		["an interpolated translation", `{t\`Market Close ${SIZE_HOLE}\`}`, "interpolated template"],
		["an interpolated descriptor", `{_(msg\`Close ${SIZE_HOLE}\`)}`, "interpolated template"],
		["an untagged template", `{\`Close ${SIZE_HOLE}\`}`, "interpolated template"],
		["a concatenation", '{"Close " + size}', "concatenation"],
		["a plural count", '<Plural value={count} one="Close # position" other="Close # positions" />', "<Plural>"],
		["a Trans element with a value", "<Trans>Updated to {leverage}x</Trans>", "<Trans> with a value"],
		["a value in a branch", `{isReady ? t\`Close ${SIZE_HOLE}\` : t\`Enable\`}`, "interpolated template"],
	])("reports %s as a runtime value", (_label, children, reported) => {
		expect(reviewChildren(children).dynamic).toEqual([reported]);
	});

	it.each([
		["a variable", "{submitLabel}", "submitLabel"],
		["a property", "{t`Confirm`} {position.size}", "position.size"],
		["an element", "{sizes[0]}", "sizes[0]"],
		["a formatter call", "{formatSize(size)}", "formatSize()"],
		["a method call", "{size.toFixed(2)}", "size.toFixed()"],
		["a variable behind a condition", "{isSubmitting ? progressLabel : t`Confirm`}", "progressLabel"],
		["a number", "{42}", "42"],
	])("asks for a review of %s", (_label, children, reported) => {
		expect(reviewChildren(children).indirect).toEqual([reported]);
	});
});

function reviewChildren(children: string): LabelReview {
	const reviews = reviewSource(`const view = <TradingActionButton onClick={run}>${children}</TradingActionButton>;`);
	if (!reviews) throw new Error("Expected a TradingActionButton");
	return reviews;
}

function collectTradingActionButtonLabels(): Record<string, LabelReview> {
	const result: Record<string, LabelReview> = {};
	for (const filePath of findTsxFiles(COMPONENTS_DIR)) {
		const text = readFileSync(filePath, "utf8");
		if (!text.includes("<TradingActionButton")) continue;
		const review = reviewSource(text);
		if (review) result[relative(COMPONENTS_DIR, filePath)] = review;
	}
	return result;
}

function reviewSource(text: string): LabelReview | null {
	const sourceFile = ts.createSourceFile("label.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const review: LabelReview = { dynamic: [], indirect: [] };
	let rendered = false;
	const visit = (node: ts.Node) => {
		if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === "TradingActionButton") {
			rendered = true;
			for (const child of node.children) inspectLabelNode(child, sourceFile, review);
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	if (!rendered) return null;
	return { dynamic: [...new Set(review.dynamic)].sort(), indirect: [...new Set(review.indirect)].sort() };
}

function inspectLabelNode(node: ts.Node, sourceFile: ts.SourceFile, review: LabelReview): void {
	if (ts.isJsxText(node)) return;
	if (ts.isJsxExpression(node)) {
		if (node.expression) inspectLabelExpression(node.expression, sourceFile, review);
		return;
	}
	if (ts.isJsxFragment(node)) {
		for (const child of node.children) inspectLabelNode(child, sourceFile, review);
		return;
	}
	if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
		const tagName = (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText(sourceFile);
		if (tagName === "Plural") {
			review.dynamic.push("<Plural>");
			return;
		}
		if (!ts.isJsxElement(node)) return;
		if (tagName === "Trans") {
			if (node.children.some((child) => ts.isJsxExpression(child) && child.expression)) {
				review.dynamic.push("<Trans> with a value");
			}
			return;
		}
		for (const child of node.children) inspectLabelNode(child, sourceFile, review);
	}
}

function inspectLabelExpression(expression: ts.Expression, sourceFile: ts.SourceFile, review: LabelReview): void {
	if (ts.isParenthesizedExpression(expression)) {
		inspectLabelExpression(expression.expression, sourceFile, review);
		return;
	}
	if (
		ts.isStringLiteral(expression) ||
		ts.isNoSubstitutionTemplateLiteral(expression) ||
		expression.kind === ts.SyntaxKind.NullKeyword ||
		expression.kind === ts.SyntaxKind.TrueKeyword ||
		expression.kind === ts.SyntaxKind.FalseKeyword
	) {
		return;
	}
	if (ts.isTemplateExpression(expression)) {
		review.dynamic.push("interpolated template");
		return;
	}
	if (ts.isTaggedTemplateExpression(expression)) {
		if (ts.isTemplateExpression(expression.template)) review.dynamic.push("interpolated template");
		return;
	}
	if (ts.isConditionalExpression(expression)) {
		inspectLabelExpression(expression.whenTrue, sourceFile, review);
		inspectLabelExpression(expression.whenFalse, sourceFile, review);
		return;
	}
	if (ts.isBinaryExpression(expression)) {
		const operator = expression.operatorToken.kind;
		if (operator === ts.SyntaxKind.PlusToken) {
			review.dynamic.push("concatenation");
			return;
		}
		if (
			operator === ts.SyntaxKind.AmpersandAmpersandToken ||
			operator === ts.SyntaxKind.BarBarToken ||
			operator === ts.SyntaxKind.QuestionQuestionToken
		) {
			inspectLabelExpression(expression.right, sourceFile, review);
			return;
		}
	}
	if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression) || ts.isJsxFragment(expression)) {
		inspectLabelNode(expression, sourceFile, review);
		return;
	}
	if (ts.isCallExpression(expression)) {
		const callee = expression.expression.getText(sourceFile);
		if (TRANSLATORS.has(callee)) {
			for (const argument of expression.arguments) inspectLabelExpression(argument, sourceFile, review);
			return;
		}
		review.indirect.push(`${callee}()`);
		return;
	}
	review.indirect.push(expression.getText(sourceFile));
}

function findTsxFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) return findTsxFiles(entryPath);
		return entry.name.endsWith(".tsx") ? [entryPath] : [];
	});
}
