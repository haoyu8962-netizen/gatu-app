import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { DESKTOP_NAV_COMPACT_MAX_PX, DESKTOP_NAV_NARROW_MAX_PX, MOBILE_BREAKPOINT_PX } from "../../src/config/layout";

// The default run is the regression matrix: the Latin locales, whose labels render in the bundled IBM Plex
// webfont on every platform, the widest account labels, pairing on and the widths on each side of the two
// collapse points. `TOP_NAV_CONNECTED_MATRIX=full` measures every locale, session, deposit state, pairing
// state and the light theme (runtime guardrails §11 records that run).
const FULL_MATRIX = process.env.TOP_NAV_CONNECTED_MATRIX === "full";
const WIDTHS = FULL_MATRIX
	? [
			1440,
			1300,
			DESKTOP_NAV_COMPACT_MAX_PX + 1,
			DESKTOP_NAV_COMPACT_MAX_PX,
			1182,
			1181,
			DESKTOP_NAV_NARROW_MAX_PX + 1,
			DESKTOP_NAV_NARROW_MAX_PX,
			1101,
			MOBILE_BREAKPOINT_PX + 1,
		]
	: [
			1440,
			DESKTOP_NAV_COMPACT_MAX_PX + 1,
			DESKTOP_NAV_COMPACT_MAX_PX,
			DESKTOP_NAV_NARROW_MAX_PX + 1,
			DESKTOP_NAV_NARROW_MAX_PX,
			MOBILE_BREAKPOINT_PX + 1,
		];
const LOCALES = FULL_MATRIX ? (["en", "zh", "ja", "hi", "es", "fr", "ar"] as const) : (["en", "es", "fr"] as const);
const SESSIONS = FULL_MATRIX ? (["address", "ens", "email"] as const) : (["address", "email"] as const);
const DEPOSITS = ["available", "unavailable"] as const;
const PAIRINGS = FULL_MATRIX ? (["off", "on"] as const) : (["on"] as const);
const LIGHT_CASES = FULL_MATRIX ? ({ locales: ["en", "fr"], widths: [DESKTOP_NAV_COMPACT_MAX_PX + 1] } as const) : null;
const MIN_GAP_PX = 16;

const outDir =
	process.env.TOP_NAV_CONNECTED_OUT ??
	fileURLToPath(new URL("../../test-results/top-nav-connected/measurements", import.meta.url));
const shotGapPx = Number(process.env.TOP_NAV_CONNECTED_SHOT_GAP ?? "24");
const resultsFile = join(outDir, "results.jsonl");

interface Scenario {
	width: number;
	locale: string;
	session: string;
	deposit: string;
	pairing: string;
	theme: "dark" | "light";
}

interface Measurement {
	direction: string;
	viewportWidth: number;
	headerScrollOverflow: number;
	documentScrollOverflow: number;
	leftBlockOverflow: number;
	leftContentEdge: { left: number; right: number };
	rightBlockEdge: { left: number; right: number; width: number };
	gap: number;
	navItems: { label: string; width: number }[];
	moreVisible: boolean;
	logos: { variant: string; width: number }[];
	rightItems: { name: string; width: number }[];
	truncated: { text: string; scrollWidth: number; clientWidth: number }[];
	wrapped: string[];
	overlaps: string[];
	offscreen: string[];
	verticalOverflow: string[];
	depositIconOffset: number | null;
	fontsReady: boolean;
}

function scenarioId({ width, locale, session, deposit, pairing, theme }: Scenario) {
	return `${locale}-${width}-${session}-deposit-${deposit}-pairing-${pairing}-${theme}`;
}

