import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_SEO } from "@/config/seo";
import { buildMarketDocumentTitle, buildPageHead, buildRootHead, mergeHead, SEO_DEFAULTS } from "@/lib/seo";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_ROOT = resolve(TEST_DIR, "../../..");

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

	it("keeps the Terminal document and social titles distinct", () => {
		const head = buildPageHead(ROUTE_SEO.TRADE);

		expect(head.meta.find((meta) => meta.title)?.title).toBe("GATU Terminal — 永续 · 现货交易终端");
		expect(getMetaContent(head, "name", "description")).toBe("低延迟链上交易终端：永续、现货、组合与订单管理。");
		expect(getMetaContent(head, "property", "og:title")).toBe("GATU Terminal");
		expect(getMetaContent(head, "property", "og:locale")).toBe("zh_CN");
		expect(getMetaContent(head, "name", "twitter:title")).toBe("GATU Terminal");
		expect(getMetaContent(head, "property", "og:image")).toBe("https://app.gatu.ai/og-terminal-1200x630.png");
	});

	it("formats live market titles with the price first", () => {
		expect(buildMarketDocumentTitle("0.8471", "GTU-USDC")).toBe("0.8471 GTU/USDC · GATU");
		expect(buildMarketDocumentTitle("0.8471", "GTU/USDC")).toBe("0.8471 GTU/USDC · GATU");
	});

	it("keeps route-specific social titles when no override is provided", () => {
		const head = buildPageHead({ title: "Portfolio", path: "/portfolio" });

		expect(getMetaContent(head, "property", "og:title")).toBe("Portfolio | GATU");
		expect(getMetaContent(head, "property", "og:locale")).toBe("en_US");
		expect(getMetaContent(head, "name", "twitter:title")).toBe("Portfolio | GATU");
	});

	it("keeps canonical links route-owned so only one is rendered", () => {
		const rootHead = buildRootHead();
		const routeHead = buildPageHead({ path: "/terms" });
		expect(rootHead.links.some((link) => link.rel === "canonical")).toBe(false);
		expect(routeHead.links.filter((link) => link.rel === "canonical")).toHaveLength(1);
	});

	it("preloads the latin font subsets with the attributes the font cache requires", () => {
		const rootHead = buildRootHead(["/fonts/inter-latin.woff2", "/fonts/plex-latin.woff2"]);
		const preloads = rootHead.links.filter((link) => link.rel === "preload");
		expect(preloads).toEqual([
			{ rel: "preload", href: "/fonts/inter-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
			{ rel: "preload", href: "/fonts/plex-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
		]);
		expect(buildRootHead().links.some((link) => link.rel === "preload")).toBe(false);
	});

	it("keeps global connection hints DNS-only so the edge can select the correct trading network", () => {
		const links = buildRootHead().links;
		expect(links.filter((link) => link.rel === "preconnect")).toEqual([]);
		expect(links.filter((link) => link.rel === "dns-prefetch")).toEqual([
			{ rel: "dns-prefetch", href: "https://app.hyperliquid.xyz" },
		]);
	});

	it("publishes the dedicated vector favicon alongside ICO and Apple fallbacks", () => {
		const iconLinks = buildRootHead().links.filter((link) => link.rel === "icon" || link.rel === "apple-touch-icon");
		expect(iconLinks).toEqual([
			{ rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
		]);
		for (const link of iconLinks) {
			expect(readFileSync(resolve(TERMINAL_ROOT, "public", link.href.slice(1))).byteLength).toBeGreaterThan(0);
		}
	});

	it("builds a complete large social card without a stale Twitter account", () => {
		const head = buildPageHead();
		const expectedImage = `${SEO_DEFAULTS.siteUrl}${SEO_DEFAULTS.ogImagePath}`;

		expect(getMetaContent(head, "property", "og:image")).toBe(expectedImage);
		expect(getMetaContent(head, "property", "og:image:type")).toBe(SEO_DEFAULTS.ogImageType);
		expect(getMetaContent(head, "property", "og:image:width")).toBe(String(SEO_DEFAULTS.ogImageWidth));
		expect(getMetaContent(head, "property", "og:image:height")).toBe(String(SEO_DEFAULTS.ogImageHeight));
		expect(getMetaContent(head, "property", "og:image:alt")).toBe(SEO_DEFAULTS.ogImageAlt);
		expect(getMetaContent(head, "property", "og:locale")).toBe("en_US");
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
