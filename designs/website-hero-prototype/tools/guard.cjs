// DOM guard shared by the terminal screenshot and the demo recordings.
//
// collectEntries() runs in the page and reads the recorded area, starting at <html> so that nodes
// attached outside <body> count: one entry per visible element that renders text of its own (its
// whole innerText, so "40" and "x" in one element read "40x"; visibility comes from the text's own
// boxes, so text under a display:contents parent counts), plus the value, placeholder and
// aria-valuetext of visible form controls and sliders. Entries carry the enclosing
// data-market-stat and data-slot of the terminal markup. Same-origin iframes are read with their
// offset; cross-origin ones are listed as unchecked.
//
// makeGuard(config).violationsFor(entries) is the pure rule set, used by the Node tests, by the
// Node-side checks and, injected into the page, by the per-frame guard. It rejects leverage
// figures and margin-mode words, HIP-3 markets (prefixed names, dex badges, builder display names),
// wallet addresses and brands, testnet, PnL, account summaries and money amounts, including an
// amount split over two neighbouring elements ("12.30" + "USDC", "$" + "1,234") and a figure
// after a label that names a USD unit in parentheses ("Total (USDC)" + "11,411", in one element
// or two). After "Available" (a bare label, or one with words but no figure such as "Available
// to Trade"), a figure in the same element and the entries after it, three parts in all and up
// to the first form field or slider, may hold no figure other than zero ("0", "0.00",
// "0.00USDC"). The only other figures it lets through are four public market values, each bound
// to its element: the value of the market header's "24h Volume" and "Market Cap" stats
// (data-market-stat), the token contract's shortened address in its "Contract" stat, the phone
// book's dollar mid price (data-slot="compact-orderbook-mid-price", within 1% of the market
// price), and the quote total of the desktop book's cumulative hover tooltip (a plain number
// right after "Total (<quote>)", both in data-slot="orderbook-cumulative-tooltip"). It requires
// a visible Connect control and the expected spot market title with its Spot badge.
//
// Limits: text drawn on a canvas (the TradingView price scale and series), CSS generated content,
// shadow DOM and the content of cross-origin iframes cannot be read. Input values are not paired
// with their neighbours (the price input's "USDC" unit would reject the public price). A column
// header that names a USD unit in parentheses right before a figure (the book or trades header
// with sizes shown in USDC) is rejected as well; a fresh session shows sizes in the base token.
// The Connect control is a consistency check, not proof of a signed-out session: the guarantee is
// that every capture runs in a fresh browser context with no stored session.
//
// readTerminalBuild() records which deployed terminal build a capture shows (build-meta.json).

const fs = require("node:fs");
const path = require("node:path");

const TERMINAL_CONFIG = path.resolve(__dirname, "../../../apps/terminal/src/config");
const INFO_URL = "https://api.hyperliquid.xyz/info";
const DEFAULT_MARKET = { title: "HYPE/USDC", kind: "Spot" };

