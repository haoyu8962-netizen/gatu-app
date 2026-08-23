import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEO_DEFAULTS } from "@/config/seo";

interface WebAppManifest {
	background_color: string;
	display: string;
	icons: Array<{
		purpose?: string;
		sizes: string;
		src: string;
		type: string;
	}>;
	name: string;
	scope: string;
	short_name: string;
	start_url: string;
	theme_color: string;
}

describe("PWA manifest", () => {
	it("matches the terminal canvas while preserving its application identity", () => {
		const publicRoot = new URL("../../../public/", import.meta.url);
		const manifest = JSON.parse(readFileSync(new URL("manifest.json", publicRoot), "utf8")) as WebAppManifest;

		expect(manifest.theme_color).toBe("#0F1A1F");
		expect(manifest.background_color).toBe("#0F1A1F");
		expect(SEO_DEFAULTS.themeColor).toBe("#0F1A1F");
		expect(manifest.display).toBe("standalone");
		expect(manifest.name).toBe("GATU");
		expect(manifest.short_name).toBe("GATU");
		expect(manifest.start_url).toBe("/");
		expect(manifest.scope).toBe("/");
		expect(manifest.icons).toEqual([
			{
				src: "favicon.ico",
				sizes: "16x16 32x32 48x48 64x64",
				type: "image/x-icon",
			},
			{
				src: "icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "icon-maskable-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "maskable",
			},
			{
				src: "icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
			{
				src: "icon.svg",
				sizes: "any",
				type: "image/svg+xml",
			},
		]);
		for (const icon of manifest.icons) {
			expect(existsSync(new URL(icon.src, publicRoot))).toBe(true);
		}
	});
});
