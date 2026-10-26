// Plan §6 motion rules: durations and easings come from brand/loader's motion tokens, CSS only, transform and
// opacity only, default styles are the final state, nothing moves under prefers-reduced-motion, no brand intro.
// Research §5 additions: scroll-driven reveals sit behind @supports (animation-timeline: view()), the hero reel
// runs once for less than five seconds and the ticker marquee moves only while its Pause control is wired.
// 2026-10-26 platform upgrade: card grids stagger with sibling-index() behind @supports, switched tab panels and
// opened disclosures enter with @starting-style, ::details-content opens smoothly where interpolate-size exists,
// and cross-document view transitions run only without a reduced-motion preference.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import tokens from "../../../brand/loader/sairn-motion.tokens.json" with { type: "json" };
import { HERO_HEADLINE, HERO_REEL_WORDS } from "../src/config/copy.ts";
import { MOTION_CSS_VARIABLES, MOTION_ROOT_RULE } from "../src/lib/motion.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = readFileSync(resolve(WEBSITE_ROOT, "src/styles/global.css"), "utf8");
const BASE = readFileSync(resolve(WEBSITE_ROOT, "src/layouts/Base.astro"), "utf8");
const CSP = readFileSync(resolve(WEBSITE_ROOT, "src/lib/csp.ts"), "utf8");
const TABS_SCRIPT = readFileSync(resolve(WEBSITE_ROOT, "src/scripts/tabs.ts"), "utf8");
const LIVE_SCRIPT = readFileSync(resolve(WEBSITE_ROOT, "src/scripts/live-markets.ts"), "utf8");
const KEYFRAMES = ["hero-reel", "ticker-scroll", "reveal-rise"];
const COMPONENTS = readdirSync(resolve(WEBSITE_ROOT, "src/components")).map((file) => ({
	file,
	text: readFileSync(resolve(WEBSITE_ROOT, "src/components", file), "utf8"),
}));

test("the motion custom properties equal the brand motion tokens", () => {
	assert.deepEqual(MOTION_CSS_VARIABLES, {
		"--motion-duration-feedback": `${tokens.duration.feedback}ms`,
		"--motion-duration-confirm": `${tokens.duration.confirm}ms`,
		"--motion-duration-press": `${tokens.duration.feedback / 2}ms`,
		"--motion-duration-swap": `${tokens.duration.feedback / 2}ms`,
		"--motion-duration-brand": `${tokens.duration.brand}ms`,
		"--motion-duration-loop-calm": `${tokens.duration["loop-calm"]}ms`,
		"--motion-ease-enter": tokens.easing.enter,
		"--motion-ease-fade": tokens.easing.fade,
		"--motion-ease-loop": tokens.easing.loop,
	});
	assert.equal(
		MOTION_ROOT_RULE,
		`:root{${Object.entries(MOTION_CSS_VARIABLES)
			.map(([name, value]) => `${name}:${value}`)
			.join(";")}}`,
	);
	assert.match(BASE, /import \{ MOTION_ROOT_RULE \} from "@\/lib\/motion";/);
	assert.match(BASE, /<style is:inline data-motion-tokens set:html=\{MOTION_ROOT_RULE\} \/>/);
});

// Transitions move transform and opacity. The one registered exception is the smooth <details> opening the
// operator asked for (2026-10-26): ::details-content animates its block-size to auto and keeps content-visibility
// until the closing transition ends. It runs only in the .disclosure::details-content rule.
const DETAILS_CONTENT_EXCEPTIONS = {
	"block-size": "::details-content opens to block-size: auto (interpolate-size), operator request 2026-10-26",
	"content-visibility": "keeps the closing ::details-content painted until its block-size transition ends",
};

