import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const EARN_PAGE_SOURCES = [
	["staking", "components/staking/staking-page.tsx"],
	["leaderboard", "components/leaderboard/leaderboard-page.tsx"],
] as const;
const VAULTS_PAGE_SOURCE = "components/vaults/vaults-page.tsx";
const LEADERBOARD_VIEW_SOURCE = "components/leaderboard/leaderboard-view.tsx";

describe("earn page surface contract", () => {
	it.each(EARN_PAGE_SOURCES)("keeps the %s fixture and live frames on the dashboard canvas", (_name, path) => {
		const source = readFileSync(resolve(TEST_DIR, "../..", path), "utf8");

		expect(source).toContain('className="min-h-dvh bg-dashboard-canvas font-sans text-fg min-[1001px]:pb-8"');
		expect(source).toContain('"min-h-dvh bg-dashboard-canvas font-sans text-fg",');
		expect(source).not.toContain("bg-grid-container");
		expect(source).not.toContain("bg-portfolio-canvas");
	});

	it("keeps the Vault fixture and live frames on the dashboard canvas", () => {
		const source = readFileSync(resolve(TEST_DIR, "../..", VAULTS_PAGE_SOURCE), "utf8");

		expect(source).toContain('className="min-h-dvh bg-dashboard-canvas font-sans text-fg min-[1001px]:pb-8"');
		expect(source).toContain('"min-h-dvh bg-dashboard-canvas font-sans text-fg",');
		expect(source).not.toContain("bg-grid-container");
		expect(source).not.toContain("bg-portfolio-canvas");
	});

	it("uses a named radius for the leaderboard surface", () => {
		const source = readFileSync(resolve(TEST_DIR, "../..", LEADERBOARD_VIEW_SOURCE), "utf8");

		expect(source).toContain("rounded-24");
		expect(source).not.toContain("rounded-[var(--earn-page-radius)]");
		expect(readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8")).not.toContain("--earn-page-radius");
	});
});
