// How the guard reads a real page: collectEntries() and the per-frame guard in headless Chromium,
// on a local fixture page, and how readTerminalBuild() reads build-meta.json from a local HTTP
// server (no internet access). Run from the repository root:
// node --test designs/website-hero-prototype/tools/guard.dom.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const { chromium } = require(require.resolve("@playwright/test", { paths: [path.join(root, "apps/terminal")] }));
const { DEFAULT_MARKET, pageGuardSource, readArea, readTerminalBuild, violationsFor } = require("./guard.cjs");

const config = { dexNames: ["xyz"], perpNames: ["HYPE-USDC"], market: DEFAULT_MARKET };
const clip = { left: 0, top: 0, right: 800, bottom: 500 };

const PAGE = `<!doctype html>
<style>
	body { margin: 0; font: 14px sans-serif; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
	.host .tip { display: none; }
	.host:hover .tip { display: block; }
	.host { position: absolute; left: 400px; top: 200px; width: 120px; height: 40px; }
</style>
<header><button>Connect</button><span data-slot="selector"><button>HYPE/USDC</button><button>Spot</button></span><span>76.10</span></header>
<section data-market-overview>
	<div data-market-stat="volume24h"><span>24h Volume</span><span>41,000,000.00 USDC</span></div>
	<div data-market-stat="contract"><span>Contract</span><a href="#"><bdi>0x0d01...11ec</bdi></a></div>
</section>
<p data-slot="compact-orderbook-mid-price">$76.10</p>
<p style="opacity: 0">Account Value $1,234</p>
<p style="display: none">Account Value $1,234</p>
<p class="sr-only">Account Value $1,234</p>
<div class="host">hover me<div class="tip">40x</div></div>
`;

let browser;
test.before(async () => {
	browser = await chromium.launch();
});
test.after(async () => {
	await browser?.close();
});

async function fixture() {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.setContent(PAGE);
	return page;
}

async function hitsOn(page) {
	const read = await readArea(page, clip);
	return { read, hits: violationsFor(read.entries, config) };
}

test("the fixture page passes and its public values carry their markers", async () => {
	const page = await fixture();
	try {
		const { read, hits } = await hitsOn(page);
		assert.deepEqual(hits, []);
		const byText = Object.fromEntries(read.entries.map((entry) => [entry.text, entry]));
		assert.equal(byText["41,000,000.00 USDC"].stat, "volume24h");
		assert.equal(byText["0x0d01...11ec"].stat, "contract");
		assert.equal(byText["0x0d01...11ec"].kind, "control");
		assert.equal(byText["$76.10"].slot, "compact-orderbook-mid-price");
		assert.ok(!read.entries.some((entry) => entry.text.includes("Account Value")), "concealed text was read");
	} finally {
		await page.close();
	}
});

test("nodes attached to <html> outside <body> are read", async () => {
	const page = await fixture();
	try {
		await page.evaluate(() => {
			const el = document.createElement("div");
			el.textContent = "Account Value $1,234";
			el.style.cssText = "position: fixed; left: 10px; top: 300px;";
			document.documentElement.appendChild(el);
		});
		const { hits } = await hitsOn(page);
		assert.ok(hits.some((hit) => hit.startsWith("account summary")), JSON.stringify(hits));
	} finally {
		await page.close();
	}
});

test("text under a display:contents parent is read as one element", async () => {
	const page = await fixture();
	try {
		await page.evaluate(() => {
			const el = document.createElement("div");
			el.style.display = "contents";
			el.append("40", "x");
			document.body.appendChild(el);
		});
		const { read, hits } = await hitsOn(page);
		assert.ok(read.entries.some((entry) => entry.text === "40x"));
		assert.ok(hits.some((hit) => hit.startsWith("leverage")), JSON.stringify(hits));
	} finally {
		await page.close();
	}
});

test("same-origin iframes inside the area are read with their offset, those outside are not", async () => {
	const page = await fixture();
	try {
		await page.evaluate(() => {
			const inside = document.createElement("iframe");
			inside.srcdoc = "<p style='margin:0'>MetaMask</p>";
			inside.style.cssText = "position: absolute; left: 600px; top: 100px; width: 150px; height: 60px; border: 0;";
			const outside = document.createElement("iframe");
			outside.srcdoc = "<p style='margin:0'>Testnet</p>";
			outside.style.cssText = "position: absolute; left: 10px; top: 520px; width: 150px; height: 60px; border: 0;";
			document.body.append(inside, outside);
			return Promise.all([inside, outside].map((frame) => new Promise((resolve) => frame.addEventListener("load", resolve))));
		});
		const { read, hits } = await hitsOn(page);
		assert.ok(hits.some((hit) => hit.startsWith("wallet brand")), JSON.stringify(hits));
		assert.ok(!hits.some((hit) => hit.startsWith("testnet")), JSON.stringify(hits));
		assert.ok(read.frames.some((frame) => frame.checked));
	} finally {
		await page.close();
	}
});