test("the stylesheet takes every transition duration and easing from the motion properties and moves only transform and opacity", () => {
	const declarations = [...STYLES.matchAll(/([^{};]*)\{[^{}]*?\btransition\s*:\s*([^;]+);/g)].map((match) => ({
		selector: match[1].trim(),
		value: match[2],
	}));
	assert.ok(declarations.length >= 6, "expected the press, tab panel, row, caret, disclosure and details-content transitions");
	const exceptionsUsed = new Set();
	for (const { selector, value } of declarations) {
		if (/^0\.01ms\b/.test(value.trim())) continue;
		for (const part of value.split(/,(?![^(]*\))/)) {
			const [property, duration, easing, ...rest] = part.trim().split(/\s+(?![^(]*\))/);
			if (property in DETAILS_CONTENT_EXCEPTIONS) {
				assert.equal(selector, ".disclosure::details-content", `${property} transitions only on ::details-content`);
				exceptionsUsed.add(property);
				assert.deepEqual(rest, property === "content-visibility" ? ["allow-discrete"] : []);
			} else {
				assert.ok(["transform", "opacity"].includes(property), `"${part.trim()}" animates ${property}`);
				assert.deepEqual(rest, []);
			}
			assert.match(duration, /^var\(--motion-duration-[a-z-]+\)$/, `"${part.trim()}" has a literal duration`);
			assert.match(easing, /^var\(--motion-ease-[a-z]+\)$/, `"${part.trim()}" has a literal easing`);
		}
	}
	assert.deepEqual([...exceptionsUsed].sort(), Object.keys(DETAILS_CONTENT_EXCEPTIONS).sort(), "a listed exception is no longer used");
	const longhands = [...STYLES.matchAll(/(?<![\w-])transition-([a-z-]+)\s*:\s*([^;]+);/g)].filter(([, , value]) => !/^0\.01ms\b/.test(value.trim()));
	assert.deepEqual(
		longhands.map(([, property, value]) => [property, value.trim()]),
		[["delay", "calc((sibling-index() - 1) * var(--motion-duration-swap) / 5)"]],
		"the only transition longhand is the staggered row delay, derived from the swap duration",
	);
	assert.doesNotMatch(STYLES, /cubic-bezier\(/, "easings come from the tokens");
});

test("keyframes move only transform and opacity, and every animation runs only without a reduced-motion preference", () => {
	const keyframes = [...STYLES.matchAll(/@keyframes ([\w-]+)\s*\{/g)].map((match) => match[1]);
	assert.deepEqual(keyframes.sort(), [...KEYFRAMES].sort());
	for (const name of KEYFRAMES) {
		const body = blockAfter(STYLES, `@keyframes ${name}`);
		for (const [, property] of body.matchAll(/([a-z-]+)\s*:/g)) {
			assert.ok(["transform", "opacity"].includes(property), `@keyframes ${name} animates ${property}`);
		}
	}
	const noPreference = blockAfter(STYLES, "@media (prefers-reduced-motion: no-preference)");
	const outside = allBlocksAfter(STYLES, "@media (prefers-reduced-motion: no-preference)").reduce((css, block) => css.replace(block, ""), STYLES);
	assert.doesNotMatch(outside, /\banimation(?:-name|-timeline|-range)?\s*:/, "an animation outside a no-preference block would run under reduced motion");
	assert.doesNotMatch(outside, /@starting-style|view-transition|interpolate-size|sibling-index/, "entry, stagger and page transitions run only without a reduced-motion preference");
	const animations = [...noPreference.matchAll(/\banimation\s*:\s*([^;]+);/g)].map((match) => match[1].trim().split(/\s+(?![^(]*\))/));
	assert.equal(animations.length, 4, "the hero reel, the ticker and the two scroll-driven reveals");
	for (const [name, duration, easing] of animations) {
		assert.ok(KEYFRAMES.includes(name), `unknown animation ${name}`);
		if (name === "reveal-rise") {
			assert.equal(duration, "auto", "a scroll-driven reveal has no time duration");
		} else {
			assert.match(duration, /^(?:var|calc\(var)\(--motion-duration-[a-z-]+\)/, `${name} has a literal duration`);
		}
		if (name === "ticker-scroll") assert.equal(easing, "linear", "a marquee moves at a constant speed");
		else assert.match(easing, /^var\(--motion-ease-[a-z]+\)$/, `${name} has a literal easing`);
	}
	const supports = blockAfter(noPreference, "@supports (animation-timeline: view())");
	assert.match(supports, /animation: reveal-rise auto/, "reveals run only where scroll-driven animations exist");
	assert.match(supports, /animation-timeline: view\(\);/);
	assert.doesNotMatch(noPreference.replace(`@supports (animation-timeline: view()) {${supports}}`, ""), /reveal-rise|animation-timeline/);
});

test("the hero reel runs once, under five seconds, and starts and ends on the static headline", () => {
	const noPreference = blockAfter(STYLES, "@media (prefers-reduced-motion: no-preference)");
	const reel = /\.reel-track\s*\{\s*animation:\s*hero-reel calc\(var\(--motion-duration-([a-z-]+)\) \* ([\d.]+)\)[^;]*\s1\s+both;/.exec(noPreference);
	assert.ok(reel, "the reel animates once (iteration count 1)");
	const total = tokens.duration[reel[1]] * Number(reel[2]);
	assert.ok(total < 5_000, `the reel moves for ${total} ms; WCAG 2.2.2 needs a pause control above 5 s`);
	assert.equal(HERO_REEL_WORDS[0], HERO_REEL_WORDS.at(-1));
	assert.ok(HERO_HEADLINE.startsWith(`${HERO_REEL_WORDS[0]} on Hyperliquid.`));
	const steps = HERO_REEL_WORDS.length - 1;
	const body = blockAfter(STYLES, "@keyframes hero-reel");
	const offsets = [...body.matchAll(/translateY\((-?[\d.]+)%?\)/g)].map((match) => Number(match[1]));
	assert.deepEqual(offsets, Array.from({ length: steps + 1 }, (_, index) => -((index * 100) / (steps + 1))).map((value) => value || 0));
	const hero = COMPONENTS.find(({ file }) => file === "Hero.astro").text;
	assert.match(hero, /<span class="sr-only">\{HERO_HEADLINE\}<\/span>/, "the H1's accessible name is the plan's sentence");
	assert.match(hero, /<span aria-hidden="true" class="block">\s*<span class="reel/, "the reel is decorative");
});

test("the ticker becomes a marquee only once its Pause control is wired, and pauses on hover and focus", () => {
	const noPreference = blockAfter(STYLES, "@media (prefers-reduced-motion: no-preference)");
	assert.match(noPreference, /\[data-ticker="moving"\] \.ticker-track \{\s*animation: ticker-scroll/);
	assert.match(noPreference, /\[data-ticker="moving"\] \.ticker-viewport:is\(:hover, :focus-within\) \.ticker-track \{\s*animation-play-state: paused;/);
	assert.match(STYLES, /\.ticker-mirror \{\s*display: none;/, "the duplicated cards exist only while the marquee moves");
	const wiring = LIVE_SCRIPT.indexOf('strip.dataset.ticker = "moving"');
	assert.ok(wiring > LIVE_SCRIPT.indexOf("startLiveMarkets"), "the script starts the marquee");
	assert.ok(wiring < LIVE_SCRIPT.indexOf("button.hidden = false"), "together with showing the Pause control");
	assert.match(LIVE_SCRIPT, /strip\.dataset\.ticker = paused \? "paused" : "moving";/);
	const live = COMPONENTS.find(({ file }) => file === "LiveMarkets.astro").text;
	assert.match(live, /data-ticker="static"/, "without the script the ticker is a scroll-snap row");
	assert.match(live, /class="ticker-list ticker-mirror py-1" aria-hidden="true" inert>/);
});

test("default styles are the final state and motion stops under prefers-reduced-motion", () => {
	const withoutKeyframes = KEYFRAMES.reduce((css, name) => css.replace(blockAfter(css, `@keyframes ${name}`), ""), STYLES);
	const withoutStartingStyles = allBlocksAfter(withoutKeyframes, "@starting-style").reduce((css, block) => css.replace(block, ""), withoutKeyframes);
	assert.doesNotMatch(withoutStartingStyles, /opacity:\s*0\s*;/, "nothing starts hidden outside a keyframe or a @starting-style entry");
	assert.match(blockAfter(STYLES, "@keyframes reveal-rise"), /^\s*from \{/, "the reveal ends on the element's own style");
	assert.ok(24 <= tokens.maxPanelTranslationAt1024, "the reveal offset stays within the brand's panel translation");
	assert.match(CSP, /export const JS_CLASS_SCRIPT = 'document\.documentElement\.classList\.add\("js"\);';/);
	assert.match(BASE, /<script is:inline set:html=\{JS_CLASS_SCRIPT\} \/>/);
	assert.doesNotMatch(BASE, /IntersectionObserver|reveal-in/, "reveals no longer depend on a script");
	const reduced = STYLES.slice(STYLES.indexOf("@media (prefers-reduced-motion: reduce)"));
	assert.match(reduced, /transition-duration: 0\.01ms !important;/);
	assert.match(reduced, /animation-duration: 0\.01ms !important;/);
	assert.match(reduced, /scroll-behavior: auto !important;/);
	assert.match(STYLES, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.press:active\s*\{\s*transform: none;/);
});

test("components add no colour fades, keyframe animations, scroll effects or brand intro", () => {
	const violations = [];
	for (const { file, text } of COMPONENTS) {
		const match = /\b(?:transition(?:-colors|-all)?|duration-\d+|animate-[a-z-]+|ease-(?:in|out|linear)[a-z-]*)(?=[\s"'])/.exec(text);
		if (match) violations.push(`${file}: ${match[0]}`);
		if (/brand-intro|NumberFlow|parallax|scroll-snap-stop|requestAnimationFrame|@keyframes|animation-timeline/i.test(text)) violations.push(`${file}: forbidden motion`);
	}
	assert.deepEqual(violations, []);
	const hero = COMPONENTS.find(({ file }) => file === "Hero.astro").text;
	assert.doesNotMatch(hero, /\breveal\b/, "the H1 is the LCP element and is never hidden for an animation");
});

test("card grids stagger with sibling-index() only where it is supported, on the scroll-driven reveal", () => {
	const guard = "@supports (animation-delay: calc(sibling-index() * 1ms))";
	const guarded = allBlocksAfter(STYLES, guard);
	assert.equal(guarded.length, 2, "the scroll-driven card reveal and the market-row stagger");
	const unguarded = guarded.reduce((css, block) => css.replace(block, ""), STYLES).replaceAll(guard, "");
	assert.doesNotMatch(unguarded, /sibling-index\(/, "sibling-index() is used only behind its @supports test");
	assert.doesNotMatch(STYLES, /:nth-child\([^)]*\)\s*\{[^}]*(?:animation|transition)-delay/, "no nth-child delay lists");
	const reveal = blockAfter(STYLES, "@supports (animation-timeline: view())");
	assert.ok(reveal.includes(guard), "the card stagger sits inside the scroll-driven reveal's own @supports");
	const stagger = blockAfter(reveal, guard);
	assert.match(stagger, /\.reveal-stagger > \* \{\s*animation: reveal-rise auto var\(--motion-ease-enter\) both;\s*animation-timeline: view\(\);\s*animation-range: cover calc\(\(sibling-index\(\) - 1\) \* 40px\)/);
	const grids = COMPONENTS.filter(({ text }) => /\breveal-stagger\b/.test(text)).map(({ file }) => file).sort();
	assert.deepEqual(grids, ["AccountExecution.astro", "Features.astro", "LiveMarkets.astro"], "account points, features list and stats");
	for (const { file, text } of COMPONENTS) {
		for (const [classes] of text.matchAll(/class="[^"]*\breveal-stagger\b[^"]*"/g)) {
			assert.doesNotMatch(classes, /\breveal\b(?!-)/, `${file}: a staggered grid is not also a .reveal, or it would fade twice`);
		}
	}
});

test("switched tab panels, market rows and opened disclosures enter with @starting-style, never on first render", () => {
	const noPreference = blockAfter(STYLES, "@media (prefers-reduced-motion: no-preference)");
	const entries = allBlocksAfter(noPreference, "@starting-style").map((block) => block.trim().split("{")[0].trim());
	assert.deepEqual(entries, ["[data-tabs-switched] [data-tabpanel]", "[data-tabs-switched] [data-tabpanel] tbody > tr", ".disclosure[open] > :not(summary)"]);
	assert.match(TABS_SCRIPT, /root\.dataset\.tabsSwitched = "";/, "tabs.ts marks a block only when it switches");
	for (const { file, text } of COMPONENTS) {
		assert.doesNotMatch(text, /data-tabs-switched/, `${file}: the first render is never marked as switched`);
	}
	const faq = COMPONENTS.find(({ file }) => file === "Faq.astro").text;
	const live = COMPONENTS.find(({ file }) => file === "LiveMarkets.astro").text;
	assert.match(faq, /<details class="disclosure faq-item /);
	assert.match(live, /<details class="disclosure stats-method /);
	const smooth = blockAfter(noPreference, "@supports selector(::details-content) and (interpolate-size: allow-keywords)");
	assert.match(smooth, /\.disclosure \{\s*interpolate-size: allow-keywords;/, "interpolation to auto is scoped to the disclosures");
	assert.match(smooth, /\.disclosure\[open\]::details-content \{\s*block-size: auto;/);
});

test("cross-document view transitions cross-fade under 250 ms, keep the header and run only without reduced motion", () => {
	const blocks = allBlocksAfter(STYLES, "@media (prefers-reduced-motion: no-preference)");
	const transitions = blocks.filter((block) => block.includes("@view-transition"));
	assert.equal(transitions.length, 1);
	const [block] = transitions;
	assert.match(block, /@view-transition \{\s*navigation: auto;\s*\}/);
	assert.equal((STYLES.match(/@view-transition\b/g) ?? []).length, 1, "the at-rule exists only inside the guard");
	assert.match(block, /::view-transition-old\(root\),\s*::view-transition-new\(root\) \{\s*animation-duration: var\(--motion-duration-swap\);/);
	assert.ok(MOTION_CSS_VARIABLES["--motion-duration-swap"] === `${tokens.duration.feedback / 2}ms` && tokens.duration.feedback / 2 <= 250);
	assert.match(block, /\.site-header \{\s*view-transition-name: site-header;/);
	assert.match(block, /::view-transition-group\(site-header\),\s*::view-transition-new\(site-header\) \{\s*animation: none;/);
	const before = STYLES.slice(0, STYLES.indexOf("@view-transition"));
	const layerDepth = (before.match(/@layer[^{]*\{/g) ?? []).length;
	assert.equal((before.match(/{/g) ?? []).length - (before.match(/}/g) ?? []).length, 1, "only the media query wraps @view-transition, no @layer");
	assert.ok(layerDepth >= 0);
	const nav = COMPONENTS.find(({ file }) => file === "Nav.astro").text;
	assert.match(nav, /<header class="site-header /);
	for (const { file, text } of [...COMPONENTS, { file: "Base.astro", text: BASE }]) {
		assert.doesNotMatch(text, /ClientRouter|ViewTransitions|astro:transitions/, `${file}: no client-side router`);
	}
});

/** The text between the braces of every block that follows an occurrence of `prelude`. */
function allBlocksAfter(source, prelude) {
	const blocks = [];
	let from = 0;
	for (;;) {
		const start = source.indexOf(prelude, from);
		if (start === -1) return blocks;
		const block = blockAfter(source.slice(start), prelude);
		blocks.push(block);
		from = start + prelude.length + block.length;
	}
}

/** The text between the braces of the first block that follows `prelude`. */
function blockAfter(source, prelude) {
	const start = source.indexOf(prelude);
	assert.notEqual(start, -1, `missing ${prelude}`);
	const open = source.indexOf("{", start);
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		if (source[index] === "}") depth -= 1;
		if (depth === 0) return source.slice(open + 1, index);
	}
	assert.fail(`unbalanced ${prelude}`);
}
