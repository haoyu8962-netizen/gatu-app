// The one button style on the built site (operator decision 2026-10-26, "style 4"; source rules in
// tests/button-contract.test.mjs). Run after `astro build` with `pnpm --filter @sairn/website test:dist`.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { byName, closest, findAll, hasAttr, normalizedText, parseHtml } from "./html.mjs";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
assert.ok(existsSync(resolve(DIST, "index.html")), "dist/index.html is missing: run `astro build` before test:dist");

const FILES = readdirSync(DIST, { recursive: true }).map(String);
const LEGAL_PAGES = new Set(["terms/index.html", "privacy/index.html", "risk/index.html", "support/index.html"]);
const MARKETING_PAGES = FILES.filter((file) => file.endsWith(".html") && !LEGAL_PAGES.has(file));
const TERMINAL_LINK = (element) => element.name === "a" && /[?&]utm_source=website(?:&|$)/.test(element.attrs.href ?? "");
// Terminal links that are not buttons: the ticker's market cards and two text links inside running copy.
const TEXT_LINK_SLOTS = new Set(["markets_preipo", "fees_funding"]);
const CARD = (element) => "data-live-card" in element.attrs || "data-live-mirror" in element.attrs;
const classesOf = (element) => (element.attrs.class ?? "").split(/\s+/).filter(Boolean);
// Visual utilities a button must not carry: the unlayered .btn rules own colour, shape, size and type.
const VISUAL_UTILITY = /^(?:[a-z0-9@:[\]-]*:)?(?:bg-|text-(?!left|right|center)|rounded|border|shadow|px-|py-|pl-|pr-|h-\d|min-h-|gap-|font-|press$|inline-flex$|items-|tracking-)/;

function page(file) {
	return parseHtml(readFileSync(resolve(DIST, file), "utf8"));
}

function chipOf(element) {
	return findAll(element, (node) => node.name === "span" && classesOf(node).includes("btn-chip"));
}

test("every call to action into the terminal is a shared pill with an arrow chip", () => {
	let checked = 0;
	for (const file of MARKETING_PAGES) {
		for (const link of findAll(page(file), TERMINAL_LINK)) {
			const slot = new URL(link.attrs.href).searchParams.get("utm_content");
			if (CARD(link) || TEXT_LINK_SLOTS.has(slot)) continue;
			checked += 1;
			const classes = classesOf(link);
			const where = `${file}: ${slot}`;
			assert.ok(classes.includes("btn"), `${where} is not a .btn`);
			assert.ok(classes.includes("btn-primary") || classes.includes("btn-secondary"), `${where} has no variant`);
			assert.equal(classes.includes("btn-plain"), false, `${where} has no arrow chip`);
			const chips = chipOf(link);
			assert.equal(chips.length, 1, `${where} has ${chips.length} chips`);
			assert.equal(chips[0].attrs["aria-hidden"], "true", `${where}: the chip is decorative`);
			assert.equal(findAll(chips[0], (node) => node.name === "svg" && classesOf(node).includes("btn-arrow-external")).length, 1, `${where} points out of the site`);
		}
	}
	assert.ok(checked >= 20, `expected the header, hero, start, FAQ and table CTAs, checked ${checked}`);
});

test("the home page's named buttons keep their copy, variant, size and arrow", () => {
	const home = page("index.html");
	const buttons = findAll(home, (element) => classesOf(element).includes("btn"));
	const describe = (element) => {
		const classes = classesOf(element);
		const arrow = findAll(element, (node) => node.name === "svg")
			.flatMap(classesOf)
			.find((name) => name.startsWith("btn-arrow-"));
		return [normalizedText(element), classes.slice(1, 3).join(" "), arrow ?? "none"];
	};
	const byText = (text) => buttons.filter((element) => normalizedText(element) === text).map(describe);
	assert.deepEqual(byText("Skip to content"), [["Skip to content", "btn-primary btn-md", "none"]]);
	assert.deepEqual(byText("Open terminal"), [["Open terminal", "btn-primary btn-md", "btn-arrow-external"]]);
	assert.deepEqual(byText("Start trading"), Array(3).fill(["Start trading", "btn-primary btn-lg", "btn-arrow-external"]), "hero, Start and FAQ");
	assert.deepEqual(byText("Browse markets"), [["Browse markets", "btn-secondary btn-lg", "btn-arrow-down"]], "the chip replaces the text arrow");
	assert.deepEqual(byText("Show live view"), [["Show live view", "btn-primary btn-md", "btn-arrow-right"]]);
	const browse = buttons.find((element) => normalizedText(element) === "Browse markets");
	assert.equal(browse.attrs.href, "#markets");
	const heroChips = findAll(home, (element) => TERMINAL_LINK(element) && element.attrs.href.endsWith("utm_content=hero_market"));
	assert.ok(heroChips.length >= 2);
	for (const chip of heroChips) assert.deepEqual(classesOf(chip), ["btn", "btn-secondary", "btn-sm"]);
	const trade = findAll(home, (element) => TERMINAL_LINK(element) && /utm_content=markets_(?!preipo)/.test(element.attrs.href));
	assert.ok(trade.length >= 20);
	for (const link of trade) {
		assert.deepEqual(classesOf(link), ["btn", "btn-secondary", "btn-sm"]);
		assert.match(normalizedText(link), /^Trade \S/, "the row's Trade button names its market for screen readers");
	}
});

