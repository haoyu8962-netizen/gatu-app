// Rules of the DOM guard. Run: node --test designs/website-hero-prototype/tools/guard.test.cjs
// The fixtures are abridged from what collectEntries() read from the signed-out terminal on
// 2026-10-25, including the data-market-stat and data-slot markers it attaches.
const test = require("node:test");
const assert = require("node:assert/strict");
const { violationsFor, readTerminalConfig, terminalBuildFrom, DEFAULT_MARKET } = require("./guard.cjs");

const config = {
	dexNames: ["abcd", "cash", "flx", "hyna", "io", "km", "mkts", "para", "vntl", "xyz"],
	perpNames: ["BTC-USDC", "ETH-USDC", "HYPE-USDC"],
	market: DEFAULT_MARKET,
};

const text = (value, marks) => ({ text: value, kind: "text", ...marks });
const control = (value, marks) => ({ text: value, kind: "control", ...marks });
const input = (value) => ({ text: value, kind: "input" });
const stat = (id) => ({ stat: id });
const slot = (id) => ({ slot: id });

const DESKTOP = [
	control("Trade"),
	control("Connect Wallet"),
	control("BTC-USDC"),
	control("-0.29%"),
	control("HYPE-USDC"),
	control("HYPE/USDC", slot("popover-trigger")),
	control("Spot", slot("popover-trigger")),
	text("Price", stat("price")),
	text("76.184", { stat: "price", slot: "market-overview-price-value" }),
	text("24h Change", stat("change24h")),
	text("-0.847 / -1.10%", stat("change24h")),
	text("24h Volume", stat("volume24h")),
	text("41,114,387.02 USDC", stat("volume24h")),
	text("Market Cap", stat("marketCap")),
	text("23,007,579,880 USDC", stat("marketCap")),
	text("Contract", stat("contract")),
	control("0x0d01...11ec", stat("contract")),
	control("5m"),
	control("1h"),
	text("O"),
	text("76.703"),
	text("−0.516 (−0.67%)"),
	text("Volume"),
	text("SMA"),
	text("5.29 K"),
	control("Order Book"),
	text("Size\n(HYPE)"),
	text("Total\n(HYPE)"),
	control("76.201", slot("orderbook-price-text")),
	control("525.01", slot("orderbook-size-value")),
	control("1,183.44", slot("orderbook-asks")),
	text("Spread", slot("orderbook-spread")),
	text("0.001 (0.001%)", slot("orderbook-spread")),
	control("Market", slot("trade-panel-header")),
	control("Limit", slot("trade-panel-header")),
	control("Advanced", slot("trade-panel-header")),
	control("TWAP"),
	control("Scale"),
	control("Buy"),
	control("Sell"),
	text("Available", slot("trade-panel-fields")),
	text("Size", slot("trade-panel-fields")),
	input("0.00"),
	control("HYPE", slot("trade-panel-fields")),
	input("0"),
	text("%"),
	text("Order Value"),
	text("-"),
	text("Est. Slippage"),
	text("Est <0.0001% / Max 8.00%"),
	text("Fees"),
	text("0.0700% / 0.0400%"),
	text("12:34:56"),
];

// The Limit form after a bid row was clicked: the price input holds the public price, its "0.00"
// placeholder is followed by the "USDC" unit, and the book's cumulative tooltip is open.
const DESKTOP_LIMIT = DESKTOP.flatMap((entry) =>
	entry.text === "Available"
		? [entry, text("Price", slot("trade-panel-fields")), input("76.08"), input("0.00"), text("USDC", slot("trade-panel-fields")), control("Mid", slot("trade-panel-fields"))]
		: [entry],
).concat([
	text("Distance from mid", slot("orderbook-cumulative-tooltip")),
	text("0.0164%", slot("orderbook-cumulative-tooltip")),
	text("Average Price", slot("orderbook-cumulative-tooltip")),
	text("76.090", slot("orderbook-cumulative-tooltip")),
	text("Total (HYPE)", slot("orderbook-cumulative-tooltip")),
	text("149.97", slot("orderbook-cumulative-tooltip")),
	text("Total (USDC)", slot("orderbook-cumulative-tooltip")),
	text("11,411", slot("orderbook-cumulative-tooltip")),
]);

