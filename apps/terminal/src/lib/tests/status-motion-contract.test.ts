import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as brandMotions from "@/lib/brand/brand-motion.gen";
import * as buttonLoading from "@/lib/brand/button-loading.gen";
import type { BrandMotionDefinition, StatusGlyphDefinition, StatusTone } from "@/lib/brand/status-glyph.gen";
import * as statusGlyphs from "@/lib/brand/status-glyph.gen";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_ROOT = resolve(TEST_DIR, "../../..");
const REPOSITORY_ROOT = resolve(TERMINAL_ROOT, "../..");
const TERMINAL_STYLES = readFileSync(resolve(TERMINAL_ROOT, "src/styles.css"), "utf8");
const GENERATED_CSS = readFileSync(resolve(TERMINAL_ROOT, "src/lib/brand/status-motion.gen.css"), "utf8");
const GENERATED_MODULES = ["status-glyph.gen.ts", "button-loading.gen.ts", "brand-motion.gen.ts"].map((file) => ({
	file,
	text: readFileSync(resolve(TERMINAL_ROOT, "src/lib/brand", file), "utf8"),
}));
const MOTION_TOKENS = JSON.parse(
	readFileSync(resolve(REPOSITORY_ROOT, "brand/loader/sairn-motion.tokens.json"), "utf8"),
);
const COMPONENT_FILES = [
	"src/components/brand/status-glyph.tsx",
	"src/components/brand/brand-motion.tsx",
	"src/components/brand/button-loading.tsx",
	"src/components/brand/motion-drawing-shapes.tsx",
	"src/components/brand/motion-paint.ts",
];
const TONE_TOKENS: Record<StatusTone, string> = {
	success: "--text-success",
	error: "--text-error",
	attention: "--text-warning",
	neutral: "--text-weak",
	info: "--text-info",
};

const glyphs = Object.entries(statusGlyphs)
	.filter(([name]) => name.startsWith("STATUS_GLYPH_"))
	.map(([, value]) => value as StatusGlyphDefinition);
const motions = Object.entries({ ...buttonLoading, ...brandMotions })
	.filter(([name]) => name.startsWith("BRAND_MOTION_"))
	.map(([, value]) => value as BrandMotionDefinition);

