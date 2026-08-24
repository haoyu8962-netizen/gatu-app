import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function readHistoryTabSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/trade/positions/${file}`), "utf8");
}

const HISTORY_TABS = ["history-tab.tsx", "funding-tab.tsx", "orders-history-tab.tsx"] as const;

describe("desktop account history scroll contract", () => {
	it.each(HISTORY_TABS)("keeps %s on one shared scroll owner", (file) => {
		const source = readHistoryTabSource(file);

		expect(source).toContain('<ScrollArea className="h-full w-full">');
		expect(source).toContain('containerClassName="overflow-visible"');
		expect(source).toContain("positionsPanelTableShellClass");
		expect(source.match(/<ScrollArea\b/g)).toHaveLength(1);
	});
});
