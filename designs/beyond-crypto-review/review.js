// Fills the review draft from the dated snapshot. Nothing here fetches live data.

// Row text follows the R1 and R2 samples in docs/marketing/beyond-crypto-review.md §4.4; keep them identical.
const XYZ_DOCS = [
	{ href: "https://docs.trade.xyz/perpetuals/markets/stocks/us", label: "XYZ documentation: US stock sessions" },
	{
		href: "https://docs.trade.xyz/perpetuals/specifications-and-schedules/holiday-closures",
		label: "XYZ documentation: holiday closures",
	},
	{ href: "https://docs.trade.xyz/perpetuals/mechanics/external-price", label: "XYZ documentation: external price" },
	{ href: "https://docs.trade.xyz/perpetuals/mechanics/oracle-price", label: "XYZ documentation: oracle price" },
];

const ENTROPY_DOCS = [
	{ href: "https://docs.entropy.io/market-types/pre-ipo-perpetuals", label: "EntropyIO documentation: price unit" },
	{ href: "https://docs.entropy.io/pre-ipo-perp-mechanics/oracle-price", label: "EntropyIO documentation: oracle price" },
	{ href: "https://docs.entropy.io/pre-ipo-perp-mechanics/extreme-mark-bounds", label: "EntropyIO documentation: price bounds" },
	{ href: "https://docs.entropy.io/asset-directory/pre-ipo-assets", label: "EntropyIO documentation: asset parameters" },
	{
		href: "https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution",
		label: "EntropyIO documentation: settlement without a listing",
	},
];

function listedTracks(venue) {
	return `Its reference price follows US market prices for ${venue} in US dollars, including pre-market, after-hours and overnight sessions; at weekends and on holidays XYZ sets it from prices in its own market. No ownership, dividends or voting rights. XYZ can halt, settle or delist it.`;
}

const UNLISTED_TRACKS =
	"With no exchange price for the company, EntropyIO sets the reference price under a method described in its documentation: the price stands for company market capitalisation, blending prices from this market's order book with private-market data. EntropyIO lists the criteria that data is scored on (recency, depth and historical reliability), but says the scoring and aggregation procedure is internal. The reference price is kept within bounds that EntropyIO can change, but trades can still happen outside them. If the company has not listed by the date EntropyIO has set, or EntropyIO announces an early settlement, the market settles at an average of its recent prices. EntropyIO can halt, settle or delist it, and can change these settlement terms. No ownership, dividends, voting or IPO allocation rights.";

const ROWS = [
	{
		coin: "xyz:SNDK",
		code: "SNDK",
		issuer: "Sandisk Corporation (Nasdaq: SNDK)",
		tracks: listedTracks("Nasdaq: SNDK"),
		badge: "R1 · BC-18",
		docs: XYZ_DOCS,
	},
	{
		coin: "xyz:NBIS",
		code: "NBIS",
		issuer: "Nebius Group N.V. (Nasdaq: NBIS)",
		tracks: listedTracks("Nasdaq: NBIS"),
		badge: "R1 · BC-18",
		docs: XYZ_DOCS,
	},
	{
		coin: "io:ANTH",
		code: "ANTH",
		issuer: "Anthropic PBC",
		tracks: UNLISTED_TRACKS,
		badge: "R2 · BC-18 · G1 · D2 · D3",
		docs: ENTROPY_DOCS,
		preIpo: true,
	},
	{
		coin: "io:OAI",
		code: "OAI",
		issuer: "OpenAI Group PBC",
		tracks: UNLISTED_TRACKS,
		badge: "R2 · BC-18 · G1 · D2 · D3",
		docs: ENTROPY_DOCS,
		preIpo: true,
	},
];

