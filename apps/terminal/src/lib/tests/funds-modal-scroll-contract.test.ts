import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	FUNDS_MODAL_BODY_CLASS,
	FUNDS_MODAL_BODY_SLOT,
	FUNDS_MODAL_HEADER_CLASS,
	FUNDS_MODAL_POPUP_CLASS,
} from "@/lib/ui/funds-modal-scroll";

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
const DIALOG_ELEMENT = /<(?:AdaptiveModal|Modal|ModalPopup|Drawer|DrawerContent|PendingActionModal)\b/;

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

	it.each(FUNDS_DIALOG_SOURCES)("gives %s the shared popup, header and body classes", (file) => {
		const source = read(file);
		const popup = /className=\{cn\(\s*FUNDS_MODAL_POPUP_CLASS,/.test(source);
		const header =
			/<ModalHeader className=\{FUNDS_MODAL_HEADER_CLASS\}/.test(source) ||
			/<ModalHeader[^>]*className=\{cn\(\s*FUNDS_MODAL_HEADER_CLASS,/.test(source);
		const body =
			/data-slot=\{FUNDS_MODAL_BODY_SLOT\}\s+className=\{FUNDS_MODAL_BODY_CLASS\}/.test(source) ||
			/data-slot=\{FUNDS_MODAL_BODY_SLOT\}\s+className=\{cn\(\s*FUNDS_MODAL_BODY_CLASS,/.test(source);

		expect({ popup, header, body }).toEqual({ popup: true, header: true, body: true });
		expect(source).not.toMatch(/overflow-y-auto|overflow-hidden|scrollbar-none/);
	});

	it("lists every dialog of the deposit flow", () => {
		const dialogSources = listSources(resolve(SOURCE_ROOT, "components/trade/tradebox/deposit"))
			.filter((file) => DIALOG_ELEMENT.test(read(file)))
			.sort();

		expect(dialogSources).toEqual(FUNDS_DIALOG_SOURCES.filter((file) => file.includes("/deposit/")).sort());
		expect(read("components/trade/tradebox/deposit-modal.tsx")).not.toMatch(DIALOG_ELEMENT);
		expect(read("components/trade/components/deposit-modal-loading-fallback.tsx")).not.toMatch(DIALOG_ELEMENT);
	});

	it("keeps the browser fixture on the real shell and screens", () => {
		const fixture = readFileSync(resolve(SOURCE_ROOT, "../tests/browser/funds-forms.fixture.tsx"), "utf8");

		expect(fixture).toContain("<FundsModalShell");
		expect(fixture).toContain("<StatusScreen");
		expect(fixture).toContain("<WrongNetworkScreen");
		expect(fixture).not.toContain("<PendingActionModal");
	});
});