// Self-contained so that it can be serialised into the page with toString().
function makeGuard(config) {
	const options = config || {};
	const market = options.market || { title: "HYPE/USDC", kind: "Spot" };
	const dexNames = new Set((options.dexNames || []).map((name) => String(name).trim().toLowerCase()).filter(Boolean));
	const perpNames = new Set((options.perpNames || []).map((name) => String(name).trim().toUpperCase()).filter(Boolean));
	const RULES = [
		["leverage", /\d\s*[x×✕](?![a-z0-9])/i],
		["margin wording", /\b(?:leverage|cross|isolated)\b/i],
		["HIP-3 market", /\b[a-z][a-z0-9]{1,7}:[a-z0-9]{2,}/i],
		["HIP-3 market", /\bxyz\b/i],
		["wallet address", /\b0x[0-9a-f]{6,}/i],
		["wallet address", /\b0x[0-9a-f]{2,}\s*(?:…|\.{2,3})\s*[0-9a-f]{2,}/i],
		["wallet brand", /metamask|coinbase|okx|binance|walletconnect|rabby|phantom|rainbow|trust wallet|zerion|backpack/i],
		["testnet", /testnet/i],
		["PnL", /\bpnl\b|unrealized|realized/i],
		["account summary", /portfolio value|account value|account equity|total equity|margin ratio|maintenance margin|withdrawable/i],
	];
	// Perpetual display names ("BTC-USDC"); HIP-3 markets drop their dex prefix ("TSLA-USDC"), so
	// only the default favourites of a fresh session may appear.
	const PERP_NAME = /\b([a-z0-9]{2,12})-(usd[a-z0-9]*)\b/gi;
	const MONEY = [
		/\$\s*\d/,
		/\d[\d,.]*\s*[kmbt]?\s*usd[a-z0-9]*\b/i,
		/\busd[a-z0-9]*\s*[:=]?\s*\d/i,
		/[≈<＜]\s*\d[\d,.]*(?![\d,.]|\s*%)/,
		/\(\s*(?:usd[a-z0-9]*|(?:us)?\$)\s*\)\s*[:=]?\s*[-−+]?\d/i,
	];
	// An amount split over two neighbouring elements: a figure and a USD token symbol in either
	// order, a lone currency or approximation sign before a figure, or a label that ends in a USD
	// unit in parentheses ("Total (USDC)") before a figure.
	const ENDS_IN_FIGURE = /\d\s*[kmbt]?$/i;
	const STARTS_WITH_FIGURE = /^\d/;
	const USD_SYMBOL = /^usd[a-z0-9]*$/i;
	const AMOUNT_SIGN = /^(?:us)?\$$|^[≈<＜]$/i;
	const USD_UNIT_LABEL = /\(\s*(?:usd[a-z0-9]*|(?:us)?\$)\s*\)\s*:?$/i;
	const SIGNED_FIGURE = /^[-−+]?\d/;
	// "Available" as a label of its own or with words but no figure ("Available to Trade"); a figure
	// in the same element is checked as the first value part.
	const AVAILABLE = /^available:?(?: (.*))?$/i;
	const AVAILABLE_PARTS = 3;
	// Inside the value after "Available" every word with a digit must be zero, optionally followed
	// by a token symbol: "0", "0.00", "0.00USDC". Words without a digit (symbols, labels, "-") pass.
	const ZERO_WORD = /^0(?:\.0+)?(?:[A-Z][A-Z0-9]{1,9})?$/;
	// Public market values, recognised by the terminal's own markup rather than by position.
	const PUBLIC_STATS = { volume24h: "24h Volume", marketCap: "Market Cap" };
	const STAT_VALUE = /^(?:[-–—]|\$?\d[\d,]*(?:\.\d+)? ?[KMBT]?(?: [A-Z][A-Z0-9]{1,9})?)$/;
	const CONTRACT_STAT = "contract";
	const CONTRACT_LABEL = "Contract";
	const SHORT_ADDRESS = /^0x[0-9a-f]{2,8}\s*(?:…|\.{2,3})\s*[0-9a-f]{2,8}$/i;
	const MID_PRICE_SLOT = "compact-orderbook-mid-price";
	// The desktop book's cumulative hover tooltip (orderbook-hover-tooltip.tsx) lists the quote
	// total of the levels up to the hovered row as "Total (<quote>)" and a plain number.
	const TOOLTIP_SLOT = "orderbook-cumulative-tooltip";
	const quoteToken = /\/([A-Z0-9]{2,12})$/.exec(market.title);
	const TOOLTIP_TOTAL_LABEL = quoteToken ? `Total (${quoteToken[1]})` : null;
	const CONNECT = /^connect(?: wallet)?$/i;
	const PLAIN_NUMBER = /^\d[\d,]*(?:\.\d+)?$/;
	const DOLLAR_PRICE = /^\$ ?(\d[\d,]*(?:\.\d+)?)$/;

	function clean(value) {
		return String(value == null ? "" : value)
			.replace(/[\s\u00a0\u2007\u202f]+/g, " ")
			.trim();
	}

	function violationsFor(entries) {
		const list = [];
		for (const entry of entries || []) {
			const text = clean(entry && entry.text);
			if (text) list.push({ text, kind: entry.kind || "text", stat: entry.stat || null, slot: entry.slot || null });
		}
		const hits = new Set();
		const hit = (name, text) => hits.add(`${name}: ${text.length > 120 ? `${text.slice(0, 117)}...` : text}`);
		const titleAt = list.findIndex(
			(entry, i) => entry.text === market.title && list.slice(Math.max(0, i - 4), i + 5).some((near) => near.text === market.kind),
		);
		const priceEntry = titleAt < 0 ? null : list.slice(titleAt + 1, titleAt + 7).find((entry) => PLAIN_NUMBER.test(entry.text));
		const marketPrice = priceEntry ? Number(priceEntry.text.replace(/,/g, "")) : null;
		const isField = (entry) => entry.kind === "input" || entry.kind === "value";
		const labelBefore = (entry, i, mark, id, text) => {
			const label = i > 0 ? list[i - 1] : null;
			return Boolean(label && entry[mark] === id && label[mark] === id && label.text === text);
		};
		const isStatValue = (entry, i) => Boolean(PUBLIC_STATS[entry.stat]) && labelBefore(entry, i, "stat", entry.stat, PUBLIC_STATS[entry.stat]) && STAT_VALUE.test(entry.text);
		const isContract = (entry, i) => labelBefore(entry, i, "stat", CONTRACT_STAT, CONTRACT_LABEL) && SHORT_ADDRESS.test(entry.text);
		const isMidPrice = (entry) => {
			const match = entry.slot === MID_PRICE_SLOT && DOLLAR_PRICE.exec(entry.text);
			return Boolean(match && marketPrice > 0 && Math.abs(Number(match[1].replace(/,/g, "")) - marketPrice) <= marketPrice * 0.01);
		};
		const isTooltipTotal = (entry, i) =>
			Boolean(TOOLTIP_TOTAL_LABEL) && labelBefore(entry, i, "slot", TOOLTIP_SLOT, TOOLTIP_TOTAL_LABEL) && PLAIN_NUMBER.test(entry.text);

		// Each "Available" label owns the next parts up to the first form field; amounts in those
		// parts are judged by the balance rule only.
		const owner = new Map();
		list.forEach((entry, i) => {
			const label = AVAILABLE.exec(entry.text);
			if (!label) return;
			const parts = [];
			if (label[1] && /\d/.test(label[1])) {
				parts.push(label[1]);
				owner.set(i, i);
			}
			for (let j = i + 1; j < list.length && parts.length < AVAILABLE_PARTS; j += 1) {
				if (isField(list[j]) || AVAILABLE.test(list[j].text)) break;
				parts.push(list[j].text);
				owner.set(j, i);
			}
			if (parts.join(" ").split(" ").some((word) => /\d/.test(word) && !ZERO_WORD.test(word))) {
				hit("balance", `Available ${parts.join(" ")}`);
			}
		});

		list.forEach((entry, i) => {
			const { text } = entry;
			for (const [name, re] of RULES) {
				if (!re.test(text)) continue;
				if (name === "wallet address" && isContract(entry, i)) continue;
				hit(name, text);
			}
			if (dexNames.has(text.toLowerCase())) hit("HIP-3 dex badge", text);
			for (const match of text.matchAll(PERP_NAME)) {
				if (!perpNames.has(`${match[1]}-${match[2]}`.toUpperCase())) hit("perp or HIP-3 market", text);
			}
			if (owner.has(i) || isStatValue(entry, i) || isMidPrice(entry)) return;
			if (MONEY.some((re) => re.test(text))) hit("money amount", text);
		});
		for (let i = 0; i + 1 < list.length; i += 1) {
			const a = list[i];
			const b = list[i + 1];
			if (/\d$/.test(a.text) && /^[x×✕](?![a-z0-9])/i.test(b.text)) hit("leverage", `${a.text} ${b.text}`);
			if (isField(a) || isField(b) || (owner.has(i) && owner.get(i) === owner.get(i + 1))) continue;
			const split =
				(ENDS_IN_FIGURE.test(a.text) && USD_SYMBOL.test(b.text)) ||
				(USD_SYMBOL.test(a.text) && STARTS_WITH_FIGURE.test(b.text)) ||
				(AMOUNT_SIGN.test(a.text) && STARTS_WITH_FIGURE.test(b.text)) ||
				(USD_UNIT_LABEL.test(a.text) && SIGNED_FIGURE.test(b.text) && !isTooltipTotal(b, i + 1));
			if (split) hit("money amount", `${a.text} ${b.text}`);
		}
		if (!list.some((entry) => entry.kind === "control" && CONNECT.test(entry.text))) {
			hit("signed-out check", "no visible Connect control");
		}
		if (titleAt < 0) hit("market check", `no visible ${market.title} title with a ${market.kind} badge`);
		return [...hits];
	}

	const rules = [
		...RULES.map(([name, re]) => `${name}: ${re}`),
		`HIP-3 dex badge: an element whose whole text is one of ${[...dexNames].join(", ") || "(none)"}`,
		`perp or HIP-3 market: ${PERP_NAME} other than ${[...perpNames].join(", ") || "(none)"}`,
		`money amount: ${MONEY.join(" or ")} in one element`,
		`money amount across two neighbouring elements, input values excluded: ${ENDS_IN_FIGURE} then ${USD_SYMBOL}, ${USD_SYMBOL} then ${STARTS_WITH_FIGURE}, ${AMOUNT_SIGN} then ${STARTS_WITH_FIGURE}, or ${USD_UNIT_LABEL} then ${SIGNED_FIGURE}`,
		`balance: after ${AVAILABLE} (a figure in the same element included) the next ${AVAILABLE_PARTS} entries up to the first form field may contain no word with a digit other than ${ZERO_WORD}; amounts there are judged by this rule only`,
		`money exception: the value after "${PUBLIC_STATS.volume24h}" or "${PUBLIC_STATS.marketCap}" in the same data-market-stat (${Object.keys(PUBLIC_STATS).join(", ")}) when the whole value is ${STAT_VALUE}`,
		`money exception: a ${DOLLAR_PRICE} in data-slot="${MID_PRICE_SLOT}" within 1% of the plain price shown after the market title`,
		TOOLTIP_TOTAL_LABEL
			? `money exception: a ${PLAIN_NUMBER} right after "${TOOLTIP_TOTAL_LABEL}", both in data-slot="${TOOLTIP_SLOT}" (two elements, never one)`
			: `money exception: none in data-slot="${TOOLTIP_SLOT}", the market title names no quote token`,
		`wallet address exception: a ${SHORT_ADDRESS} after "${CONTRACT_LABEL}" in the same data-market-stat (${CONTRACT_STAT})`,
		"leverage across elements: an element ending in a digit followed by one starting with x or ×",
		`required: a visible control reading ${CONNECT}`,
		`required: a visible "${market.title}" within four elements of a "${market.kind}" badge`,
	];
	return { violationsFor, rules };
}