async function measure(page: Page): Promise<Measurement> {
	return page.evaluate(() => {
		const header = document.querySelector("header");
		if (!header) throw new Error("Missing header");
		const [leftBlock, rightBlock] = Array.from(header.children) as HTMLElement[];
		const nav = leftBlock.querySelector("nav");
		const logoLink = leftBlock.querySelector("[data-brand-home-link]");
		if (!nav || !logoLink) throw new Error("Missing navigation or logo");
		const direction = getComputedStyle(header).direction;

		function visible(element: Element) {
			const rect = element.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
		}
		function nameOf(element: Element) {
			return (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/gu, " ");
		}
		function isSrOnly(element: Element) {
			const rect = element.getBoundingClientRect();
			return getComputedStyle(element).position === "absolute" && rect.width <= 1 && rect.height <= 1;
		}

		const logoRect = logoLink.getBoundingClientRect();
		const navRect = nav.getBoundingClientRect();
		const leftContentEdge = {
			left: Math.min(logoRect.left, navRect.width > 0 ? navRect.left : logoRect.left),
			right: Math.max(logoRect.right, navRect.width > 0 ? navRect.right : logoRect.right),
		};
		const rightRect = rightBlock.getBoundingClientRect();
		const rightBlockEdge = { left: rightRect.left, right: rightRect.right, width: rightRect.width };
		const gap =
			direction === "rtl" ? leftContentEdge.left - rightBlockEdge.right : rightBlockEdge.left - leftContentEdge.right;

		const navItems = Array.from(nav.children)
			.filter((child) => child.matches("a, button") && visible(child))
			.map((child) => ({ label: nameOf(child), width: child.getBoundingClientRect().width }));
		const moreWrapper = nav.lastElementChild;
		const moreVisible = !!moreWrapper && !moreWrapper.matches("a, button") && visible(moreWrapper);
		const logos = Array.from(leftBlock.querySelectorAll("[data-brand-logo]"))
			.filter(visible)
			.map((logo) => ({
				variant: logo.getAttribute("data-brand-logo") ?? "",
				width: logo.getBoundingClientRect().width,
			}));

		const interactive = Array.from(header.querySelectorAll("a, button")).filter(visible);
		const rightItems = interactive
			.filter((element) => rightBlock.contains(element))
			.map((element) => ({ name: nameOf(element), width: element.getBoundingClientRect().width }));

		const truncated: Measurement["truncated"] = [];
		const wrapped: string[] = [];
		const verticalOverflow: string[] = [];
		const headerRect = header.getBoundingClientRect();
		for (const element of Array.from(header.querySelectorAll<HTMLElement>("*"))) {
			if (!visible(element) || isSrOnly(element)) continue;
			const style = getComputedStyle(element);
			if (element.scrollWidth > element.clientWidth + 0.5 && style.overflowX !== "visible") {
				truncated.push({
					text: nameOf(element),
					scrollWidth: element.scrollWidth,
					clientWidth: element.clientWidth,
				});
			}
			const rect = element.getBoundingClientRect();
			if (rect.top < headerRect.top - 0.5 || rect.bottom > headerRect.bottom + 0.5) {
				verticalOverflow.push(`${element.tagName.toLowerCase()} ${nameOf(element)}`);
			}
			for (const node of Array.from(element.childNodes)) {
				if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
				const range = document.createRange();
				range.selectNodeContents(node);
				const tops = new Set(Array.from(range.getClientRects()).map((line) => Math.round(line.top)));
				if (tops.size > 1) wrapped.push(nameOf(element));
			}
		}

		const offscreen = interactive
			.filter((element) => {
				const rect = element.getBoundingClientRect();
				return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
			})
			.map(nameOf);

		const overlaps: string[] = [];
		for (let i = 0; i < interactive.length; i += 1) {
			for (let j = i + 1; j < interactive.length; j += 1) {
				const a = interactive[i];
				const b = interactive[j];
				if (a.contains(b) || b.contains(a)) continue;
				const ra = a.getBoundingClientRect();
				const rb = b.getBoundingClientRect();
				const width = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
				const height = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
				if (width > 0.5 && height > 0.5) overlaps.push(`${nameOf(a)} × ${nameOf(b)} (${width.toFixed(1)}px)`);
			}
		}

		const deposit = header.querySelector<HTMLElement>("[data-top-nav-deposit]");
		const depositLabel = deposit?.querySelector("span");
		const depositIcon = deposit?.querySelector("svg");
		let depositIconOffset: number | null = null;
		if (deposit && depositIcon && depositLabel && isSrOnly(depositLabel)) {
			const buttonRect = deposit.getBoundingClientRect();
			const iconRect = depositIcon.getBoundingClientRect();
			depositIconOffset = Math.max(
				Math.abs(iconRect.left + iconRect.width / 2 - (buttonRect.left + buttonRect.width / 2)),
				Math.abs(iconRect.top + iconRect.height / 2 - (buttonRect.top + buttonRect.height / 2)),
			);
		}

		return {
			direction,
			viewportWidth: window.innerWidth,
			headerScrollOverflow: header.scrollWidth - header.clientWidth,
			documentScrollOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			leftBlockOverflow: leftBlock.scrollWidth - leftBlock.clientWidth,
			leftContentEdge,
			rightBlockEdge,
			gap,
			navItems,
			moreVisible,
			logos,
			rightItems,
			truncated,
			wrapped,
			overlaps,
			offscreen,
			verticalOverflow,
			depositIconOffset,
			fontsReady:
				document.fonts.status === "loaded" &&
				document.fonts.check('600 13px "IBM Plex Sans Variable"') &&
				document.fonts.check('700 13px "IBM Plex Sans Variable"'),
		};
	});
}

