import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = resolve(TEST_DIR, "../../components");

const BOOT_PLACEHOLDER_SOURCES = [
	"dashboard/dashboard-shell-skeleton.tsx",
	"trade/layout/app-shell-skeleton.tsx",
	"trade/layout/desktop-grid-loading-surface.tsx",
	"trade/layout/desktop-terminal-surface.tsx",
	"trade/layout/main-workspace.tsx",
	"trade/layout/terminal-loading-workspace.tsx",
	"trade/mobile/mobile-loading-fallback.tsx",
	"trade/chart/chart-panel.tsx",
	"trade/header/top-nav.tsx",
];

const PHASE_ONE_LOADING_SOURCES = [
	"trade/layout/app-shell-skeleton.tsx",
	"trade/layout/desktop-terminal-surface.tsx",
	"trade/layout/terminal-loading-workspace.tsx",
	"trade/mobile/mobile-loading-fallback.tsx",
	"trade/trade-terminal-page.tsx",
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

	it("keeps the phase-one loading transition derived from state without clocks or animation frames", () => {
		for (const relativePath of PHASE_ONE_LOADING_SOURCES) {
			const source = readComponent(relativePath);
			expect(source, relativePath).not.toMatch(/\bset(?:Timeout|Interval)\s*\(/);
			expect(source, relativePath).not.toMatch(/\brequestAnimationFrame\s*\(/);
			expect(source, relativePath).not.toMatch(/\banimate-(?:pulse|spin)\b/);
		}
	});

	it("keeps the pre-runtime AppShell an honest branded frame instead of a fake application nav", () => {
		const shell = readComponent("trade/layout/app-shell-skeleton.tsx");

		expect(shell).toContain('aria-busy="true"');
		expect(shell).toContain('<output className="sr-only">');
		expect(shell).toContain("<MobileShellSkeleton />");
		expect(shell).toContain("<DesktopGridLoadingSurface");
		expect(shell).not.toContain("TopNav");
		expect(shell).not.toContain("<nav");
		expect(shell).not.toContain("<button");
	});

	it("uses an honest route-neutral frame for dashboard startup", () => {
		const shell = readComponent("dashboard/dashboard-shell-skeleton.tsx");

		expect(shell).toContain('aria-busy="true"');
		expect(shell).toContain('<output className="sr-only">');
		expect(shell.match(/<main\b/g)).toHaveLength(1);
		expect(shell).not.toContain("DesktopGridLoadingSurface");
		expect(shell).not.toContain("TopNav");
		expect(shell).not.toContain("<nav");
		expect(shell).not.toContain("<button");
	});

	it("renders lazy workspace panels on the same surface as the shell skeleton", () => {
		const workspace = readComponent("trade/layout/main-workspace.tsx");

		expect(workspace).toContain(
			'const panelFallback = <div aria-hidden="true" className="h-full w-full bg-surface" />',
		);
		expect(workspace).not.toContain("chartPanelFallback");
		expect(workspace).not.toContain("bg-fill-weaker");
	});

	it("uses the branded orbit only for initial chart loading while retaining the recovery spinner", () => {
		const chartPanel = readComponent("trade/chart/chart-panel.tsx");
		const chartWidget = readComponent("trade/chart/tradingview-chart.tsx");

		expect(chartPanel).toContain('className="block h-full w-full bg-surface"');
		expect(chartPanel).toContain('<span className="sr-only">');
		expect(chartWidget).toContain("data-chart-loading");
		expect(chartWidget).toContain("text-fg-muted");
		expect(chartWidget).toContain("GatuOrbitLoader");
		expect(chartWidget).toContain('className="size-9 shrink-0"');
		expect(chartWidget).toContain('<span className="sr-only">{t`Loading...`}</span>');
		expect(chartWidget).toContain("hasCompletedInitialWidgetLoadRef.current");
		expect(chartWidget).toContain("SpinnerGapIcon");
		expect(chartWidget).toContain("animate-spin");
	});
});