// Runs in the page (serialised with toString), so it must not use anything from this module.
function collectEntries(clip) {
	const entries = [];
	const frames = [];
	const memo = new Map();
	const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE"]);
	const CONTROL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="combobox"], [role="link"]';

	function intersects(rect, bounds) {
		return rect.width > 0 && rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right;
	}

	function shifted(rect, ox, oy) {
		return { left: rect.left + ox, right: rect.right + ox, top: rect.top + oy, bottom: rect.bottom + oy, width: rect.width, height: rect.height };
	}

	function concealed(el, win) {
		if (!el || el.nodeType !== 1) return false;
		if (memo.has(el)) return memo.get(el);
		const style = win.getComputedStyle(el);
		let result =
			style.display === "none" ||
			Number(style.opacity) === 0 ||
			style.clip === "rect(0px, 0px, 0px, 0px)" ||
			/inset\(50%\)/.test(style.clipPath || "");
		if (!result && !/^(?:contents|inline)$/.test(style.display) && /hidden|clip/.test(`${style.overflowX} ${style.overflowY}`)) {
			const rect = el.getBoundingClientRect();
			result = rect.width <= 1 || rect.height <= 1;
		}
		if (!result) result = concealed(el.parentElement, win);
		memo.set(el, result);
		return result;
	}

	function shown(el, win) {
		return win.getComputedStyle(el).visibility === "visible" && !concealed(el, win);
	}

	function marked(el, entry) {
		const stat = el.closest("[data-market-stat]");
		const slot = el.closest("[data-slot]");
		if (stat) entry.stat = stat.getAttribute("data-market-stat");
		if (slot) entry.slot = slot.getAttribute("data-slot");
		return entry;
	}

	function visit(doc, ox, oy, bounds) {
		const win = doc.defaultView;
		const root = doc.documentElement;
		if (!win || !root) return;
		const range = doc.createRange();
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
			acceptNode: (node) => (SKIP.has(node.tagName.toUpperCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
		});
		for (let el = walker.currentNode; el; el = walker.nextNode()) {
			const tag = el.tagName.toUpperCase();
			if (tag === "IFRAME" || tag === "FRAME") {
				const box = shifted(el.getBoundingClientRect(), ox, oy);
				if (!intersects(box, bounds) || !shown(el, win)) continue;
				const src = (el.getAttribute("src") || (el.hasAttribute("srcdoc") ? "srcdoc" : "about:blank")).slice(0, 160);
				let inner = null;
				try {
					inner = el.contentDocument;
				} catch {
					inner = null;
				}
				frames.push({ src, checked: Boolean(inner) });
				if (!inner) continue;
				const style = win.getComputedStyle(el);
				const left = box.left + el.clientLeft + Number.parseFloat(style.paddingLeft || "0");
				const top = box.top + el.clientTop + Number.parseFloat(style.paddingTop || "0");
				const inside = {
					left: Math.max(bounds.left, left),
					top: Math.max(bounds.top, top),
					right: Math.min(bounds.right, left + el.clientWidth),
					bottom: Math.min(bounds.bottom, top + el.clientHeight),
				};
				visit(inner, left, top, inside);
				continue;
			}
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
				if (el.type === "hidden" || el.type === "password" || !intersects(shifted(el.getBoundingClientRect(), ox, oy), bounds) || !shown(el, win)) continue;
				const values = tag === "SELECT" ? [el.selectedOptions?.[0]?.textContent] : [el.value, el.placeholder];
				values.push(el.getAttribute("aria-valuetext"));
				for (const value of values) if (value && String(value).trim()) entries.push({ text: String(value), kind: "input" });
				continue;
			}
			const valueText = el.getAttribute("aria-valuetext");
			if (valueText && intersects(shifted(el.getBoundingClientRect(), ox, oy), bounds) && shown(el, win)) {
				entries.push(marked(el, { text: valueText, kind: "value" }));
			}
			let own = false;
			for (const child of el.childNodes) {
				if (child.nodeType !== 3 || !child.textContent.trim()) continue;
				range.selectNodeContents(child);
				for (const rect of range.getClientRects()) {
					if (intersects(shifted(rect, ox, oy), bounds)) {
						own = true;
						break;
					}
				}
				if (own) break;
			}
			if (!own || !shown(el, win)) continue;
			const text = ("innerText" in el && el.innerText) || el.textContent;
			entries.push(marked(el, { text, kind: el.closest(CONTROL) ? "control" : "text" }));
		}
	}

	visit(document, 0, 0, clip);
	return { entries, frames, at: performance.timeOrigin + performance.now() };
}