async function loadScenario(page: Page, scenario: Scenario) {
	await page.setViewportSize({ width: scenario.width, height: 800 });
	const query = new URLSearchParams({
		locale: scenario.locale,
		session: scenario.session,
		deposit: scenario.deposit,
		pairing: scenario.pairing,
		theme: scenario.theme,
	});
	await page.goto(`/top-nav-connected.html?${query.toString()}`);
	await page.waitForFunction(() => window.__sairnTopNavConnected?.ready === true);
	await page.evaluate(async () => {
		await document.fonts.load('600 13px "IBM Plex Sans Variable"');
		await document.fonts.load('700 13px "IBM Plex Sans Variable"');
		await document.fonts.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
}

async function recordScenario(page: Page, scenario: Scenario) {
	await loadScenario(page, scenario);
	let result = await measure(page);
	await page.waitForTimeout(120);
	let second = await measure(page);
	if (!second.fontsReady) {
		await page.evaluate(() => document.fonts.ready);
		second = await measure(page);
	}
	const stable = Math.abs(second.gap - result.gap) < 0.01;
	result = second;
	const id = scenarioId(scenario);
	const flagged =
		result.gap < shotGapPx ||
		result.overlaps.length > 0 ||
		result.offscreen.length > 0 ||
		result.headerScrollOverflow > 0;
	if (flagged) {
		await page.screenshot({
			path: join(outDir, `${id}.png`),
			clip: { x: 0, y: 0, width: scenario.width, height: 56 },
		});
	}
	appendFileSync(resultsFile, `${JSON.stringify({ id, ...scenario, stable, ...result })}\n`);
	expect.soft(result.fontsReady, `${id}: fonts ready`).toBe(true);
	expect.soft(result.gap, `${id}: gap between navigation and wallet controls`).toBeGreaterThanOrEqual(MIN_GAP_PX);
	expect.soft(result.overlaps, `${id}: overlapping controls`).toEqual([]);
	expect.soft(result.offscreen, `${id}: controls outside the viewport`).toEqual([]);
	expect.soft(result.headerScrollOverflow, `${id}: header overflow`).toBeLessThanOrEqual(0);
	expect.soft(result.documentScrollOverflow, `${id}: page overflow`).toBeLessThanOrEqual(0);
	expect.soft(result.wrapped, `${id}: wrapped labels`).toEqual([]);
	if (result.depositIconOffset !== null) {
		expect.soft(result.depositIconOffset, `${id}: icon-only deposit centred`).toBeLessThanOrEqual(1);
	}
	if (scenario.session !== "disconnected" && (scenario.deposit === "unavailable" || scenario.width <= DESKTOP_NAV_COMPACT_MAX_PX)) {
		expect.soft(result.depositIconOffset, `${id}: deposit is icon-only`).not.toBeNull();
	}
}

test.beforeAll(async ({ browser }) => {
	mkdirSync(outDir, { recursive: true });
	writeFileSync(
		join(outDir, "meta.json"),
		JSON.stringify(
			{
				browser: browser.browserType().name(),
				version: browser.version(),
				platform: process.platform,
				startedAt: new Date().toISOString(),
			},
			null,
			2,
		),
	);
});

for (const locale of LOCALES) {
	for (const session of SESSIONS) {
		for (const deposit of DEPOSITS) {
			for (const pairing of PAIRINGS) {
				test(`${locale} ${session} deposit-${deposit} pairing-${pairing} dark`, async ({ page }) => {
					const errors: string[] = [];
					page.on("pageerror", (error) => errors.push(error.message));
					for (const width of WIDTHS) {
						await recordScenario(page, { width, locale, session, deposit, pairing, theme: "dark" });
					}
					expect(errors).toEqual([]);
				});
			}
		}
	}
}

test("disconnected header keeps its margin at every width", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const locale of LOCALES) {
		for (const width of WIDTHS) {
			await recordScenario(page, {
				width,
				locale,
				session: "disconnected",
				deposit: "available",
				pairing: "off",
				theme: "dark",
			});
		}
	}
	expect(errors).toEqual([]);
});

for (const locale of LIGHT_CASES?.locales ?? []) {
	test(`${locale} light`, async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		for (const width of LIGHT_CASES?.widths ?? []) {
			for (const session of SESSIONS) {
				for (const deposit of DEPOSITS) {
					for (const pairing of PAIRINGS) {
						await recordScenario(page, { width, locale, session, deposit, pairing, theme: "light" });
					}
				}
			}
		}
		expect(errors).toEqual([]);
	});
}