test("toggles are pills without a chip and keep aria-pressed and the attributes the scripts read", () => {
	const home = page("index.html");
	const toggles = findAll(home, (element) => element.name === "button" && "aria-pressed" in element.attrs);
	assert.deepEqual(
		toggles.map((element) => [normalizedText(element), Object.keys(element.attrs).find((name) => name.startsWith("data-"))]),
		[
			["Pause", "data-ob-pause"],
			["Pause updates and scrolling", "data-live-pause"],
			["Pause live data", "data-live-pause"],
		],
	);
	for (const toggle of toggles) {
		assert.deepEqual(classesOf(toggle), ["btn", "btn-toggle", "btn-sm", "btn-plain"]);
		assert.equal(toggle.attrs["aria-pressed"], "false");
		assert.equal(toggle.attrs.type, "button");
		assert.ok("hidden" in toggle.attrs, "shown by its script once wired");
		assert.equal(chipOf(toggle).length, 0);
	}
	assert.ok(closest(toggles[2], byName("footer")), "the last one is the footer's");
	assert.equal(findAll(home, hasAttr("data-ob-start"))[0].attrs["data-ob-start"], "");
});

test("the 404 page offers the terminal and the home page as pills", () => {
	const main = findAll(page("404.html"), byName("main"))[0];
	const buttons = findAll(main, (element) => element.name === "a" && classesOf(element).includes("btn"));
	assert.deepEqual(
		buttons.map((element) => [normalizedText(element), classesOf(element).join(" "), findAll(element, byName("svg"))[0]?.attrs.class]),
		[
			["Open the terminal", "btn btn-primary btn-md", "btn-arrow btn-arrow-external"],
			["Back home", "btn btn-secondary btn-md", "btn-arrow btn-arrow-right"],
		],
	);
});

test("no button carries a visual utility the shared rules would silently override", () => {
	const violations = [];
	for (const file of FILES.filter((name) => name.endsWith(".html"))) {
		for (const element of findAll(page(file), (node) => classesOf(node).includes("btn"))) {
			for (const name of classesOf(element).filter((name) => VISUAL_UTILITY.test(name))) violations.push(`${file}: ${normalizedText(element)} carries ${name}`);
		}
	}
	assert.deepEqual(violations, []);
});

test("the compiled stylesheet keeps every button rule outside the cascade layers", () => {
	const css = FILES.filter((file) => file.endsWith(".css"))
		.map((file) => readFileSync(resolve(DIST, file), "utf8"))
		.join("\n");
	assert.match(css, /\.btn\{/, "the button rules are in the build");
	const stack = [];
	const found = [];
	let selectorStart = 0;
	for (let index = 0; index < css.length; index += 1) {
		const char = css[index];
		if (char === "{") {
			const prelude = css.slice(selectorStart, index).trim();
			stack.push(prelude);
			if (/(?:^|[\s,>+~(])\.(?:btn|skip-link)(?![\w-])|\.btn-[\w-]+/.test(prelude) && !prelude.startsWith("@")) {
				found.push(prelude);
				const layered = stack.slice(0, -1).filter((entry) => entry.startsWith("@layer"));
				assert.deepEqual(layered, [], `${prelude} is compiled inside ${layered.join(" > ")}`);
			}
			selectorStart = index + 1;
		} else if (char === "}") {
			stack.pop();
			selectorStart = index + 1;
		} else if (char === ";" && stack.length === 0) {
			selectorStart = index + 1;
		}
	}
	for (const selector of [".btn", ".btn-primary", ".btn-secondary,.btn-toggle", ".btn-chip", ".skip-link"]) {
		assert.ok(found.includes(selector), `missing compiled rule ${selector}`);
	}
	assert.match(css, /\.btn-primary\{background-color:var\(--action\);color:var\(--on-action\)/);
});