// The per-frame guard installed in the page. The main document and every same-origin iframe it
// reads are watched: a MutationObserver, and the events after which a style can change without a
// DOM mutation (hover, focus and press state, scrolling, resizing, transitions and animations
// starting or ending, loaded images and fonts), mark the area dirty. Each animation frame in which
// the area is dirty or an animation is running reads it again and applies the same rules. A style
// change with none of these (a :hover that the browser applies without a boundary event) waits for
// the next Node-side check. Violations are stamped with performance.timeOrigin + performance.now(),
// the browser clock that the frame timestamps use.
const DIRTY_EVENTS = [
	"scroll",
	"resize",
	"pointerover",
	"pointerout",
	"pointerdown",
	"pointerup",
	"mouseover",
	"mouseout",
	"mousedown",
	"mouseup",
	"focusin",
	"focusout",
	"keydown",
	"keyup",
	"input",
	"change",
	"toggle",
	"load",
	"transitionrun",
	"transitionend",
	"transitioncancel",
	"animationstart",
	"animationiteration",
	"animationend",
];

function pageGuardSource(clip, config) {
	return `(() => {
	if (window.__sairnGuard) window.__sairnGuard.stop();
	const clip = ${JSON.stringify(clip)};
	const { violationsFor } = (${makeGuard.toString()})(${JSON.stringify(config)});
	const collectEntries = ${collectEntries.toString()};
	const DIRTY_EVENTS = ${JSON.stringify(DIRTY_EVENTS)};
	const now = () => performance.timeOrigin + performance.now();
	const state = { checks: 0, frames: 0, firstAt: null, lastAt: null, lastFrameAt: null, maxCheckMs: 0, violations: [], uncheckedFrames: [], running: true };
	const observed = new WeakSet();
	const unwatch = [];
	let dirty = true;
	const mark = () => { dirty = true; };
	const observer = new MutationObserver(mark);
	const listen = (target, type, capture) => {
		if (!target?.addEventListener) return;
		target.addEventListener(type, mark, capture);
		unwatch.push(() => target.removeEventListener(type, mark, capture));
	};
	const watch = (doc) => {
		if (!doc || observed.has(doc)) return;
		observed.add(doc);
		dirty = true;
		observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
		for (const type of DIRTY_EVENTS) listen(doc.defaultView, type, true);
		listen(doc.fonts, "loadingdone", false);
	};
	const documents = (doc, out = []) => {
		out.push(doc);
		for (const frame of doc.querySelectorAll("iframe, frame")) {
			let inner = null;
			try { inner = frame.contentDocument; } catch { inner = null; }
			if (inner) documents(inner, out);
		}
		return out;
	};
	const animating = (doc) => {
		try { return doc.getAnimations().some((a) => a.playState === "running"); } catch { return true; }
	};
	watch(document);
	const tick = () => {
		if (!state.running) return;
		requestAnimationFrame(tick);
		state.frames += 1;
		state.lastFrameAt = now();
		try {
			const docs = documents(document);
			for (const doc of docs) watch(doc);
			if (!dirty && !docs.some(animating)) return;
			dirty = false;
			const started = performance.now();
			const read = collectEntries(clip);
			const hits = violationsFor(read.entries);
			state.checks += 1;
			state.firstAt ??= read.at;
			state.lastAt = read.at;
			state.maxCheckMs = Math.max(state.maxCheckMs, performance.now() - started);
			for (const frame of read.frames) if (!frame.checked && !state.uncheckedFrames.includes(frame.src)) state.uncheckedFrames.push(frame.src);
			if (hits.length && state.violations.length < 20) state.violations.push({ at: read.at, hits });
		} catch (error) {
			if (state.violations.length < 20) state.violations.push({ at: now(), hits: ["guard error: " + (error && error.message)] });
		}
	};
	requestAnimationFrame(tick);
	window.__sairnGuard = {
		read: () => ({ ...state, violations: state.violations.slice(), uncheckedFrames: state.uncheckedFrames.slice(), at: now() }),
		stop: () => { state.running = false; observer.disconnect(); for (const off of unwatch.splice(0)) off(); },
	};
})();`;
}