const MOBILE = [
	control("Connect", slot("mobile-header-account")),
	control("HYPE/USDC", slot("mobile-market-selector")),
	control("Spot", slot("mobile-market-selector")),
	text("76.148", slot("mobile-market-bar")),
	control("Market", slot("mobile-order-entry-content")),
	control("Available", slot("mobile-order-entry-content")),
	control("0.00", slot("mobile-order-entry-content")),
	control("USDC", slot("mobile-order-entry-content")),
	text("Size", slot("mobile-order-entry-content")),
	input("0.00"),
	control("HYPE", slot("mobile-order-entry-content")),
	text("PRICE", slot("compact-orderbook")),
	control("76.162", slot("orderbook-price-text")),
	control("5.96", slot("orderbook-size-value")),
	text("$76.148", slot("compact-orderbook-mid-price")),
	control("76.147", slot("orderbook-price-text")),
];

function withExtra(base, extra, at = base.length) {
	return [...base.slice(0, at), ...extra, ...base.slice(at)];
}

function rejects(entries, name, message) {
	const hits = violationsFor(entries, config);
	assert.ok(
		hits.some((hit) => hit.startsWith(name)),
		`${message}: expected a "${name}" hit, got ${JSON.stringify(hits)}`,
	);
}

test("the signed-out desktop and phone spot pages pass", () => {
	assert.deepEqual(violationsFor(DESKTOP, config), []);
	assert.deepEqual(violationsFor(DESKTOP_LIMIT, config), []);
	assert.deepEqual(violationsFor(MOBILE, config), []);
});

test("legitimate signed-out texts are not violations", () => {
	for (const value of ["HYPE/USDC", "Spot", "Limit", "Market", "TWAP", "Scale", "Buy", "Sell", "Connect", "Total (USDC)", "Price (USDC)", "40.123", "1,234.56", "Slippage", "Crosshair", "Max 8.00%"]) {
		assert.deepEqual(violationsFor(withExtra(DESKTOP, [text(value)]), config), [], value);
	}
	for (const extra of [
		[text("Available"), text("0.00 USDC")],
		[text("Available"), text("0.00"), text("USDC")],
		[text("Available"), text("0.00"), text("HYPE")],
		[text("Available"), text("0"), text("USDC")],
		[text("Available: 0.00 USDC")],
		[text("Available"), text("-")],
		[text("Available to Trade"), text("-")],
	]) {
		assert.deepEqual(violationsFor(withExtra(MOBILE, extra), config), [], JSON.stringify(extra));
	}
});

test("leverage is rejected whether it is one element or split across two", () => {
	for (const extra of [[text("40x")], [text("40 x")], [text("40×")], [text("40"), text("x")], [text("40"), text("×")], [input("40x")], [{ text: "40x", kind: "value" }]]) {
		rejects(withExtra(DESKTOP, extra), "leverage", JSON.stringify(extra));
	}
});

test("margin-mode words are rejected case-insensitively", () => {
	for (const value of ["Leverage", "leverage", "Cross", "CROSS", "Isolated", "Cross 10x"]) {
		rejects(withExtra(DESKTOP, [text(value)]), "margin wording", value);
	}
});

test("HIP-3 markets are rejected as prefixed names, dex badges and builder display names", () => {
	const cases = [
		[text("xyz:TSLA"), "HIP-3 market"],
		[text("XYZ:TSLA"), "HIP-3 market"],
		[text("flx:GOLD"), "HIP-3 market"],
		[control("xyz"), "HIP-3"],
		[control("XYZ"), "HIP-3"],
		[control("km"), "HIP-3 dex badge"],
		[control("io"), "HIP-3 dex badge"],
		[control("TSLA-USDC"), "perp or HIP-3 market"],
		[control("OPENAI-USDH"), "perp or HIP-3 market"],
		[control("SOL-USDC"), "perp or HIP-3 market"],
	];
	for (const [entry, name] of cases) rejects(withExtra(DESKTOP, [entry]), name, entry.text);
});

test("wallet addresses, brands, testnet, PnL and account summaries are rejected", () => {
	const cases = [
		[control("0x1234567890abcdef1234567890abcdef12345678"), "wallet address"],
		[control("0x12…abcd"), "wallet address"],
		[control("0x12...abcd"), "wallet address"],
		[control("MetaMask"), "wallet brand"],
		[text("Testnet"), "testnet"],
		[text("Unrealized PnL"), "PnL"],
		[text("Portfolio Value"), "account summary"],
		[text("Account Value"), "account summary"],
	];
	for (const [entry, name] of cases) rejects(withExtra(DESKTOP, [entry]), name, entry.text);
});

