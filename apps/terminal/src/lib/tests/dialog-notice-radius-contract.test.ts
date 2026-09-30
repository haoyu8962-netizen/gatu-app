import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_SRC = resolve(TEST_DIR, "../..");
const ALERT_PRIMITIVE = resolve(TERMINAL_SRC, "../../../packages/ui/src/alert.tsx");

const NOTICE_BACKGROUND = /(?:^|\s)bg-(?:warning|error|success|info|signal)-soft(?:\s|$)/;
const PENDING_REASON = "trading dialog notice that predates the rule; waiting for a design decision";

const PENDING_EXCEPTIONS = [
	{
		file: "components/trade/components/establish-connection-modal.tsx",
		contains: "block rounded-8 bg-warning-soft px-3 py-2",
		count: 1,
	},
	{ file: "components/trade/components/spot-swap-modal.tsx", contains: "border-stroke-warning-strong/20", count: 5 },
	{
		file: "components/trade/positions/position-isolated-margin-modal.tsx",
		contains: "rounded-xs border border-stroke-error-strong/20 bg-error-soft",
		count: 1,
	},
	{
		file: "components/trade/positions/position-limit-close-modal.tsx",
		contains: "rounded-8 p-2.5 text-xs text-fg-muted bg-error-soft",
		count: 1,
	},
	{
		file: "components/trade/positions/position-market-close-modal.tsx",
		contains: "flex items-start gap-2 rounded-8 bg-warning-soft p-2.5",
		count: 1,
	},
	{
		file: "components/trade/positions/position-market-close-modal.tsx",
		contains: "rounded-8 p-2.5 text-xs text-fg-muted bg-error-soft",
		count: 1,
	},
	{
		file: "components/trade/positions/position-tpsl-modal.tsx",
		contains: "rounded-8 bg-warning-soft border border-stroke-warning-weak",
		count: 1,
	},
	{
		file: "components/trade/positions/send-modal.tsx",
		contains: "rounded-8 border border-stroke-warning-weak bg-warning-soft p-2.5",
		count: 1,
	},
	{
		file: "components/trade/positions/transfer-modal.tsx",
		contains: "rounded-8 border border-stroke-warning-weak bg-warning-soft p-2.5",
		count: 1,
	},
	{
		file: "components/trade/positions/transfer-modal.tsx",
		contains: "rounded-8 border border-stroke-info-weak bg-info-soft p-2.5",
		count: 1,
	},
] as const;

const DIALOG_FILE_NAME = /modal|dialog|drawer|sheet/;
const DIALOG_ELEMENT = /<(?:AdaptiveModal|Modal|ModalPopup|Drawer|DrawerContent)\b/;
const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

function listDialogSources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "__tests__" ? [] : listDialogSources(path);
		if (!entry.name.endsWith(".tsx")) return [];
		const isDialog = DIALOG_FILE_NAME.test(entry.name) || DIALOG_ELEMENT.test(readFileSync(path, "utf8"));
		return isDialog ? [relative(TERMINAL_SRC, path)] : [];
	});
}

function literalValue(match: RegExpMatchArray): string {
	return match[1] ?? match[2] ?? match[3] ?? "";
}

function findCallEnd(source: string, start: number): number {
	let depth = 1;
	let index = start;
	while (index < source.length && depth > 0) {
		const character = source[index];
		if (character === '"' || character === "'" || character === "`") {
			index = source.indexOf(character, index + 1) + 1;
			continue;
		}
		if (character === "(") depth += 1;
		if (character === ")") depth -= 1;
		index += 1;
	}
	return index;
}

// A cn() call is one class list even when the background and the radius sit in different arguments.
function classLists(source: string): string[] {
	const calls = [...source.matchAll(/\bcn\(/g)].map((match) => {
		const start = match.index ?? 0;
		return { start, end: findCallEnd(source, start + 3) };
	});
	const merged = calls.map(({ start, end }) =>
		[...source.slice(start, end).matchAll(STRING_LITERAL)].map(literalValue).join(" "),
	);
	const standalone = [...source.matchAll(STRING_LITERAL)]
		.filter((match) => !calls.some(({ start, end }) => (match.index ?? 0) >= start && (match.index ?? 0) < end))
		.map(literalValue);
	return [...merged, ...standalone];
}

const DIALOG_SOURCES = listDialogSources(resolve(TERMINAL_SRC, "components")).sort();

function radiusClasses(value: string): string[] {
	return value.split(/\s+/).filter((token) => {
		const utility = token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");
		return /^rounded(?:-|$)/.test(utility) && utility !== "rounded-full";
	});
}

const NOTICES = DIALOG_SOURCES.flatMap((file) =>
	classLists(readFileSync(resolve(TERMINAL_SRC, file), "utf8"))
		.map((value) => ({ file, value }))
		.filter(({ value }) => NOTICE_BACKGROUND.test(value) && radiusClasses(value).length > 0),
);

function isPendingException({ file, value }: { file: string; value: string }): boolean {
	return PENDING_EXCEPTIONS.some((exception) => exception.file === file && value.includes(exception.contains));
}

describe("dialog notice radius contract", () => {
	it("rounds every notice inside a dialog to 8px unless it is a listed pending exception", () => {
		expect(DIALOG_SOURCES.length).toBeGreaterThan(20);
		expect(DIALOG_SOURCES).toContain("components/funds-action/funds-action-recovery-host.tsx");
		for (const notice of NOTICES.filter((entry) => !isPendingException(entry))) {
			expect(radiusClasses(notice.value), `${notice.file}: ${notice.value}`).toEqual(["rounded-16"]);
		}
	});

	it("keeps the pending exception list exact so a fixed notice is removed from it", () => {
		for (const exception of PENDING_EXCEPTIONS) {
			const matches = NOTICES.filter(
				(notice) => notice.file === exception.file && notice.value.includes(exception.contains),
			);
			expect(matches.length, `${exception.file}: ${exception.contains} (${PENDING_REASON})`).toBe(exception.count);
		}
	});

	it("rounds the shared Alert notice primitive to 8px", () => {
		const source = readFileSync(ALERT_PRIMITIVE, "utf8");
		const base = source.match(/const alertVariants = cva\(\["([^"]*)"\]/)?.[1];

		expect(base).toBeDefined();
		expect(radiusClasses(base ?? "")).toEqual(["rounded-16"]);
	});
});