function readTerminalConfig() {
	const deployers = fs.readFileSync(path.join(TERMINAL_CONFIG, "hip3-deployers.ts"), "utf8");
	const app = fs.readFileSync(path.join(TERMINAL_CONFIG, "app.ts"), "utf8");
	const dexNames = [...deployers.matchAll(/^\s*([a-z0-9]+):\s*"https?:/gm)].map((m) => m[1]);
	const favourites = /DEFAULT_FAVORITE_MARKETS = \[([^\]]*)\]/.exec(app);
	const quote = /DEFAULT_QUOTE_TOKEN = "([A-Z0-9]+)"/.exec(app);
	if (!dexNames.length || !favourites || !quote) throw new Error("guard: cannot read the HIP-3 deployers or the default favourites from apps/terminal/src/config");
	const perpNames = [...favourites[1].matchAll(/"([A-Z0-9]+)"/g)].map((m) => `${m[1]}-${quote[1]}`);
	return { dexNames, perpNames };
}

// Guard configuration for a recording: HIP-3 dex short names from the terminal's documented
// deployers plus the live perpDexs list, and the perpetual names a fresh session shows in the
// favourites strip. The list is fetched through the browser, the same network path as the
// recording; the guard fails closed when it cannot be read.
async function loadGuardConfig(browser, market = DEFAULT_MARKET) {
	const terminal = readTerminalConfig();
	const page = await browser.newPage();
	let live;
	try {
		live = await page.evaluate(async (url) => {
			const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "perpDexs" }) });
			if (!res.ok) throw new Error(`perpDexs request failed (${res.status})`);
			return (await res.json()).filter((dex) => dex && typeof dex.name === "string").map((dex) => dex.name);
		}, INFO_URL);
	} catch (error) {
		throw new Error(`guard: HIP-3 dex names unknown, ${error.message}`);
	} finally {
		await page.close();
	}
	if (!live.length) throw new Error("guard: perpDexs returned no dex names");
	const dexNames = [...new Set([...terminal.dexNames, ...live].map((name) => name.toLowerCase()))].sort();
	return { dexNames, perpNames: terminal.perpNames, market };
}