test("a shortened address is allowed only as the value of the market header's Contract stat", () => {
	rejects(withExtra(DESKTOP, [text("Contract"), control("0x12...abcd")]), "wallet address", "Contract label outside the stat");
	rejects(withExtra(DESKTOP, [text("Contract", stat("volume24h")), control("0x12...abcd", stat("volume24h"))]), "wallet address", "another stat");
	rejects(withExtra(DESKTOP, [control("0x12...abcd", stat("contract"))]), "wallet address", "no label before it");
	rejects(
		DESKTOP.filter((entry) => entry.text !== "Contract"),
		"wallet address",
		"label removed",
	);
});

test("only zero may follow Available, up to the first form field", () => {
	for (const extra of [
		[text("Available"), text("12.30 USDC")],
		[text("Available"), text("0 1234")],
		[text("Available"), text("0"), text("1234")],
		[text("Available"), text("12.5")],
		[text("Available"), text("$0.01")],
		[text("Available"), text("$0.00")],
		[text("Available"), text("<0.01")],
		[text("Available"), text("HYPE 12.3")],
		[text("Available"), text("Max 12.3")],
		[text("Available"), text("Max"), text("12.30")],
		[text("Available"), text("USDC"), text("12.30")],
		[text("Available to Trade"), text("12.30")],
		[text("Available: 12.30 USDC")],
		[text("Available 0"), text("1234")],
	]) {
		rejects(withExtra(MOBILE, extra), "balance", JSON.stringify(extra));
	}
});

test("money amounts anywhere else are rejected, in one element or split over two", () => {
	for (const value of ["<0.01", "≈ 12.30 USDC", "USDC 12.00", "USDC: 12.30", "USDC=12.30", "12.00 USDC", "$1,234.56", "$12", "1.2K USDC"]) {
		rejects(withExtra(DESKTOP, [text(value)]), "money amount", value);
	}
	for (const extra of [
		[text("12.30"), text("USDC")],
		[text("1.2K"), text("USDH")],
		[text("USDC"), text("12.30")],
		[text("$"), text("1,234.56")],
		[text("US$"), text("12")],
		[text("≈"), text("12.30")],
	]) {
		rejects(withExtra(DESKTOP, extra), "money amount", JSON.stringify(extra));
	}
	rejects(withExtra(MOBILE, [text("$80.00", slot("compact-orderbook-mid-price"))]), "money amount", "mid price far from the market price");
});

test("public market values pass only in their own stat or slot", () => {
	rejects(withExtra(DESKTOP, [text("Volume"), text("12.30 USDC")]), "money amount", "chart legend Volume label");
	rejects(withExtra(DESKTOP, [text("24h Vol"), text("$5,000")]), "money amount", "abbreviated label");
	rejects(withExtra(DESKTOP, [text("24h Volume"), text("$5,000")]), "money amount", "label without the stat marker");
	rejects(withExtra(DESKTOP, [text("24h Volume", stat("volume24h")), text("$5,000 balance", stat("volume24h"))]), "money amount", "value with extra words");
	rejects(withExtra(DESKTOP, [text("Market Cap", stat("volume24h")), text("$5,000", stat("volume24h"))]), "money amount", "label of another stat");
	rejects(withExtra(DESKTOP, [text("12.30 USDC", stat("volume24h"))]), "money amount", "stat value without its label");
	rejects(withExtra(DESKTOP, [text("$76.50")]), "money amount", "dollar price outside the phone book");
	rejects(withExtra(MOBILE, [text("$76.20")]), "money amount", "phone dollar price outside the mid-price slot");
	rejects(withExtra(MOBILE, [text("$76,150", slot("compact-orderbook-mid-price"))]), "money amount", "mid-price slot with a figure far from the market price");
});

