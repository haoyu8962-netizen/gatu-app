import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = resolve(TEST_DIR, "../../components");

const BOOT_PLACEHOLDER_SOURCES = [
	"trade/layout/app-shell-skeleton.tsx",
	"trade/layout/desktop-grid-loading-surface.tsx",
	"trade/layout/main-workspace.tsx",
	"trade/chart/chart-panel.tsx",
	"trade/header/top-nav.tsx",
];

function readComponent(relativePath: string): string {
	return readFileSync(resolve(COMPONENTS_DIR, relativePath), "utf8");
}

describe("boot placeholder contract", () => {
	it("keeps every structural boot placeholder free of loading animation", () => {
		for (const relativePath of BOOT_PLACEHOLDER_SOURCES) {
			const source = readComponent(relativePath);
			expect(source, relativePath).not.toContain("animate-pulse");
			expect(source, relativePath).not.toContain("animate-spin");
		}
	});

	it("renders lazy workspace panels on the same surface as the shell skeleton", () => {
		const workspace = readComponent("trade/layout/main-workspace.tsx");

		expect(workspace).toContain(
			'const panelFallback = <div aria-hidden="true" className="h-full w-full bg-surface" />',
		);
		expect(workspace).not.toContain("chartPanelFallback");
		expect(workspace).not.toContain("bg-fill-weaker");
	});

	it("keeps chart initialization visible with the shared loading indicator", () => {
		const chartPanel = readComponent("trade/chart/chart-panel.tsx");
		const chartWidget = readComponent("trade/chart/tradingview-chart.tsx");

		expect(chartPanel).toContain('className="block h-full w-full bg-surface"');
		expect(chartPanel).toContain('<span className="sr-only">');
		expect(chartWidget).toContain("data-chart-loading");
		expect(chartWidget).toContain("text-fg-muted");
		expect(chartWidget).toContain("SpinnerGapIcon");
		expect(chartWidget).toContain("animate-spin");
	});
});
