import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEO_DEFAULTS } from "@/config/seo";

interface WebAppManifest {
	background_color: string;
	display: string;
	scope: string;
	start_url: string;
	theme_color: string;
}

describe("PWA manifest", () => {
	it("matches the terminal canvas while preserving its application identity", () => {
		const manifest = JSON.parse(
			readFileSync(new URL("../../../public/manifest.json", import.meta.url), "utf8"),
		) as WebAppManifest;

		expect(manifest.theme_color).toBe("#0F1A1F");
		expect(manifest.background_color).toBe("#0F1A1F");
		expect(SEO_DEFAULTS.themeColor).toBe("#0F1A1F");
		expect(manifest.display).toBe("standalone");
		expect(manifest.start_url).toBe("/");
		expect(manifest.scope).toBe("/");
	});
});