test("a figure after a label with a USD unit in parentheses is an amount, outside the book tooltip's quote total", () => {
	const tip = slot("orderbook-cumulative-tooltip");
	for (const extra of [
		[text("Total (USDC)"), text("11,411")],
		[text("Total (USDC)", tip), text("11,411")],
		[text("Total (USDC)"), text("11,411", tip)],
		[text("Total (USDC)", stat("volume24h")), text("11,411", stat("volume24h"))],
		[text("Equity (USDC)", tip), text("11,411", tip)],
		[text("Total (USDT)", tip), text("11,411", tip)],
		[text("Total (USDC)", tip), text("-11,411", tip)],
		[text("Total (USDC)", tip), text("11,411 USDC", tip)],
		[text("Balance (USDH):"), text("12.30")],
		[text("Amount ($)"), text("5")],
		[text("Size (US$)"), text("−3.2")],
		[text("Total\n(USDC)"), control("76.201", slot("orderbook-price-text"))],
		[text("Total (USDC) 11,411")],
		[text("Total (USDC): 11,411")],
		[text("Total (USDC) 11,411", tip)],
		[text("Total\n(USDC)\n11,411", tip)],
	]) {
		rejects(withExtra(DESKTOP, extra), "money amount", JSON.stringify(extra));
	}
	rejects(
		DESKTOP_LIMIT.map((entry) => (entry.text === "11,411" ? text("11,411") : entry)),
		"money amount",
		"tooltip value without the slot",
	);
	rejects(
		DESKTOP_LIMIT.map((entry) => (entry.slot === "orderbook-cumulative-tooltip" ? text(entry.text, slot("orderbook-hover")) : entry)),
		"money amount",
		"tooltip under another slot",
	);
	assert.deepEqual(violationsFor(DESKTOP_LIMIT, config), []);
	assert.deepEqual(violationsFor(withExtra(DESKTOP, [text("Total (USDC)", tip), text("11,411", tip)]), config), []);
	assert.deepEqual(violationsFor(withExtra(DESKTOP, [text("Total (USDC)", tip), text("0.42", tip)]), config), []);
});

test("only build identification fields of the expected shape are kept from build-meta.json", () => {
	const meta = {
		name: "sairn",
		version: "0.1.0",
		commit: "9ccb88c0066d8083fc43371b5286d8a81d91183b",
		release: "cloudfront-2026-10-14-p32",
		builtAt: "2026-10-13T18:02:16.581Z",
		chartLibraryScript: "/charting_library/charting_library.6d17e2dafb1007c4.js",
		mobileSync: { enabled: true },
		privyFiatFunding: { mainnet: true, testnet: true },
	};
	assert.deepEqual(terminalBuildFrom(meta), {
		name: "sairn",
		version: "0.1.0",
		commit: "9ccb88c0066d8083fc43371b5286d8a81d91183b",
		release: "cloudfront-2026-10-14-p32",
		builtAt: "2026-10-13T18:02:16.581Z",
	});
	const leaky = terminalBuildFrom({
		...meta,
		name: "AKIAIOSFODNN7EXAMPLE",
		version: "0.1.0-token.abc",
		release: "sk_live_4eC39HqLyjWDarjtT1zdp7dc",
		builtAt: "2026-10-13 18:02",
		apiKey: "abc",
		token: "eyJhbGciOiJIUzI1NiJ9.e30.abc",
	});
	assert.deepEqual(leaky, { commit: "9ccb88c0066d8083fc43371b5286d8a81d91183b" });
	assert.equal(terminalBuildFrom({ ...meta, release: "eyJhbGciOiJIUzI1NiJ9.e30.abc" }).release, undefined);
	assert.throws(() => terminalBuildFrom({ name: "sairn", commit: "not-a-hash" }), /no commit or release/);
	assert.throws(() => terminalBuildFrom([meta]), /not a JSON object/);
	assert.throws(() => terminalBuildFrom(null), /not a JSON object/);
});

test("the signed-out and market checks fail without their evidence", () => {
	const noConnect = DESKTOP.filter((entry) => entry.text !== "Connect Wallet");
	rejects(noConnect, "signed-out check", "no Connect");
	rejects(noConnect.concat(text("Connect")), "signed-out check", "Connect as plain text");
	rejects(
		DESKTOP.filter((entry) => entry.text !== "HYPE/USDC"),
		"market check",
		"no title",
	);
	rejects(
		DESKTOP.filter((entry) => entry.text !== "Spot"),
		"market check",
		"no Spot badge",
	);
	rejects(
		DESKTOP.map((entry) => (entry.text === "Spot" ? control("Perp") : entry)),
		"market check",
		"Perp badge",
	);
});

test("the terminal config still lists the deployers and default favourites the guard reads", () => {
	const terminal = readTerminalConfig();
	assert.ok(terminal.dexNames.includes("xyz"));
	assert.deepEqual(terminal.perpNames, ["BTC-USDC", "ETH-USDC", "HYPE-USDC"]);
});
