import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = resolve(TEST_DIR, "../..", "components");

interface ExplicitExit {
	file: string;
	control: string;
}

interface Registration {
	reason: string;
	exits: ExplicitExit[];
}

const WITHOUT_CLOSE_BUTTON: Record<string, Registration> = {
	"api-wallet/api-wallet-action-modal.tsx": {
		reason: "phone sheet ends with a Cancel button",
		exits: [{ file: "api-wallet/api-wallet-action-modal.tsx", control: "<Trans>Cancel</Trans>" }],
	},
	"referrals/referral-action-modal.tsx": {
		reason: "phone sheet ends with a Cancel or Back button",
		exits: [{ file: "referrals/referral-action-modal.tsx", control: "<Trans>Cancel</Trans>" }],
	},
	"vaults/vault-action-modal.tsx": {
		reason: "phone sheet ends with a Cancel button",
		exits: [{ file: "vaults/vault-action-modal.tsx", control: "<Trans>Cancel</Trans>" }],
	},
	"trade/tradebox/margin-mode-modal.tsx": {
		reason: "the phone leverage step replaces the close button with a Cancel button",
		exits: [{ file: "trade/tradebox/margin-mode-modal.tsx", control: "<Trans>Cancel</Trans>" }],
	},
	"trade/positions/cancel-all-orders-modal.tsx": {
		reason: "footer has a Back button",
		exits: [{ file: "trade/positions/cancel-all-orders-modal.tsx", control: "{t`Back`}" }],
	},
	"trade/positions/position-pnl-share-modal.tsx": {
		reason: "footer has a Close button",
		exits: [{ file: "trade/positions/position-pnl-share-modal.tsx", control: "{t`Close`}" }],
	},
	"trade/positions/position-risk-dialog-ui.tsx": {
		reason: "every dialog built on this shell has a Cancel button",
		exits: [
			{ file: "trade/positions/position-tpsl-modal.tsx", control: "{t`Cancel`}" },
			{ file: "trade/positions/position-isolated-margin-modal.tsx", control: "{t`Cancel`}" },
		],
	},
	"trade/components/legal-acceptance-modal.tsx": {
		reason: "not dismissible by design; the way out is Disconnect",
		exits: [{ file: "trade/components/legal-acceptance-modal.tsx", control: "<Trans>Disconnect</Trans>" }],
	},
	"trade/components/hip3-deployer-disclaimer.tsx": {
		reason:
			"the trade-page copy blocks by design and its way out is Leave this market; the position-flow copy ends with a Cancel button",
		exits: [
			{ file: "trade/components/hip3-deployer-disclaimer.tsx", control: "<Trans>Leave this market</Trans>" },
			{ file: "trade/components/hip3-deployer-disclaimer.tsx", control: "<Trans>Cancel</Trans>" },
		],
	},
};

// Close-visibility props that hide the close button only while the dialog cannot be dismissed (a pending
// action, a locked step) or that forward the decision to a caller whose own prop is scanned. Each
// expression is reviewed as written; any other expression, `false` included, needs a registration
// in WITHOUT_CLOSE_BUTTON or PENDING_DECISION.
const HIDDEN_ONLY_WHILE_UNDISMISSIBLE: Record<string, { expressions: string[]; reason: string }> = {
	"staking/staking-action-modal.tsx": { expressions: ["!locked"], reason: "dismissible={!locked}" },
	"trade/components/pending-action-modal.tsx": { expressions: ["!isPending"], reason: "hidden only while pending" },
	"trade/positions/position-close-dialog-shell.tsx": {
		expressions: ["dismissible"],
		reason: "follows the shell's own dismissible flag",
	},
	"trade/tradebox/deposit/shared-ui.tsx": { expressions: ["closable"], reason: "dismissible={closable}" },
	"ui/command.tsx": {
		expressions: ["showCloseButton"],
		reason: "CommandDialog forwards its showCloseButton prop; callers are scanned",
	},
};

// Dialogs that hide the close button without an explicit exit and wait for a design decision.
const PENDING_DECISION: Record<string, string> = {
	"trade/components/command-menu.tsx":
		"centred desktop search modal (opened from the desktop footer and the keyboard) with showCloseButton={false}; Esc and the scrim close it, there is no close control",
};

const CLOSE_VISIBILITY_PROP = /^(?:show|hide)Close/;

function listComponentFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory())
			return entry.name === "tests" || entry.name === "__tests__" ? [] : listComponentFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