function violationsFor(entries, config) {
	return makeGuard(config).violationsFor(entries);
}

// Which terminal build a capture shows, from the deployed /build-meta.json. Only these build
// identification fields are kept, each only when its value has the expected shape (short
// segments, no known key or token form); the file's feature flags and anything else are dropped.
const BUILD_FIELDS = {
	name: /^[a-z0-9]{1,20}(?:[._-][a-z0-9]{1,20}){0,3}$/i,
	version: /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:-[0-9a-z]{1,20}(?:\.[0-9a-z]{1,20}){0,3})?$/i,
	commit: /^[0-9a-f]{7,40}$/,
	release: /^[a-z0-9]{1,20}(?:[._-][a-z0-9]{1,20}){0,7}$/i,
	builtAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
};
const KEY_LIKE = /(?:^|[._-])(?:(?:sk|pk|rk|api|key|token|secret|bearer|ghp|gho|ghs|xox[abprs])(?:[._-]|$)|(?:akia|asia)[a-z0-9]{16}(?:[._-]|$)|eyj)/i;

function terminalBuildFrom(meta) {
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("build-meta.json is not a JSON object");
	const build = {};
	for (const [field, shape] of Object.entries(BUILD_FIELDS)) {
		const value = meta[field];
		if (typeof value === "string" && shape.test(value) && (field === "commit" || !KEY_LIKE.test(value))) build[field] = value;
	}
	if (!build.commit && !build.release) throw new Error("build-meta.json has no commit or release of the expected shape");
	return build;
}