// The markup of the terminal's OrderbookHoverTooltip: a portalled popup carrying the slot, rows
// as display:contents wrappers around <dt> and <dd>.
const TOOLTIP = `<div style="position: fixed; left: 300px; top: 300px;">
	<div role="tooltip" data-slot="orderbook-cumulative-tooltip">
		<dl style="display: grid; grid-template-columns: 1fr auto; margin: 0;">
			<div class="contents" style="display: contents;"><dt>Average Price</dt><dd style="margin: 0;">76.090</dd></div>
			<div class="contents" style="display: contents;"><dt>Total (HYPE)</dt><dd style="margin: 0;">149.97</dd></div>
			<div class="contents" style="display: contents;"><dt>Total (USDC)</dt><dd style="margin: 0;">11,411</dd></div>
		</dl>
	</div>
</div>`;

test("the book tooltip's quote total passes only under the tooltip's own slot", async () => {
	const page = await fixture();
	try {
		await page.evaluate((html) => document.body.insertAdjacentHTML("beforeend", html), TOOLTIP);
		const { read, hits } = await hitsOn(page);
		assert.deepEqual(hits, []);
		const label = read.entries.find((entry) => entry.text === "Total (USDC)");
		const value = read.entries.find((entry) => entry.text === "11,411");
		assert.equal(label?.slot, "orderbook-cumulative-tooltip");
		assert.equal(value?.slot, "orderbook-cumulative-tooltip");
		assert.equal(read.entries.indexOf(value), read.entries.indexOf(label) + 1);
		await page.evaluate(() => document.querySelector('[data-slot="orderbook-cumulative-tooltip"]').removeAttribute("data-slot"));
		const unmarked = await hitsOn(page);
		assert.ok(unmarked.hits.some((hit) => hit === "money amount: Total (USDC) 11,411"), JSON.stringify(unmarked.hits));
	} finally {
		await page.close();
	}
});

test("readTerminalBuild keeps the build identification and reports an unreadable file", async () => {
	const meta = { name: "sairn", version: "0.1.0", commit: "9ccb88c0066d8083fc43371b5286d8a81d91183b", release: "cloudfront-2026-10-14-p32", builtAt: "2026-10-13T18:02:16.581Z", mobileSync: { enabled: true } };
	const bodies = { "/ok/build-meta.json": JSON.stringify(meta), "/html/build-meta.json": "<!doctype html><p>not json</p>" };
	const server = http.createServer((req, res) => {
		const body = bodies[req.url];
		res.writeHead(body ? 200 : 404, { "content-type": req.url.startsWith("/ok/") ? "application/json" : "text/html" });
		res.end(body ?? "missing");
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		const ok = await readTerminalBuild(browser, `${base}/ok`);
		assert.equal(ok.terminalBuildError, undefined);
		const { url, readAt, ...build } = ok.terminalBuild;
		assert.equal(url, `${base}/ok/build-meta.json`);
		assert.ok(!Number.isNaN(Date.parse(readAt)));
		assert.deepEqual(build, { name: "sairn", version: "0.1.0", commit: meta.commit, release: meta.release, builtAt: meta.builtAt });
		for (const where of ["missing", "html"]) {
			const failed = await readTerminalBuild(browser, `${base}/${where}`);
			assert.equal(failed.terminalBuild, null);
			assert.match(failed.terminalBuildError, new RegExp(`^${base}/${where}/build-meta.json: `));
		}
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test("the per-frame guard sees text revealed by a hover rule alone", async () => {
	const page = await fixture();
	try {
		await page.mouse.move(10, 590);
		await page.evaluate(pageGuardSource(clip, config));
		await page.waitForFunction(() => window.__sairnGuard?.read().checks > 0);
		const before = await page.evaluate(() => window.__sairnGuard.read());
		assert.equal(before.violations.length, 0, JSON.stringify(before.violations));
		await page.mouse.move(450, 220);
		await page.waitForTimeout(150);
		const after = await page.evaluate(() => window.__sairnGuard.read());
		await page.evaluate(() => window.__sairnGuard.stop());
		assert.ok(after.checks > before.checks, `checks ${before.checks} -> ${after.checks}`);
		assert.ok(
			after.violations.some((violation) => violation.hits.some((hit) => hit.startsWith("leverage"))),
			JSON.stringify(after.violations),
		);
	} finally {
		await page.close();
	}
});
