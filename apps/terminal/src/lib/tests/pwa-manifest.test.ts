import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEO_DEFAULTS } from "@/config/seo";

interface WebAppManifest {
	background_color: string;
	id: string;
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
		expect(manifest.id).toBe("/");
		expect(manifest.start_url).toBe("/");
		expect(manifest.scope).toBe("/");
		expect(manifest.icons).toEqual([
			{
				src: "favicon.ico",
				sizes: "16x16 32x32 48x48",
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

	it("keeps the install and browser theme colors on the dark terminal canvas token", () => {
		const publicRoot = new URL("../../../public/", import.meta.url);
		const manifest = JSON.parse(readFileSync(new URL("manifest.json", publicRoot), "utf8")) as WebAppManifest;
		const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
		const darkBlock = styles.slice(styles.indexOf("\n  .dark {"));
		const canvas = /--bg-base:\s*(#[0-9a-f]{6})\s*;/i.exec(darkBlock)?.[1];

		expect(canvas).toBeDefined();
		expect(manifest.theme_color.toLowerCase()).toBe(canvas?.toLowerCase());
		expect(manifest.background_color.toLowerCase()).toBe(canvas?.toLowerCase());
		expect(SEO_DEFAULTS.themeColor.toLowerCase()).toBe(canvas?.toLowerCase());
	});
});
