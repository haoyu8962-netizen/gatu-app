// The site's one button style (operator decision 2026-10-26, "style 4"): a pill, with a round arrow chip on the right
// for links and actions and none for toggles. ButtonLink.astro and Button.astro write the classes from src/lib/buttons.ts;
// the rules sit outside @layer so that no utility on a call site can override them. The built markup and the compiled
// stylesheet are checked again in tests/built/buttons.test.mjs.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buttonClasses } from "../src/lib/buttons.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = readFileSync(resolve(WEBSITE_ROOT, "src/styles/global.css"), "utf8");
const SOURCES = ["src/components", "src/pages", "src/layouts"].flatMap((directory) =>
	readdirSync(resolve(WEBSITE_ROOT, directory), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
		.map((entry) => {
			const path = resolve(entry.parentPath ?? entry.path, entry.name);
			return { file: relative(WEBSITE_ROOT, path), text: readFileSync(path, "utf8") };
		}),
);
const BUTTON_COMPONENTS = new Set(["src/components/ButtonLink.astro", "src/components/Button.astro", "src/components/ButtonChip.astro"]);

const LIGHT = ":root";
const DARK = ':root[data-theme="dark"]';

test("the button classes come from one helper", () => {
	assert.equal(buttonClasses({ variant: "primary", size: "lg", icon: "external" }), "btn btn-primary btn-lg");
	assert.equal(buttonClasses({ variant: "secondary", size: "sm", icon: "down" }), "btn btn-secondary btn-sm");
	assert.equal(buttonClasses({ variant: "toggle", size: "sm", icon: "none" }), "btn btn-toggle btn-sm btn-plain");
	const link = SOURCES.find(({ file }) => file === "src/components/ButtonLink.astro").text;
	const button = SOURCES.find(({ file }) => file === "src/components/Button.astro").text;
	assert.match(link, /class:list=\{\[buttonClasses\(\{ variant, size, icon \}\), className\]\} \{\.\.\.rest\}/, "rest attributes reach the <a>");
	assert.match(button, /aria-pressed=\{toggle \? String\(pressed\) : undefined\}/, "a toggle always renders aria-pressed");
	assert.match(button, /\{!toggle && icon !== "none" && <ButtonChip icon=\{icon\} \/>\}/, "a toggle never has an arrow chip");
	const chip = SOURCES.find(({ file }) => file === "src/components/ButtonChip.astro").text;
	assert.match(chip, /<span class="btn-chip" aria-hidden="true">/, "the chip is decorative; the label is the accessible name");
});

test("every .btn rule sits outside @layer, so utilities on the element cannot override it", () => {
	const css = STYLES.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
	const selectors = [...css.matchAll(/(?:^|[{}])\s*([^{}@]*\.(?:btn|skip-link)\b[^{}]*)\{/g)];
	assert.ok(selectors.length >= 20, `expected the button rules, found ${selectors.length}`);
	for (const match of selectors) {
		const at = match.index + match[0].indexOf(match[1]);
		const before = css.slice(0, at);
		const layers = [...before.matchAll(/@layer\b[^{;]*\{/g)];
		const open = layers.filter((layer) => {
			const body = blockFrom(css, layer.index);
			return layer.index + body.length > at;
		});
		assert.deepEqual(open.map((layer) => layer[0]), [], `${match[1].trim()} is inside a cascade layer`);
	}
});

test("primary and secondary pills use the action, panel and stroke roles, with the chip in the page canvas", () => {
	assert.match(rule(".btn {"), /border-radius:\s*999px;/);
	assert.match(rule(".btn {"), /padding-inline:\s*var\(--btn-pad\) calc\(\(var\(--btn-height\) - var\(--btn-chip\)\) \/ 2 - var\(--btn-border\)\);/, "the chip is concentric in the pill's end");
	assert.match(rule(".btn-primary {"), /background-color:\s*var\(--action\);\s*color:\s*var\(--on-action\);\s*box-shadow:\s*var\(--button-shadow\);/);
	assert.match(rule(".btn-primary .btn-chip {"), /background-color:\s*var\(--bg-base\);\s*color:\s*var\(--action\);/);
	assert.match(rule(".btn-secondary,\n.btn-toggle {"), /background-color:\s*var\(--bg-panel\);\s*border-color:\s*var\(--stroke-weak\);\s*color:\s*var\(--text-strong\);/);
	assert.match(rule(".btn-secondary .btn-chip {"), /background-color:\s*var\(--fill-weak\);\s*color:\s*var\(--text-strong\);/);
	assert.match(rule(".btn:focus-visible {"), /outline:\s*2px solid var\(--focus\);\s*outline-offset:\s*2px;/);
	assert.match(rule('.btn-toggle[aria-pressed="true"] {'), /background-color:\s*var\(--bg-sunken\);/);
});

test("hover and press motion runs only without a reduced-motion preference and only on hover-capable pointers", () => {
	const guarded = blockAfter(STYLES.slice(STYLES.indexOf("/* Hover lifts the pill")), "@media (prefers-reduced-motion: no-preference)");
	assert.match(guarded, /\.btn \{\s*transition:\s*transform var\(--motion-duration-press\) var\(--motion-ease-enter\),\s*box-shadow var\(--motion-duration-press\) var\(--motion-ease-fade\);/);
	const hover = blockAfter(guarded, "@media (hover: hover)");
	assert.match(hover, /\.btn:hover \{\s*transform: translateY\(-1px\);/);
	assert.match(hover, /\.btn:hover \.btn-chip \{\s*transform: scale\(1\.04\);/);
	assert.match(hover, /\.btn:hover \.btn-arrow-external \{\s*transform: translate\(2px, -2px\);/);
	assert.match(hover, /\.btn:hover \.btn-arrow-right \{\s*transform: translateX\(3px\);/);
	assert.match(hover, /\.btn:hover \.btn-arrow-down \{\s*transform: translateY\(2px\);/);
	assert.match(guarded, /\.btn:active \{\s*transform: scale\(0\.98\);/);
	const outside = STYLES.replace(guarded, "");
	assert.doesNotMatch(outside, /\.btn[^{]*\{[^}]*\btransform\s*:/, "no button transform outside the no-preference block");
});

test("every label and arrow keeps its contrast in both themes", () => {
	const report = [];
	for (const [selector, theme] of [
		[LIGHT, "light"],
		[DARK, "dark"],
	]) {
		const color = (name) => resolveColor(selector, name);
		const pairs = [
			["primary label", color("--on-action"), color("--action"), 4.5],
			["primary label, hover", color("--on-action"), color("--action-hover"), 4.5],
			["primary label, press", color("--on-action"), color("--action-active"), 4.5],
			["primary arrow on its chip", color("--action"), color("--bg-base"), 3],
			["primary chip on the pill", color("--bg-base"), color("--action"), 3],
			["secondary label", color("--text-strong"), color("--bg-panel"), 4.5],
			["secondary arrow on its chip", color("--text-strong"), composite(color("--fill-weak"), color("--bg-panel")), 3],
			["secondary arrow on its hovered chip", color("--text-strong"), composite(color("--fill-press"), color("--bg-panel")), 3],
			["pressed toggle label", color("--text-strong"), color("--bg-sunken"), 4.5],
		];
		for (const [name, foreground, background, minimum] of pairs) {
			const ratio = contrast(foreground, background);
			report.push(`${theme} ${name}: ${ratio.toFixed(2)}`);
			assert.ok(ratio >= minimum, `${theme} ${name}: ${ratio.toFixed(2)} < ${minimum}`);
		}
	}
	assert.equal(report.length, 18);
});

test("call sites pass layout classes only, and no hand-made button markup is left", () => {
	const LAYOUT = /^(?:shrink-0|skip-link|absolute|right-4|bottom-4|(?:(?:sm|lg):)?self-(?:start|auto))$/;
	const violations = [];
	for (const { file, text } of SOURCES) {
		for (const [, tag, attributes] of text.matchAll(/<(ButtonLink|Button)\b([^>]*)>/g)) {
			const classes = /\bclass="([^"]*)"/.exec(attributes)?.[1] ?? "";
			for (const name of classes.split(/\s+/).filter(Boolean)) {
				if (!LAYOUT.test(name)) violations.push(`${file}: ${tag} carries ${name}`);
			}
		}
		if (BUTTON_COMPONENTS.has(file)) continue;
		for (const pattern of [/\bbg-action\b/, /\btext-on-action\b/, /class="press inline-flex\b/, /\brounded-8 border\b/, /\baria-pressed=/]) {
			if (pattern.test(text)) violations.push(`${file}: ${pattern.source} (use ButtonLink or Button)`);
		}
		for (const [element] of text.matchAll(/<button\b[^>]*>/g)) {
			if (!/role="tab"/.test(element)) violations.push(`${file}: a <button> that is not a tab (use Button)`);
		}
	}
	assert.deepEqual(violations, []);
});

function rule(prelude) {
	const start = STYLES.indexOf(prelude);
	assert.notEqual(start, -1, `missing rule: ${prelude}`);
	return STYLES.slice(start, STYLES.indexOf("}", start));
}

function blockFrom(source, start) {
	const open = source.indexOf("{", start);
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		if (source[index] === "}") depth -= 1;
		if (depth === 0) return source.slice(start, index + 1);
	}
	assert.fail("unbalanced block");
}

function blockAfter(source, prelude) {
	const start = source.indexOf(prelude);
	assert.notEqual(start, -1, `missing ${prelude}`);
	const block = blockFrom(source, start);
	return block.slice(block.indexOf("{") + 1, -1);
}

function resolveColor(selector, name) {
	const start = STYLES.indexOf(`${selector} {`);
	assert.notEqual(start, -1, `missing selector ${selector}`);
	const block = STYLES.slice(STYLES.indexOf("{", start) + 1, STYLES.indexOf("}", start));
	const value = new RegExp(`(?:^|\\s)${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
	assert.ok(value, `${selector} ${name} is missing`);
	const reference = /^var\((--[\w-]+)\)$/.exec(value);
	if (reference) return resolveColor(selector, reference[1]);
	assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/i, `${name}: ${value} is not a hex colour`);
	return value;
}

function channels(hex) {
	const values = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
	return [...values, hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1];
}

function composite(foreground, background) {
	const [r, g, b, alpha] = channels(foreground);
	const under = channels(background);
	return `#${[r, g, b]
		.map((channel, index) => Math.round(channel * alpha + under[index] * (1 - alpha)).toString(16).padStart(2, "0"))
		.join("")}`;
}

function luminance(hex) {
	const [r, g, b] = channels(hex).slice(0, 3).map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}
