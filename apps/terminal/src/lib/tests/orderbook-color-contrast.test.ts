import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Color = readonly [number, number, number, number];
type Channels = readonly [number, number, number];
type Theme = ":root" | ".dark";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const STYLES = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const THEMES: Theme[] = [":root", ".dark"];
const SIDES = ["bid", "ask"] as const;
const MINIMUM_CONTRAST = 4.5;
const PULSE_KEYFRAMES = readRule(STYLES, "@keyframes orderbook-level-pulse");
const PULSE_PEAK = Number(readDeclaration(readRule(PULSE_KEYFRAMES, "20%"), "opacity"));

describe("order book composed color contrast", () => {
	for (const theme of THEMES) {
		it(`${theme} keeps headers readable on the actual panel surface`, () => {
			const surface = resolveColor(theme, "--bg-raised");
			const header = resolveColor(theme, "--orderbook-header");
			expect(getContrastRatio(over(header, surface), surface)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
		});

		for (const side of SIDES) {
			it(`${theme} ${side} keeps prices and values readable through depth, hover and the full pulse`, () => {
				const price = resolveColor(theme, `--orderbook-price-${side}`);
				const value = resolveColor(theme, "--orderbook-text");
				let lowestContrast = Number.POSITIVE_INFINITY;

				for (const background of getRowBackgrounds(theme, side)) {
					for (const foreground of [price, value]) {
						lowestContrast = Math.min(lowestContrast, getContrastRatio(over(foreground, background), background));
					}
				}

				expect(lowestContrast).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
			});

			for (const direction of SIDES) {
				it(`${theme} ${side} keeps quantity ${direction === "bid" ? "increases" : "decreases"} readable through both animations`, () => {
					const start = resolveColor(theme, `--orderbook-flash-${direction}`);
					const end = resolveColor(theme, "--orderbook-text");
					const transitions = [interpolateSrgb, interpolateOklab].flatMap((interpolate) =>
						Array.from({ length: 101 }, (_, index) => interpolate(start, end, index / 100)),
					);
					let lowestContrast = Number.POSITIVE_INFINITY;

					for (const background of getRowBackgrounds(theme, side)) {
						for (const foreground of transitions) {
							lowestContrast = Math.min(lowestContrast, getContrastRatio(over(foreground, background), background));
						}
					}

					expect(lowestContrast).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
				});
			}
		}
	}

	it("uses separate foreground, depth and non-interactive pulse layers", () => {
		for (const side of SIDES) {
			expect(readDeclaration(readRule(STYLES, `.orderbook-price-${side}:hover`), "color")).toBe(
				`var(--orderbook-price-${side})`,
			);
			expect(readDeclaration(readRule(STYLES, `.depth-bar-${side}`), "background-color")).toBe(
				`var(--orderbook-depth-${side})`,
			);
			expect(readDeclaration(readRule(STYLES, `.orderbook-level-pulse-${side}`), "background-color")).toBe(
				`var(--orderbook-level-pulse-${side})`,
			);
		}

		const pulse = readRule(STYLES, ".orderbook-level-pulse");
		expect(readDeclaration(pulse, "position")).toBe("absolute");
		expect(readDeclaration(pulse, "inset")).toBe("0");
		expect(readDeclaration(pulse, "pointer-events")).toBe("none");
		expect(readDeclaration(pulse, "opacity")).toBe("0");
		expect(readDeclaration(readRule(STYLES, ".orderbook-value-text"), "color")).toBe("var(--orderbook-text)");
		expect(readDeclaration(readRule(STYLES, ".orderbook-header-text"), "color")).toBe("var(--orderbook-header)");
		expect(readDeclaration(readRule(STYLES, ".orderbook-row:hover:not(:disabled)"), "background-color")).toBe(
			"var(--orderbook-hover)",
		);
	});

	it("starts a single pulse only after activation and honors reduced motion", () => {
		expect(readDeclaration(readRule(STYLES, '.orderbook-level-pulse[data-active="true"]'), "animation")).toBe(
			"orderbook-level-pulse 800ms ease var(--orderbook-pulse-delay, 0ms) 1 normal both",
		);
		expect(readDeclaration(readRule(PULSE_KEYFRAMES, "0%"), "opacity")).toBe("0");
		expect(PULSE_PEAK).toBe(0.7);
		expect(readDeclaration(readRule(PULSE_KEYFRAMES, "100%"), "opacity")).toBe("0");
		expect(readDeclaration(readRule(STYLES, ".orderbook-color-change"), "animation")).toBe(
			"orderbook-color-change 1.8s ease 0s 1 normal none",
		);
		const reducedMotionBlocks = [...STYLES.matchAll(/@media \(prefers-reduced-motion: reduce\)/g)].map((match) =>
			readRule(STYLES.slice(match.index), "@media (prefers-reduced-motion: reduce)"),
		);
		expect(
			reducedMotionBlocks.some((block) =>
				/\.orderbook-level-pulse\[data-active="true"\]\s*\{\s*animation:\s*none;/.test(block),
			),
		).toBe(true);
	});
});

function getRowBackgrounds(theme: Theme, side: (typeof SIDES)[number]): Color[] {
	const surface = resolveColor(theme, "--bg-raised");
	const hover = resolveColor(theme, "--orderbook-hover");
	const depth = resolveColor(theme, `--orderbook-depth-${side}`);
	const depthOpacity = Number(readDeclaration(readRule(STYLES, `.depth-bar-${side}`), "opacity"));
	const pulse = resolveColor(theme, `--orderbook-level-pulse-${side}`);
	const backgrounds: Color[] = [];

	for (const hovered of [false, true]) {
		for (const depthCovered of [false, true]) {
			const base = hovered ? over(hover, surface) : surface;
			const depthBackground = depthCovered ? over(withOpacity(depth, depthOpacity), base) : base;
			for (let step = 0; step <= 100; step += 1) {
				backgrounds.push(over(withOpacity(pulse, (PULSE_PEAK * step) / 100), depthBackground));
			}
		}
	}
	return backgrounds;
}

function readRule(source: string, selector: string): string {
	const start = source.indexOf(`${selector} {`);
	if (start < 0) throw new Error(`Missing CSS rule: ${selector}`);
	const open = source.indexOf("{", start);
	let depth = 1;
	for (let index = open + 1; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		if (source[index] === "}") depth -= 1;
		if (depth === 0) return source.slice(open + 1, index);
	}
	throw new Error(`Unclosed CSS rule: ${selector}`);
}

function readDeclaration(source: string, property: string): string {
	const declaration = source.split(";").find((line) => line.trim().startsWith(`${property}:`));
	if (!declaration) throw new Error(`Missing CSS declaration: ${property}`);
	return declaration.slice(declaration.indexOf(":") + 1).trim();
}

function resolveColor(theme: Theme, variable: string): Color {
	let value = readDeclaration(readRule(STYLES, theme), variable);
	for (let depth = 0; depth < 10; depth += 1) {
		const reference = /^var\((--[\w-]+)\)$/.exec(value);
		if (!reference) break;
		value = readDeclaration(readRule(STYLES, theme), reference[1]);
	}
	if (!/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(value)) throw new Error(`Unsupported CSS color: ${value}`);
	return [
		Number.parseInt(value.slice(1, 3), 16) / 255,
		Number.parseInt(value.slice(3, 5), 16) / 255,
		Number.parseInt(value.slice(5, 7), 16) / 255,
		value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1,
	];
}

function withOpacity([red, green, blue, alpha]: Color, opacity: number): Color {
	return [red, green, blue, alpha * opacity];
}

function over([red, green, blue, alpha]: Color, background: Color): Color {
	return [
		red * alpha + background[0] * (1 - alpha),
		green * alpha + background[1] * (1 - alpha),
		blue * alpha + background[2] * (1 - alpha),
		1,
	];
}

function getContrastRatio(foreground: Color, background: Color): number {
	const foregroundLuminance = luminance(foreground);
	const backgroundLuminance = luminance(background);
	return (
		(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
	);
}

function luminance([red, green, blue]: Color): number {
	return linearize(red) * 0.2126 + linearize(green) * 0.7152 + linearize(blue) * 0.0722;
}

function linearize(channel: number): number {
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function delinearize(channel: number): number {
	const clamped = Math.max(0, Math.min(1, channel));
	return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function interpolateSrgb(from: Color, to: Color, progress: number): Color {
	return [
		from[0] + (to[0] - from[0]) * progress,
		from[1] + (to[1] - from[1]) * progress,
		from[2] + (to[2] - from[2]) * progress,
		from[3] + (to[3] - from[3]) * progress,
	];
}

function interpolateOklab(from: Color, to: Color, progress: number): Color {
	const start = toOklab(from);
	const end = toOklab(to);
	const channels = fromOklab([
		start[0] + (end[0] - start[0]) * progress,
		start[1] + (end[1] - start[1]) * progress,
		start[2] + (end[2] - start[2]) * progress,
	]);
	return [...channels, from[3] + (to[3] - from[3]) * progress];
}

function toOklab([red, green, blue]: Color): Channels {
	const r = linearize(red);
	const g = linearize(green);
	const b = linearize(blue);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function fromOklab([lightness, a, b]: Channels): Channels {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		delinearize(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		delinearize(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		delinearize(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	];
}
