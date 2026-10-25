// Scripted steps for the product demo loops. Spot markets only: perpetual pages show
// leverage, and the market selector's unfiltered list can show tokenised stocks and
// unsuitable token names, so the loops never open it. Each loop returns the interface to
// the state it started in (chart interval, tab, order type and side); the market data keeps
// moving, so prices, the book and the chart jump where the video repeats.

const tv = (page) => page.frameLocator('iframe[src*="charting_library"]');
const trade = (page) => page.locator(".desktop-grid-panel").filter({ has: page.getByRole("button", { name: "Advanced order types" }) });

async function desktopReady(page) {
	await page.getByRole("combobox", { name: "Select token" }).waitFor();
	await page.getByRole("button", { name: /^Bid, Price/ }).first().waitFor();
	await tv(page).getByRole("radio", { name: "1 hour" }).first().waitFor();
	await page.waitForTimeout(3000);
}

async function mobileReady(page) {
	await page.getByRole("combobox", { name: "Select token" }).waitFor();
	await page.getByRole("button", { name: /^Bid, Price/ }).first().waitFor();
	await page.waitForTimeout(2500);
}

module.exports = [
	{
		name: "desktop",
		route: "/trade/HYPE/USDC",
		viewport: { width: 1440, height: 900 },
		dpr: 1,
		mobile: false,
		ready: desktopReady,
		park: { x: 1180, y: 860 },
		steps: [
			{ label: "hold", run: (p, h) => h.hold(900) },
			{ label: "chart 5m", run: async (p, h) => h.click(tv(p).getByRole("radio", { name: "5 minutes" }).first(), 900) },
			{ label: "recent trades", run: async (p, h) => h.click(p.getByRole("tab", { name: "Recent Trades" }), 900) },
			{ label: "order book", run: async (p, h) => h.click(p.getByRole("tab", { name: "Order Book" }), 500) },
			{ label: "limit", run: async (p, h) => h.click(trade(p).getByRole("button", { name: "Limit", exact: true }), 350) },
			{ label: "bid row fills price", run: async (p, h) => h.click(p.getByRole("button", { name: /^Bid, Price/ }).nth(2), 700) },
			{ label: "sell", run: async (p, h) => h.click(trade(p).getByRole("tab", { name: "Sell" }), 550) },
			{
				label: "twap",
				run: async (p, h) => {
					await h.click(trade(p).getByRole("button", { name: "Advanced order types" }), 300);
					await h.click(p.getByRole("menuitem", { name: "TWAP" }), 900);
				},
			},
			{
				label: "scale",
				run: async (p, h) => {
					await h.click(trade(p).getByRole("button", { name: "Advanced order types" }), 300);
					await h.click(p.getByRole("menuitem", { name: "Scale" }), 1000);
				},
			},
			{
				label: "back to buy and market",
				run: async (p, h) => {
					await h.click(trade(p).getByRole("tab", { name: "Buy" }), 250);
					await h.click(trade(p).getByRole("button", { name: "Market", exact: true }), 400);
				},
			},
			{ label: "chart 1h", run: async (p, h) => h.click(tv(p).getByRole("radio", { name: "1 hour" }).first(), 700) },
			{ label: "park cursor", run: async (p, h) => h.park(600) },
		],
	},
	{
		name: "mobile",
		route: "/trade/HYPE/USDC",
		viewport: { width: 390, height: 844 },
		dpr: 2,
		mobile: true,
		capture: "screenshots",
		ready: mobileReady,
		steps: [
			{ label: "hold", run: (p, h) => h.hold(700) },
			{
				label: "limit",
				run: async (p, h) => {
					await h.tap(p.getByRole("button", { name: "Order type" }), 400);
					await h.tap(p.getByRole("menuitem", { name: "Limit" }), 500);
				},
			},
			{ label: "bid row fills price", run: async (p, h) => h.tap(p.getByRole("button", { name: /^Bid, Price/ }).nth(1), 700) },
			{ label: "sell", run: async (p, h) => h.tap(p.getByRole("tab", { name: "Sell" }), 600) },
			{ label: "asks only", run: async (p, h) => h.tap(p.getByRole("button", { name: "Show asks only" }), 700) },
			{ label: "both sides", run: async (p, h) => h.tap(p.getByRole("button", { name: "Show both sides" }), 500) },
			{
				label: "back to buy and market",
				run: async (p, h) => {
					await h.tap(p.getByRole("tab", { name: "Buy" }), 300);
					await h.tap(p.getByRole("button", { name: "Order type" }), 350);
					await h.tap(p.getByRole("menuitem", { name: "Market" }), 800);
				},
			},
		],
	},
];