describe("status motion contract", () => {
	it("is generated from the current motion library export", async () => {
		const { renderStatusMotion } = await import(resolve(REPOSITORY_ROOT, "scripts/brand-status-motion.mjs"));
		const { BRAND_LOGO_GEOMETRY } = await import("@/lib/brand/logo-geometry.gen");
		const rendered = renderStatusMotion(BRAND_LOGO_GEOMETRY.mark);
		for (const { file, text } of GENERATED_MODULES) {
			expect(rendered.modules[`apps/terminal/src/lib/brand/${file}`], file).toBe(text);
		}
		expect(Object.keys(rendered.modules)).toHaveLength(GENERATED_MODULES.length);
		expect(rendered.css).toBe(GENERATED_CSS);
	});

	it("keeps the illustrations out of the modules that load at startup", () => {
		expect(Object.keys(statusGlyphs).filter((name) => name.startsWith("BRAND_MOTION_"))).toEqual([]);
		expect(Object.keys(buttonLoading)).toEqual(["BRAND_MOTION_BUTTON_LOADING"]);
		expect(Object.keys(brandMotions)).not.toContain("BRAND_MOTION_BUTTON_LOADING");
	});

	it("covers the delivered and supplementary glyphs on both grids and the motions the terminal renders", () => {
		expect(glyphs.map((glyph) => glyph.id).sort()).toEqual(
			[
				"cancelled",
				"error",
				"info",
				"partial",
				"pending",
				"submitting",
				"success",
				"unknown",
				"wallet",
				"warning",
			].sort(),
		);
		for (const glyph of glyphs) {
			expect(glyph.grid16.viewBox, glyph.id).toBe("0 0 16 16");
			expect(glyph.grid24.viewBox, glyph.id).toBe("0 0 24 24");
			expect(glyph.grid16.shapes.length, glyph.id).toBeGreaterThan(0);
			expect(glyph.grid24.shapes.length, glyph.id).toBeGreaterThan(0);
			expect(glyph.className).toBe(`srm-g-${glyph.id}`);
		}
		expect(motions.map((motion) => motion.id).sort()).toEqual(
			[
				"awaiting-result",
				"button-loading",
				"cancelled",
				"copy-feedback",
				"error",
				"submitting",
				"success",
				"unknown",
				"wallet-awaiting",
			].sort(),
		);
	});

	it("never paints an in-flight loop with the success tone, which reads as done", () => {
		for (const item of [...glyphs, ...motions]) {
			if (item.loop) expect(item.tone, item.id).not.toBe("success");
		}
		expect(statusGlyphs.STATUS_GLYPH_SUBMITTING.tone).toBe("neutral");
		expect(brandMotions.BRAND_MOTION_SUBMITTING.tone).toBe("neutral");
	});

	it("refuses exported drawings the components would not reproduce", async () => {
		const { parseMotionSvgSource } = await import(resolve(REPOSITORY_ROOT, "scripts/brand-status-motion.mjs"));
		const source = readFileSync(resolve(REPOSITORY_ROOT, "brand/loader/svg/on-light/error.svg"), "utf8");
		expect(() => parseMotionSvgSource(source, "error.svg")).not.toThrow();
		const mutations: [string, string][] = [
			[
				"clip path",
				source.replace("</svg>", '<clipPath id="c"><rect x="0" y="0" width="1" height="1"/></clipPath></svg>'),
			],
			["group opacity", source.replace('<g class="srm-mark">', '<g class="srm-mark" opacity=".5">')],
			["mark transform", source.replace('data-part="signal"', 'data-part="signal" transform="scale(2)"')],
			[
				"unknown attribute",
				source.replace('<circle class="srm-anim srm-token"', '<circle class="srm-anim srm-token" filter="url(#f)"'),
			],
			["stray content", source.replace("</svg>", "<!-- note --></svg>")],
		];
		for (const [name, mutated] of mutations) {
			expect(mutated, name).not.toBe(source);
			expect(() => parseMotionSvgSource(mutated, name), name).toThrow();
		}
	});

	it("never maps an unknown result to the error tone and loops only the in-progress states", () => {
		const tone = Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph.tone]));
		expect(tone.unknown).toBe("attention");
		expect(brandMotions.BRAND_MOTION_UNKNOWN.tone).toBe("attention");
		expect(
			glyphs
				.filter((glyph) => glyph.loop)
				.map((glyph) => glyph.id)
				.sort(),
		).toEqual(["pending", "submitting", "wallet"]);
		expect(
			motions
				.filter((motion) => motion.loop)
				.map((motion) => motion.id)
				.sort(),
		).toEqual(["awaiting-result", "button-loading", "submitting", "wallet-awaiting"]);
	});

	it("keeps literal colors and titles out of the generated module and the components", () => {
		for (const { file, text } of GENERATED_MODULES) {
			expect(text, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
			expect(text, file).not.toContain("<title");
		}
		expect(GENERATED_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		for (const file of COMPONENT_FILES) {
			const source = readFileSync(resolve(TERMINAL_ROOT, file), "utf8");
			expect(source, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
			expect(source, file).not.toContain("<title");
		}
	});

	it("imports the generated keyframes and maps every tone to the terminal's semantic text colors", () => {
		expect(TERMINAL_STYLES).toContain('@import "./lib/brand/status-motion.gen.css" layer(components);');
		for (const [tone, token] of Object.entries(TONE_TOKENS)) {
			expect(TERMINAL_STYLES).toContain(`.srm[data-tone="${tone}"] {\n    --status-tone: var(${token});\n  }`);
		}
		expect(TERMINAL_STYLES).toContain("--status-on: var(--on-action);");
		expect(TERMINAL_STYLES).toContain("--srm-floor: var(--logo-loader-floor);");
		expect(TERMINAL_STYLES).toContain(
			`.srm[data-appearance="mono"] {\n    --srm-floor: ${MOTION_TOKENS.loopFloor.mono};\n  }`,
		);
	});

	it("stops every animation when the system asks for reduced motion and keeps the kit's timings", () => {
		expect(GENERATED_CSS).toContain("@media (prefers-reduced-motion:reduce){.srm .srm-anim{animation:none!important}}");
		const { duration, easing } = MOTION_TOKENS;
		expect(GENERATED_CSS).toContain(
			`.srm-g-success .srm-gcheck{stroke-dasharray:1;animation:srm13-gdraw ${duration.confirm}ms ${easing.enter} both}`,
		);
		expect(GENERATED_CSS).toContain(
			`.srm-g-partial .srm-gfill{stroke-dasharray:1 2;animation:srm13-gfill ${duration.confirm}ms ${easing.enter} both}`,
		);
		expect(GENERATED_CSS).toContain(
			`.srm-g-pending .srm-gd{animation:srm13-seq ${duration.loop}ms ${easing.loop} infinite}`,
		);
		expect(GENERATED_CSS).toContain(
			`.srm-button-loading .srm-a{animation:srm13-breathe ${duration["loop-fast"]}ms ${easing.loop} infinite}`,
		);
		expect(GENERATED_CSS).toContain(
			`.srm-wallet-awaiting .srm-pause{animation:srm13-breathe ${duration["loop-calm"]}ms ${easing.loop} infinite}`,
		);
	});
});
