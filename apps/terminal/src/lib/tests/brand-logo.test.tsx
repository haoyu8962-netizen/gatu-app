import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLogo, type BrandLogoVariant } from "@/components/brand/brand-logo";
import { BrandPageLoader } from "@/components/brand/brand-page-loader";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../..");
const SOURCE_FILES: Record<BrandLogoVariant, string> = {
	lockup: "brand/svg/lockup/sairn-lockup-on-light.svg",
	mark: "brand/svg/mark/sairn-mark-on-light.svg",
};
const FILL_BY_SOURCE_COLOR: Record<string, string> = {
	"#176b64": "var(--logo-signal, currentColor)",
	"#99621f": "var(--logo-choice, currentColor)",
	"#08262e": "var(--logo-wordmark, currentColor)",
};

function readSource(path: string) {
	const source = readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
	return {
		viewBox: /viewBox="([^"]+)"/.exec(source)?.[1],
		paths: [...source.matchAll(/<path fill="([^"]+)" d="([^"]+)"/g)].map((match) => ({
			fill: FILL_BY_SOURCE_COLOR[match[1].toLowerCase()],
			d: match[2],
		})),
	};
}

function readRendered(markup: string) {
	return {
		viewBox: /viewBox="([^"]+)"/.exec(markup)?.[1],
		paths: [...markup.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].map((match) => ({ fill: match[2], d: match[1] })),
	};
}

describe("BrandLogo", () => {
	it.each(Object.entries(SOURCE_FILES) as [BrandLogoVariant, string][])(
		"renders the %s geometry of the logo kit with theme tokens instead of literal colors",
		(variant, sourcePath) => {
			const markup = renderToStaticMarkup(<BrandLogo variant={variant} />);
			const source = readSource(sourcePath);

			expect(source.paths.length).toBeGreaterThan(0);
			expect(readRendered(markup)).toEqual(source);
			expect(markup).toContain(`data-brand-logo="${variant}"`);
			expect(markup).toContain('aria-hidden="true"');
			expect(markup).toContain('focusable="false"');
			expect(markup).not.toContain("<title");
			expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		},
	);

	it("defaults to the horizontal lockup", () => {
		expect(renderToStaticMarkup(<BrandLogo />)).toContain('data-brand-logo="lockup"');
	});
});

describe("BrandPageLoader", () => {
	it("animates the mark of the motion library's page-loading frame without literal colors", () => {
		const markup = renderToStaticMarkup(<BrandPageLoader className="size-12" />);
		const motion = readFileSync(resolve(REPOSITORY_ROOT, "brand/loader/svg/on-light/page-loading.svg"), "utf8");
		const motionPaths = [...motion.matchAll(/data-part="(signal|choice)" fill="[^"]+" d="([^"]+)"/g)].map(
			(match) => match[2],
		);

		expect(markup).toContain('data-brand-loader="page-loading"');
		expect(markup).toContain(`viewBox="${/viewBox="([^"]+)"/.exec(motion)?.[1]}"`);
		expect([...markup.matchAll(/ d="([^"]+)"/g)].map((match) => match[1])).toEqual(motionPaths);
		expect(markup).toContain('class="brand-page-loader__signal"');
		expect(markup).toContain('class="brand-page-loader__choice"');
		expect(markup).toContain('aria-hidden="true"');
		expect(markup).not.toContain("<title");
		expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
	});
});
