import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TEST_DIR = __dirname;
const TERMINAL_ROOT = resolve(TEST_DIR, "../../..");
const REPOSITORY_ROOT = resolve(TERMINAL_ROOT, "../..");

const viteConfig = readFileSync(resolve(TERMINAL_ROOT, "vite.config.ts"), "utf8");
const serviceWorker = readFileSync(resolve(TERMINAL_ROOT, "public/sw.js"), "utf8");
const caddyfile = readFileSync(resolve(REPOSITORY_ROOT, "deploy/Caddyfile"), "utf8");

describe("TradingView asset cache policy", () => {
	it("revalidates the complete chart package at the application server", () => {
		expect(viteConfig).toMatch(/'\/charting_library\/\*\*'[\s\S]*?max-age=0, must-revalidate/);
		expect(viteConfig).toMatch(/'\/tradingview-theme\.css'[\s\S]*?max-age=0, must-revalidate/);
	});

	it("only gives immutable caching to application build assets", () => {
		expect(caddyfile).toContain("@immutable path /assets/*");
		expect(caddyfile).not.toMatch(/@immutable path[^\n]*charting_library/);
	});

	it("revalidates chart assets before using the service-worker cache", () => {
		expect(serviceWorker).toContain('fetch(request, { cache: "no-cache" })');
		expect(serviceWorker).toContain("return networkFirstWithCacheFallback(request, CHARTING_CACHE)");
		expect(serviceWorker).not.toContain("staleWhileRevalidateDocument");
	});

	it("overrides upstream chart cache headers at the edge", () => {
		expect(caddyfile).toContain("@chart_assets path /charting_library/* /tradingview-theme.css");
		expect(caddyfile).toContain('header @chart_assets >Cache-Control "public, max-age=0, must-revalidate"');
	});
});