const ASIS = [
	["selector-traditional-finance.png", "Market selector, Traditional Finance tab (leverage badges visible)"],
	["selector-hip-3.png", "Market selector, HIP-3 tab"],
	["selector-pre-launch.png", "Market selector, Pre-launch tab (io:OAI listed under the deployer's display name, OPENAI-USDC)"],
	[
		"trade-io-oai-disclaimer.png",
		"io:OAI behind the deployer disclaimer (the market page reads OAI-USDC; the market selector shows OPENAI-USDC)",
	],
	["trade-io-anth-disclaimer.png", "io:ANTH behind the deployer disclaimer"],
	["trade-xyz-sndk-disclaimer.png", "xyz:SNDK behind the deployer disclaimer"],
];

function groupDigits(value) {
	const [int, frac] = String(value).split(".");
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return frac === undefined ? grouped : `${grouped}.${frac}`;
}

function badge(text) {
	const span = document.createElement("span");
	span.className = "q";
	span.textContent = text;
	return span;
}

function cell(text, className) {
	const td = document.createElement("td");
	if (className) td.className = className;
	td.textContent = text;
	return td;
}

function marketCell(row) {
	const td = cell(row.code);
	const tag = document.createElement("span");
	tag.className = "tag";
	tag.textContent = row.preIpo ? `${row.issuer} · not publicly listed` : row.issuer;
	td.append(document.createElement("br"), tag);
	if (row.preIpo) td.append(badge("D6"));
	return td;
}

function docsCell(docs) {
	const td = document.createElement("td");
	const list = document.createElement("ul");
	list.className = "doc-links";
	for (const doc of docs) {
		const item = document.createElement("li");
		const link = document.createElement("a");
		link.href = doc.href;
		link.rel = "noopener noreferrer";
		link.textContent = `${doc.label} ↗`;
		const hint = document.createElement("span");
		hint.className = "sr-only";
		hint.textContent = " (opens the deployer's site)";
		link.append(hint);
		item.append(link);
		list.append(item);
	}
	const note = document.createElement("span");
	note.className = "tag";
	note.textContent = "Links open the deployer's site.";
	td.append(list, note, badge("G6"));
	return td;
}

function priceCell(row, data) {
	if (!row.preIpo && data.annotation?.category !== "preipo") return cell(groupDigits(data.ctx.markPx), "opt num");
	const td = cell("—", "opt num");
	td.append(badge("withheld pending J3"));
	return td;
}

async function main() {
	const snapshot = await (await fetch("./data/markets-snapshot.json")).json();
	const byCoin = new Map(snapshot.markets.map((m) => [m.coin, m]));
	document.getElementById("snapshot-time").textContent = `${snapshot.fetchedAt.slice(11, 19)} UTC, ${snapshot.fetchedAt.slice(0, 10)}`;
	const tbody = document.getElementById("rows");
	for (const row of ROWS) {
		const data = byCoin.get(row.coin);
		if (!data || data.ctx?.isDelisted !== false) continue;
		const tr = document.createElement("tr");
		const tracks = cell(row.tracks);
		tracks.append(badge(row.badge));
		const status = cell("Not delisted at snapshot");
		status.append(badge("G4"));
		const volume = Math.floor(Number(data.ctx.dayNtlVlm));
		tr.append(
			marketCell(row),
			cell(data.deployerFullName),
			tracks,
			docsCell(row.docs),
			status,
			priceCell(row, data),
			cell(`${groupDigits(volume)} USDC`, "opt num"),
		);
		tbody.append(tr);
	}
	const grid = document.getElementById("asis-grid");
	for (const [file, label] of ASIS) {
		const figure = document.createElement("figure");
		const img = document.createElement("img");
		img.src = `./as-is/${file}`;
		img.alt = label;
		img.loading = "lazy";
		const caption = document.createElement("figcaption");
		caption.textContent = `${label}. Product as-is, not marketing material.`;
		figure.append(img, caption);
		grid.append(figure);
	}
	const toggle = document.getElementById("optional-columns");
	toggle.addEventListener("change", () => {
		document.body.classList.toggle("show-optional", toggle.checked);
	});
}

main();
