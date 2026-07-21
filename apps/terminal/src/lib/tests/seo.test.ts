import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPageHead, mergeHead, SEO_DEFAULTS } from "@/lib/seo";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_ROOT = resolve(TEST_DIR, "../../..");
const REPOSITORY_ROOT = resolve(TERMINAL_ROOT, "../..");

function getMetaContent(head: ReturnType<typeof buildPageHead>, attribute: "name" | "property", value: string) {
	return head.meta.find((meta) => meta[attribute] === value)?.content;
}

describe("seo", () => {
	it("builds page head with title and canonical link", () => {
		const head = buildPageHead({
			title: "Trade",
			description: "Trade page",
			path: "/trade",
			keywords: ["perps"],
		});

		const titleMeta = head.meta.find((m) => m.title);
		expect(titleMeta?.title).toBe(`Trade | ${SEO_DEFAULTS.siteName}`);

		const canonical = head.links.find((l) => l.rel === "canonical");
		expect(canonical?.href).toBe(`${SEO_DEFAULTS.siteUrl}/trade`);
	});

	it("builds a complete large social card without a stale Twitter account", () => {
		const head = buildPageHead();
		const expectedImage = `${SEO_DEFAULTS.siteUrl}${SEO_DEFAULTS.ogImagePath}`;

		expect(getMetaContent(head, "property", "og:image")).toBe(expectedImage);
		expect(getMetaContent(head, "property", "og:image:type")).toBe(SEO_DEFAULTS.ogImageType);
		expect(getMetaContent(head, "property", "og:image:width")).toBe(String(SEO_DEFAULTS.ogImageWidth));
		expect(getMetaContent(head, "property", "og:image:height")).toBe(String(SEO_DEFAULTS.ogImageHeight));
		expect(getMetaContent(head, "property", "og:image:alt")).toBe(SEO_DEFAULTS.ogImageAlt);
		expect(getMetaContent(head, "name", "twitter:card")).toBe("summary_large_image");
		expect(getMetaContent(head, "name", "twitter:image")).toBe(expectedImage);
		expect(getMetaContent(head, "name", "twitter:image:alt")).toBe(SEO_DEFAULTS.ogImageAlt);
		expect(getMetaContent(head, "name", "twitter:site")).toBeUndefined();
	});

	it("ships the configured social image with the declared PNG dimensions", () => {
		const imagePath = resolve(TERMINAL_ROOT, "public", SEO_DEFAULTS.ogImagePath.slice(1));
		const image = readFileSync(imagePath);
		const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

		expect(image.subarray(0, pngSignature.length).equals(pngSignature)).toBe(true);
		expect(image.toString("ascii", 12, 16)).toBe("IHDR");
		expect(image.readUInt32BE(16)).toBe(SEO_DEFAULTS.ogImageWidth);
		expect(image.readUInt32BE(20)).toBe(SEO_DEFAULTS.ogImageHeight);

		const deployScript = readFileSync(resolve(REPOSITORY_ROOT, "deploy/deploy.sh"), "utf8");
		expect(deployScript).toContain(`SOCIAL_IMAGE_PATH="${SEO_DEFAULTS.ogImagePath}"`);
	});

	it("adds robots tag when noIndex is set", () => {
		const head = buildPageHead({ noIndex: true });
		const robots = head.meta.find((m) => m.name === "robots");
		expect(robots?.content).toBe("noindex, nofollow");
	});

	it("merges head entries", () => {
		const base = buildPageHead({ title: "Base" });
		const merged = mergeHead(base, {
			meta: [{ name: "custom", content: "yes" }],
			links: [{ rel: "preload", href: "/x" }],
		});

		expect(merged.meta.some((m) => m.name === "custom")).toBe(true);
		expect(merged.links.some((l) => l.rel === "preload")).toBe(true);
	});
});
