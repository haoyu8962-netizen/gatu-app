// Corner radii of every dashboard surface, card and notice, grouped by nesting depth: d0 sits on the
// dashboard canvas, d1 inside one rounded or shaded box, and so on. It reads computed styles in
// headless Chromium, so it also works while the in-app browser pane is hidden, and it covers only
// the states the page reaches without a wallet; check connected states in a fixture or on a real
// account. Usage: node apps/terminal/tests/browser/dashboard-surface-audit.mjs [origin] [address]
// (WIDTHS=1440,375 by default).
import { chromium } from "@playwright/test";

const origin = (process.argv[2] ?? "http://localhost:3005").replace(/\/+$/, "");
const address = process.argv[3] ?? "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";
const widths = (process.env.WIDTHS ?? "1440,375").split(",").map(Number);
const routes = [
	"/portfolio",
	"/earn",
	"/staking",
	"/vaults",
	`/vaults/${address}`,
	"/referrals",
	"/leaderboard",
	"/fundingComparison",
	`/fundingHistory/${address}`,
	`/historicalOrders/${address}`,
	`/tradeHistory/${address}`,
	"/api-wallet",
];

function auditPage() {
	const main = document.querySelector("main");
	if (!main) return ["no <main> rendered"];
	const skipped =
		'button, a[role="button"], input, select, textarea, [role="tab"], [role="switch"], [role="progressbar"], svg, .sr-only, table, [aria-hidden="true"], [role="tooltip"]';
	function describe(element) {
		const style = getComputedStyle(element);
		const radius = Number.parseFloat(style.borderTopLeftRadius) || Number.parseFloat(style.borderTopRightRadius);
		const background = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
		const border = Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
		const shadow = style.boxShadow !== "none";
		return { radius, background, border, shadow, isBox: radius > 0 && (background || border || shadow) };
	}
	const counts = new Map();
	for (const element of main.querySelectorAll("*")) {
		if (element.closest(skipped)) continue;
		const box = describe(element);
		if (!box.isBox) continue;
		const rect = element.getBoundingClientRect();
		if (rect.width < 60 || rect.height < 30 || box.radius >= rect.height / 2 - 1) continue;
		let depth = 0;
		for (let parent = element.parentElement; parent && parent !== main; parent = parent.parentElement) {
			if (describe(parent).isBox) depth++;
		}
		const classes = (typeof element.className === "string" ? element.className : "")
			.split(/\s+/)
			.filter((name) => /rounded|shadow|^bg-|border-stroke/.test(name))
			.join(" ");
		const flags = `${box.shadow ? " shadow" : ""}${box.border ? " border" : ""}${box.background ? " fill" : ""}`;
		const line = `d${depth} ${Math.round(box.radius)}px${flags} <${element.tagName.toLowerCase()}> ${classes.slice(0, 90)}`;
		counts.set(line, (counts.get(line) ?? 0) + 1);
	}
	return [...counts].map(([line, count]) => `${count}x ${line}`);
}

const browser = await chromium.launch();
try {
	for (const width of widths) {
		const page = await browser.newPage({ viewport: { width, height: 900 } });
		for (const route of routes) {
			await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
			await page.waitForSelector("main", { timeout: 90_000 });
			await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 6000));
			console.log(`== ${width}px ${route.replace(address, "<address>")}`);
			for (const line of await page.evaluate(auditPage)) console.log(`   ${line}`);
		}
		await page.close();
	}
} finally {
	await browser.close();
}