// Read through the browser, the network path of the capture itself, in a context of its own.
// Never throws: an unreadable file yields terminalBuild null and the reason.
async function readTerminalBuild(browser, base) {
	const url = `${base}/build-meta.json`;
	const page = await browser.newPage();
	try {
		const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
		if (!response) throw new Error("no response");
		if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
		const build = terminalBuildFrom(await response.json());
		return { terminalBuild: { url, readAt: new Date().toISOString(), ...build } };
	} catch (error) {
		return { terminalBuild: null, terminalBuildError: `${url}: ${error.message}` };
	} finally {
		await page.close();
	}
}

// Bottom edge of the recorded area: the top of the account tables.
async function accountTableTop(page) {
	return page.evaluate(() => {
		const tab = [...document.querySelectorAll("button, [role=tab]")].find((el) => el.textContent.trim() === "Balances");
		const strip = tab?.closest("[role=tablist]") ?? tab?.parentElement;
		return strip ? Math.floor(strip.getBoundingClientRect().top) : null;
	});
}

function recordedClip(width, bottom) {
	return { left: 0, top: 0, right: width, bottom };
}

async function readArea(page, clip) {
	return page.evaluate(`(${collectEntries.toString()})(${JSON.stringify(clip)})`);
}

// One Node-side check. Returns the entry count, the unchecked iframes and the browser time of the
// read; throws with every violation found.
async function assertClean(page, clip, config, label) {
	const read = await readArea(page, clip);
	const hits = violationsFor(read.entries, config);
	if (hits.length) throw new Error(`${label}: DOM guard rejected the frame\n${hits.join("\n")}`);
	return { entries: read.entries.length, frames: read.frames, at: read.at };
}

module.exports = {
	DEFAULT_MARKET,
	makeGuard,
	violationsFor,
	collectEntries,
	pageGuardSource,
	readTerminalConfig,
	loadGuardConfig,
	terminalBuildFrom,
	readTerminalBuild,
	accountTableTop,
	recordedClip,
	readArea,
	assertClean,
};
