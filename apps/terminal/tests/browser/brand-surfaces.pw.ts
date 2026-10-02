import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const THEMES = ["dark", "light"] as const;
const TONE_TOKENS: Record<string, string> = {
	success: "--text-success",
	error: "--text-error",
	attention: "--text-warning",
	neutral: "--text-weak",
	info: "--text-info",
};
const TOAST_GLYPHS: Record<string, string> = {
	success: "success",
	info: "info",
	warning: "warning",
	error: "error",
	loading: "pending",
};
const outDir =
	process.env.BRAND_SURFACES_OUT ?? fileURLToPath(new URL("../../test-results/brand-surfaces/shots", import.meta.url));

async function load(page: Page, theme: (typeof THEMES)[number]) {
	await page.emulateMedia({ colorScheme: theme });
	await page.goto(`/brand-surfaces.html?theme=${theme}`);
	await page.waitForFunction(() => window.__sairnBrandSurfaces?.ready === true);
	await page.waitForFunction(() => document.querySelectorAll("[data-sonner-toast]").length === 5);
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
}

function readPaint(page: Page) {
	return page.evaluate(
		({ toneTokens }) => {
			const probe = document.createElement("span");
			document.body.append(probe);
			const tokenColor = (token: string) => {
				probe.style.color = `var(${token})`;
				return getComputedStyle(probe).color;
			};
			const mismatches: string[] = [];
			const check = (label: string, actual: string, expected: string) => {
				if (actual !== expected) mismatches.push(`${label}: ${actual} ≠ ${expected}`);
			};
			for (const svg of document.querySelectorAll<SVGSVGElement>("svg[data-status-glyph], svg[data-brand-motion]")) {
				const id = svg.getAttribute("data-status-glyph") ?? svg.getAttribute("data-brand-motion");
				const tone = svg.getAttribute("data-tone");
				const label = `${id}@${svg.getAttribute("width")}`;
				for (const shape of svg.querySelectorAll<SVGElement>("circle, path, rect")) {
					for (const property of ["fill", "stroke"] as const) {
						const declared = shape.getAttribute(property) ?? "";
						const computed = getComputedStyle(shape)[property];
						if (declared.startsWith("var(--status-tone") && tone) check(`${label} ${property}`, computed, tokenColor(toneTokens[tone]));
						if (declared.startsWith("var(--status-on")) check(`${label} ${property} cut-out`, computed, tokenColor("--on-action"));
						if (declared.startsWith("var(--logo-signal")) check(`${label} mark signal`, computed, tokenColor("--logo-signal"));
						if (declared.startsWith("var(--logo-choice")) check(`${label} mark choice`, computed, tokenColor("--logo-choice"));
						if (declared === "currentColor") check(`${label} ${property} current`, computed, getComputedStyle(svg).color);
					}
				}
			}
			for (const path of document.querySelectorAll<SVGPathElement>("[data-brand-logo] path, [data-brand-loader] path")) {
				const declared = path.getAttribute("fill") ?? "";
				const token = /var\((--logo-[a-z]+)/.exec(declared)?.[1];
				if (token) check(`logo ${token}`, getComputedStyle(path).fill, tokenColor(token));
			}
			const toasts = [...document.querySelectorAll<HTMLElement>("[data-sonner-toast]")].map((toast) => {
				const glyph = toast.querySelector<SVGSVGElement>("[data-icon] svg[data-status-glyph]");
				const toneShape = glyph?.querySelector<SVGElement>('[fill^="var(--status-tone"], [stroke^="var(--status-tone"]');
				const property = toneShape?.getAttribute("fill")?.startsWith("var(--status-tone") ? "fill" : "stroke";
				return {
					type: toast.getAttribute("data-type"),
					glyph: glyph?.getAttribute("data-status-glyph") ?? null,
					glyphColor: toneShape ? getComputedStyle(toneShape)[property] : null,
					textColor: getComputedStyle(toast).color,
				};
			});
			probe.remove();
			return { mismatches, toasts };
		},
		{ toneTokens: TONE_TOKENS },
	);
}

function readAnimations(page: Page) {
	return page.evaluate(() => {
		const running = (selector: string) =>
			[...document.querySelectorAll(selector)].flatMap((element) =>
				element
					.getAnimations({ subtree: true })
					.filter((animation) => animation instanceof CSSAnimation && animation.playState === "running"),
			);
		const names = (animations: Animation[]) =>
			[...new Set(animations.map((animation) => (animation as CSSAnimation).animationName))].sort();
		return {
			loops: names(running('svg[data-loading-indicator]')),
			loader: names(running("[data-brand-loader]")),
			all: running(".srm, [data-brand-loader]").length,
			reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
			loopingWithoutIndicator: [...document.querySelectorAll("svg.srm:not([data-loading-indicator])")].filter((svg) =>
				svg
					.getAnimations({ subtree: true })
					.some((animation) => animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY),
			).length,
		};
	});
}

for (const theme of THEMES) {
	test(`${theme}: brand surfaces paint with the terminal tokens and animate only where they should`, async ({
		page,
	}, testInfo) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await load(page, theme);

		const paint = await readPaint(page);
		expect(paint.mismatches).toEqual([]);
		for (const toast of paint.toasts) {
			expect(toast.glyph, `${toast.type} toast glyph`).toBe(TOAST_GLYPHS[toast.type ?? ""]);
			if (toast.type !== "loading") expect(toast.glyphColor, `${toast.type} toast glyph color`).toBe(toast.textColor);
		}

		const animations = await readAnimations(page);
		expect(animations.loops).toEqual(
			expect.arrayContaining(["srm13-breathe", "srm13-gsend", "srm13-send", "srm13-seq"]),
		);
		expect(animations.loader).toEqual(["brand-page-loader-breathe"]);
		expect(animations.loopingWithoutIndicator).toBe(0);

		await page.waitForTimeout(1200);
		const settled = await page.evaluate(() =>
			[...document.querySelectorAll<SVGElement>(".srm-g-success .srm-gcheck, .srm-g-partial .srm-gfill")].map(
				(shape) => getComputedStyle(shape).strokeDashoffset,
			),
		);
		expect(settled.length).toBeGreaterThan(0);
		for (const offset of settled) expect(Number.parseFloat(offset)).toBe(0);

		mkdirSync(outDir, { recursive: true });
		await page.screenshot({ path: join(outDir, `${testInfo.project.name}-${theme}.png`), fullPage: true });

		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.reload();
		await page.waitForFunction(() => window.__sairnBrandSurfaces?.ready === true);
		const reduced = await readAnimations(page);
		expect(reduced.reducedMotion).toBe(true);
		expect(reduced.all).toBe(0);
		const reducedOffsets = await page.evaluate(() =>
			[...document.querySelectorAll<SVGElement>(".srm-g-success .srm-gcheck")].map(
				(shape) => getComputedStyle(shape).strokeDashoffset,
			),
		);
		for (const offset of reducedOffsets) expect(Number.parseFloat(offset)).toBe(0);
		expect(errors).toEqual([]);
	});
}
