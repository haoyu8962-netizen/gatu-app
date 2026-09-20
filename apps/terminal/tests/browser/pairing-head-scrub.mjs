// Causal check for the pairing head scrub on a built terminal: the fragment must leave the address
// bar while the module entry is still being withheld, and the withheld entry must then receive the
// exact link. Comparing timestamps would prove nothing (caches and scheduling reorder them), so the
// entry response is paused instead. Use a throwaway test link only and never record a trace or HAR.
//   node apps/terminal/tests/browser/pairing-head-scrub.mjs <origin> <pairing url on that origin>
import { chromium } from "@playwright/test";

const origin = (process.argv[2] ?? "http://127.0.0.1:3030").replace(/\/+$/, "");
const pairingUrl = process.argv[3];
if (!pairingUrl?.startsWith(`${origin}/`) || !pairingUrl.includes("#")) {
	console.error("usage: pairing-head-scrub.mjs <origin> <pairing url on that origin, with its fragment>");
	process.exit(2);
}

const ENTRY = /\/assets\/index-[^/]+\.js$/;
const results = [];
function record(name, ok, detail = "") {
	results.push({ name, ok, detail });
	console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function openWithheld(browser, url, { beforeScripts } = {}) {
	const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	const violations = [];
	await page.exposeFunction("__reportViolation", (violation) => violations.push(violation));
	await page.addInitScript(() => {
		document.addEventListener("securitypolicyviolation", (event) =>
			window.__reportViolation(`${event.effectiveDirective} ${event.blockedURI}`),
		);
	});
	if (beforeScripts) await page.addInitScript(beforeScripts);

	let release = () => {};
	const released = new Promise((resolve) => {
		release = resolve;
	});
	let withheld = 0;
	await page.route(ENTRY, async (route) => {
		withheld += 1;
		await released;
		await route.continue();
	});
	await page.goto(url, { waitUntil: "commit" });
	await page.waitForFunction(() => document.readyState !== "loading", undefined, { timeout: 15_000 });
	return { context, page, release, violations, withheldCount: () => withheld };
}

const browser = await chromium.launch();
try {
	const expectedClean = new URL(pairingUrl);
	expectedClean.hash = "";

	const direct = await openWithheld(browser, pairingUrl);
	record("the module entry was withheld", direct.withheldCount() > 0, `${direct.withheldCount()} request(s) paused`);
	record(
		"the fragment left the address bar while the entry was still withheld",
		direct.page.url() === expectedClean.href,
		direct.page.url().replace(origin, "").slice(0, 60),
	);
	const status = await direct.page.evaluate(() => window.__gatuPairingBootstrap?.status);
	record("the head script reports a captured link", status === "captured", String(status));
	direct.release();
	await direct.page.getByText("Desktop QR loaded").waitFor({ timeout: 30_000 }).then(
		() => record("the released entry received the exact link and reached Import", true),
		() => record("the released entry received the exact link and reached Import", false, "Desktop QR loaded never appeared"),
	);
	record("no content security policy violation", direct.violations.length === 0, direct.violations.join("; "));
	await direct.context.close();

	const stolen = await openWithheld(browser, pairingUrl, {
		beforeScripts: () => {
			document.addEventListener("readystatechange", () => window.__gatuPairingBootstrap?.take(), { once: true });
		},
	});
	stolen.release();
	// The static notice is replaced at once by the clean pairing page, which repeats the explanation.
	await stolen.page
		.waitForFunction(
			() =>
				document.querySelector("[data-terminal-bootstrap-error]") !== null ||
				document.body.textContent?.includes("could not be opened safely"),
			undefined,
			{ timeout: 30_000 },
		)
		.then(
			() => record("a link taken by another script blocks the application and explains itself", true),
			() => record("a link taken by another script blocks the application and explains itself", false, "no notice"),
		);
	const importedAnyway = await stolen.page.getByText("Desktop QR loaded").count();
	record("nothing was loaded from the taken link", importedAnyway === 0);
	record(
		"the blocked page moved on to the clean pairing page",
		!stolen.page.url().includes("#"),
		stolen.page.url().replace(origin, ""),
	);
	await stolen.context.close();

	const never = await openWithheld(browser, pairingUrl);
	await never.page.waitForTimeout(1_500);
	record("the address stays clean when the entry never loads", never.page.url() === expectedClean.href);
	await never.context.close();
} finally {
	await browser.close();
}

if (results.some((result) => !result.ok)) process.exit(1);
