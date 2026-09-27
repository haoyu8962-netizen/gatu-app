import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

function listComponentFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return listComponentFiles(path);
		return entry.name.endsWith(".tsx") ? [path] : [];
	});
}

function readComponent(file: string): string {
	return readFileSync(resolve(COMPONENTS_DIR, file), "utf8");
}

function getShowCloseExpressions(source: string): string[] {
	return [...source.matchAll(/showClose=\{([^}]*)\}/g)].map((match) => match[1].trim());
}

function canHideCloseWhileDismissible(expression: string): boolean {
	return expression === "false" || /mobile/i.test(expression);
}

const FILES_THAT_CAN_HIDE_CLOSE = listComponentFiles(COMPONENTS_DIR)
	.map((path) => relative(COMPONENTS_DIR, path))
	.filter((file) => getShowCloseExpressions(readComponent(file)).some(canHideCloseWhileDismissible))
	.sort();

describe("dialog dismiss control contract", () => {
	it("registers every dialog that can hide its close button for a reason other than a pending action", () => {
		expect(FILES_THAT_CAN_HIDE_CLOSE).toEqual(Object.keys(WITHOUT_CLOSE_BUTTON).sort());
	});

	it.each(Object.entries(WITHOUT_CLOSE_BUTTON))("%s keeps an explicit way out", (_file, registration) => {
		expect(registration.reason).not.toBe("");
		for (const exit of registration.exits) expect(readComponent(exit.file)).toContain(exit.control);
	});

	it("shows the close button on the close dialogs' phone sheet whenever it can be dismissed", () => {
		const shell = readComponent("trade/positions/position-close-dialog-shell.tsx");
		expect(getShowCloseExpressions(shell)).toEqual(["dismissible"]);
	});

	it("recognises the expressions that leave a phone sheet without a close button", () => {
		expect(canHideCloseWhileDismissible("false")).toBe(true);
		expect(canHideCloseWhileDismissible("!isMobile && !locked")).toBe(true);
		expect(canHideCloseWhileDismissible('!dismissBlocked && mobileView !== "leverage"')).toBe(true);
		expect(canHideCloseWhileDismissible("!isSubmitting")).toBe(false);
		expect(canHideCloseWhileDismissible("dismissible")).toBe(false);
	});
});
