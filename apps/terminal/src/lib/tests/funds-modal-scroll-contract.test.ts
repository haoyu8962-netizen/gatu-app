import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function read(file: string): string {
	return readFileSync(resolve(SOURCE_ROOT, file), "utf8");
}

// The Deposit / Withdraw / Bridge dialog keeps its header fixed and scrolls only its body, with the
// scrollbar hidden, on the desktop modal and the phone sheet alike (.claude/rules/style-ui-guide.md,
// Dialog chrome). tests/browser/account-actions.pw.ts measures the rendered result.
describe("funds modal scroll contract", () => {
	const shell = read("components/trade/components/funds-modal-shell.tsx");

	it("clips the popup and scrolls only the body, without a visible scrollbar", () => {
		expect(shell).toContain('"!overflow-hidden"');
		expect(shell).toContain('"shrink-0"');
		expect(shell).toContain(
			'"min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"',
		);
		expect(shell).toContain('data-slot="funds-modal-body"');
		expect(shell).not.toContain("scrollbar-none");
	});

	it("applies the scroll classes to every tab, not only to the redesigned ones", () => {
		const bodyClass = /className=\{cn\(\s*FUNDS_MODAL_BODY_SCROLL_CLASS,/.test(shell);
		const popupClass = /className=\{cn\(\s*"!overflow-hidden",/.test(shell);
		const headerClass = /className=\{cn\(\s*"shrink-0",/.test(shell);

		expect({ bodyClass, popupClass, headerClass }).toEqual({ bodyClass: true, popupClass: true, headerClass: true });
	});

	it("keeps the browser fixture on the real shell", () => {
		const fixture = readFileSync(resolve(SOURCE_ROOT, "../tests/browser/funds-forms.fixture.tsx"), "utf8");

		expect(fixture).toContain("<FundsModalShell");
		expect(fixture).not.toContain("<PendingActionModal");
	});
});
