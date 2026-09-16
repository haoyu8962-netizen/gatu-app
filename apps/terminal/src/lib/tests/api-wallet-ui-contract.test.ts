import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_ROOT = resolve(TEST_DIR, "../..");
const API_WALLET_ROOT = resolve(TERMINAL_ROOT, "components/api-wallet");
const TERMINAL_STYLES = readFileSync(resolve(TERMINAL_ROOT, "styles.css"), "utf8");
const API_WALLET_COMPONENTS = readdirSync(API_WALLET_ROOT)
	.filter((file) => file.endsWith(".tsx"))
	.map((file) => readFileSync(resolve(API_WALLET_ROOT, file), "utf8"));

describe("API wallet UI governance contract", () => {
	it("uses the shared dashboard canvas, product typeface, and named radii", () => {
		const page = readApiWalletComponent("api-wallet-page.tsx");

		expect(page).toContain('DASHBOARD_FRAMES["/api-wallet"]');
		expect(DASHBOARD_FRAMES["/api-wallet"].canvasClassName).toBe("min-h-dvh bg-dashboard-canvas font-sans text-fg");
		expect(page).not.toContain("bg-grid-container");
		for (const source of API_WALLET_COMPONENTS) {
			expect(source).not.toContain("font-market-close");
			expect(source).not.toMatch(/!?rounded(?:-[a-z]+)?-\[/);
		}
		expect(TERMINAL_STYLES).not.toMatch(/--api-wallet-(?:page|modal|sheet|card|control)-radius:/);
	});

	it("maps light-theme API wallet copy and input boundaries to WCAG-compatible semantic tokens", () => {
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--api-wallet-muted")).toBe("var(--text-weak)");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--api-wallet-subtle")).toBe("var(--text-weak)");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--api-wallet-warning")).toBe("var(--text-warning)");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--api-wallet-stroke-input")).toBe("var(--stroke-strong)");

		expect(contrastAgainstWhite(readCssVariable(TERMINAL_STYLES, ":root", "--text-weak"))).toBeGreaterThanOrEqual(4.5);
		expect(contrastAgainstWhite(readCssVariable(TERMINAL_STYLES, ":root", "--text-warning"))).toBeGreaterThanOrEqual(
			4.5,
		);
		expect(contrastAgainstWhite(readCssVariable(TERMINAL_STYLES, ":root", "--stroke-strong"))).toBeGreaterThanOrEqual(
			3,
		);
	});

	it("reflows the desktop form before the 1001px address field becomes compressed", () => {
		const form = readApiWalletComponent("api-wallet-form.tsx");

		expect(form).toContain("grid grid-cols-2 min-[1200px]:[grid-template-columns:var(--api-wallet-form-columns)]");
		expect(form).toContain('isMobile ? "touch-target px-2 py-0" : "p-0"');
		expect(form).toContain('"min-h-[var(--api-wallet-mobile-control-height)] py-0 pr-1"');
	});

	it("keeps visual fixture labels stable while using status-consistent expiry timestamps", () => {
		const fixture = readApiWalletComponent("api-wallet-fixture.tsx");

		expect(fixture).toContain("const [fixtureNow] = useState(() => Date.now())");
		expect(fixture).toContain("expiresAt: activeExpiresAt");
		expect(fixture).toContain("expiresAt: expiringExpiresAt");
		expect(fixture).toContain("expiresAt: expiredExpiresAt");
		expect(fixture).not.toContain("expiresAt: null");
		expect(fixture).toContain("expiryLabel: t`90 days`");
		expect(fixture).toContain("expiryLabel: t`5 days left`");
		expect(fixture).toContain("expiryLabel: t`Expired`");
	});
});

function readApiWalletComponent(file: string): string {
	return readFileSync(resolve(API_WALLET_ROOT, file), "utf8");
}

function readCssVariable(source: string, selector: string, variable: string): string | undefined {
	const selectorStart = source.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;
	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	if (blockStart === -1 || blockEnd === -1) return undefined;
	return new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd))?.[1]?.trim();
}

function contrastAgainstWhite(value: string | undefined): number {
	if (!value || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return 0;
	const red = Number.parseInt(value.slice(1, 3), 16);
	const green = Number.parseInt(value.slice(3, 5), 16);
	const blue = Number.parseInt(value.slice(5, 7), 16);
	const alpha = value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1;
	const composite = [red, green, blue].map((channel) => channel * alpha + 255 * (1 - alpha));
	const foregroundLuminance = relativeLuminance(composite);
	return 1.05 / (foregroundLuminance + 0.05);
}

function relativeLuminance(rgb: number[]): number {
	const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