function readComponent(file: string): string {
	return readFileSync(resolve(COMPONENTS_DIR, file), "utf8");
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

// Every close-visibility value in a file: JSX attributes (`showClose`, `showCloseButton`, `hideClose…`) and
// object properties of the same name, as they would reach a dialog through a spread.
function getCloseVisibilityExpressions(source: string): string[] {
	const sourceFile = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const expressions: string[] = [];
	function visit(node: ts.Node) {
		if (ts.isJsxAttribute(node) && CLOSE_VISIBILITY_PROP.test(node.name.getText(sourceFile))) {
			const initializer = node.initializer;
			if (!initializer) expressions.push("true");
			else if (ts.isStringLiteral(initializer)) expressions.push(JSON.stringify(initializer.text));
			else if (ts.isJsxExpression(initializer) && initializer.expression) {
				expressions.push(normalize(initializer.expression.getText(sourceFile)));
			}
		}
		if (
			(ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
			CLOSE_VISIBILITY_PROP.test(node.name.getText(sourceFile))
		) {
			expressions.push(
				ts.isPropertyAssignment(node) ? normalize(node.initializer.getText(sourceFile)) : node.name.getText(sourceFile),
			);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return expressions;
}

function canHideCloseWhileDismissible(file: string, expression: string): boolean {
	if (expression === "true") return false;
	return !HIDDEN_ONLY_WHILE_UNDISMISSIBLE[file]?.expressions.includes(expression);
}

const CLOSE_VISIBILITY = Object.fromEntries(
	listComponentFiles(COMPONENTS_DIR)
		.map((path) => relative(COMPONENTS_DIR, path))
		.map((file) => [file, getCloseVisibilityExpressions(readComponent(file))] as const)
		.filter(([, expressions]) => expressions.some((expression) => expression !== "true")),
);

const FILES_THAT_CAN_HIDE_CLOSE = Object.entries(CLOSE_VISIBILITY)
	.filter(([file, expressions]) => expressions.some((expression) => canHideCloseWhileDismissible(file, expression)))
	.map(([file]) => file)
	.sort();

describe("dialog dismiss control contract", () => {
	it("registers every dialog that can hide its close button for a reason other than a pending action", () => {
		expect(FILES_THAT_CAN_HIDE_CLOSE).toEqual(
			[...Object.keys(WITHOUT_CLOSE_BUTTON), ...Object.keys(PENDING_DECISION)].sort(),
		);
	});

	it("keeps every reviewed pending-only expression in use", () => {
		for (const [file, review] of Object.entries(HIDDEN_ONLY_WHILE_UNDISMISSIBLE)) {
			expect(review.reason, file).not.toBe("");
			for (const expression of review.expressions) expect(CLOSE_VISIBILITY[file], file).toContain(expression);
		}
	});

	it.each(Object.entries(WITHOUT_CLOSE_BUTTON))("%s keeps an explicit way out", (_file, registration) => {
		expect(registration.reason).not.toBe("");
		for (const exit of registration.exits) expect(readComponent(exit.file)).toContain(exit.control);
	});

	it("shows the close button on the close dialogs' phone sheet whenever it can be dismissed", () => {
		const shell = readComponent("trade/positions/position-close-dialog-shell.tsx");
		expect(getCloseVisibilityExpressions(shell)).toEqual(["dismissible"]);
	});

	it.each([
		["a literal false", "<Modal showClose={false} />", ["false"]],
		["a layout condition", '<Modal showClose={presentation !== "drawer"} />', ['presentation !== "drawer"']],
		["a wrapper prop", "<CommandDialog showCloseButton={false} />", ["false"]],
		["a bare attribute", "<Modal showClose />", ["true"]],
		["a spread object", "const props = { showClose: !compact };", ["!compact"]],
	])("reads %s", (_label, source, expected) => {
		expect(getCloseVisibilityExpressions(source)).toEqual(expected);
	});

	it("treats only reviewed pending expressions as safe", () => {
		expect(canHideCloseWhileDismissible("staking/staking-action-modal.tsx", "!locked")).toBe(false);
		expect(
			canHideCloseWhileDismissible("staking/staking-action-modal.tsx", '!locked && presentation !== "drawer"'),
		).toBe(true);
		expect(canHideCloseWhileDismissible("trade/components/pending-action-modal.tsx", "!isPending && isDesktop")).toBe(
			true,
		);
		expect(canHideCloseWhileDismissible("any/dialog.tsx", "false")).toBe(true);
		expect(canHideCloseWhileDismissible("any/dialog.tsx", "true")).toBe(false);
	});
});
