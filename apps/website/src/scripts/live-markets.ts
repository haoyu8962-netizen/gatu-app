// Live numbers for 02 (stats band and ticker cards) and the 03 market tabs. Runs only while one of those
// regions is at least 10% visible, the document is visible, updates are not paused and this tab holds the
// `sairn-site-live` Web Lock; while another tab holds it this one waits in the lock queue without sending.
// The same Pause control stops the ticker's scrolling (WCAG 2.2.2); the ticker moves only once it is wired. Requests follow createRequestPlan from
// src/lib/markets/live.js, time out after REQUEST_TIMEOUT_MS, and every answer is validated fail-closed.
// Numbers are cleared once any planned dex has gone stale, and for the rest of the visit once a dex has used
// up its retries. A market the exchange reports delisted (or no longer lists) is removed from 02 and 03 at
// once; the hero names carry no data-market-coin, so their sentence stays whole (plan §7: 02 and 03).

import {
	backoffDelayMs,
	canRetry,
	change24h,
	combineDexTotals,
	createRequestPlan,
	dexOfCoin,
	evaluateFreshness,
	formatCompactUsd,
	formatMarkPrice,
	formatStatUsd,
	impliedValuationUsd,
	INFO_URL,
	nextAllowedSendAt,
	type DexTotals,
	readDexTotals,
	readMetaAndAssetCtxs,
	recordSend,
	requestBody,
} from "../lib/markets/live.js";

interface LiveInput {
	coin: string;
	dex: string;
	szDecimals: number;
	valuationPerPriceUsd: string | null;
	kind: "preipo" | "rate" | "price";
}

interface Price {
	markPx: string;
	prevDayPx: string;
	szDecimals: number;
}

const LOCK_NAME = "sairn-site-live";
const VISIBLE_RATIO = 0.1;
const STOP_DELAY_MS = 30_000;
const FRESHNESS_CHECK_MS = 5_000;
export const REQUEST_TIMEOUT_MS = 15_000;

function readInputs(root: Document): LiveInput[] {
	const raw = root.querySelector("[data-live-inputs]")?.textContent;
	if (!raw) return [];
	const parsed: unknown = JSON.parse(raw);
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(
		(entry): entry is LiveInput =>
			typeof entry?.coin === "string" &&
			typeof entry?.dex === "string" &&
			Number.isInteger(entry?.szDecimals) &&
			(entry?.valuationPerPriceUsd === null || typeof entry?.valuationPerPriceUsd === "string") &&
			["preipo", "rate", "price"].includes(entry?.kind),
	);
}

function readStatsDexes(block: HTMLElement | null): string[] {
	try {
		const parsed: unknown = JSON.parse(block?.dataset.liveStatsDexes ?? "[]");
		return Array.isArray(parsed) && parsed.every((dex) => typeof dex === "string") ? parsed : [];
	} catch {
		return [];
	}
}

function utcTime(date: Date): string {
	return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function startLiveMarkets(root: Document): void {
	const strip = root.querySelector<HTMLElement>("[data-live-strip]");
	const list = root.querySelector<HTMLElement>("[data-live-list]");
	const pauseButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-live-pause]")];
	const asOf = root.querySelector<HTMLElement>("[data-live-asof]");
	const asOfTime = root.querySelector<HTMLTimeElement>("[data-live-asof-time]");
	const inputs = readInputs(root);
	if (!strip || !list || pauseButtons.length === 0 || !asOf || !asOfTime || inputs.length === 0) return;
	if (!("locks" in navigator) || !("IntersectionObserver" in window)) return;
	const statsBlock = root.querySelector<HTMLElement>("[data-live-stats]");
	const statsDexes = readStatsDexes(statsBlock);
	const regions = [strip, ...root.querySelectorAll<HTMLElement>("[data-live-region]")];
	const mirrors = new Map(
		[...root.querySelectorAll<HTMLElement>("[data-live-mirror]")].map((mirror) => [mirror.dataset.liveMirror ?? "", mirror]),
	);

	const inputByCoin = new Map(inputs.map((input) => [input.coin, input]));
	const plan = createRequestPlan(inputs.map((input) => input.coin));

	let sendLog: { at: number; weight: number }[] = [];
	let retriesUsed = 0;
	const failures: Record<string, number> = {};
	const nextDueAt: Record<string, number> = {};
	const receivedAt: Record<string, number | undefined> = {};
	const receivedWallAt: Record<string, number> = {};
	const prices: Record<string, Record<string, Price>> = {};
	const totals: Record<string, DexTotals | undefined> = {};
	const removed = new Set<string>();
	let startedAt = performance.now();
	const cardOrder = [...new Set(inputs.map((input) => input.dex))];
	for (const dex of plan.dexes) nextDueAt[dex] = startedAt + (cardOrder.includes(dex) ? cardOrder.indexOf(dex) : cardOrder.length);

	const visibleRegions = new Map<unknown, boolean>();
	let inView = false;
	let paused = false;
	let exhausted = false;
	let session: { stop: () => void } | null = null;
	let stopTimer: ReturnType<typeof setTimeout> | undefined;

	function pricedCoins(dex: string): string[] {
		return inputs.filter((input) => input.dex === dex && !removed.has(input.coin)).map((input) => input.coin);
	}

	function linkedCoins(dex: string): string[] {
		const coins = new Set<string>();
		for (const element of root.querySelectorAll<HTMLElement>("[data-market-coin]")) {
			const coin = element.dataset.marketCoin;
			if (coin && dexOfCoin(coin) === dex && !inputByCoin.has(coin)) coins.add(coin);
		}
		return [...coins];
	}

	function delistedAmong(body: unknown, coins: string[]): string[] {
		const universe = (body as [{ universe: { name: string; isDelisted?: unknown }[] }])[0].universe;
		return coins.filter((coin) => {
			const asset = universe.find((entry) => entry.name === coin);
			return !asset || asset.isDelisted === true;
		});
	}

	function removeMarket(coin: string) {
		removed.add(coin);
		for (const element of root.querySelectorAll<HTMLElement>("[data-market-coin]")) {
			if (element.dataset.marketCoin === coin) element.remove();
		}
	}

	function clearCard(card: HTMLElement) {
		for (const slot of card.querySelectorAll<HTMLElement>("[data-live-primary], [data-live-secondary], [data-live-change]")) {
			slot.textContent = "";
			slot.classList.remove("text-success", "text-error");
		}
	}

	function fill(target: HTMLElement, input: LiveInput | undefined, price: Price | undefined): boolean {
		clearCard(target);
		if (!input || !price) return false;
		const markText = formatMarkPrice(price.markPx, price.szDecimals);
		const change = change24h(price.markPx, price.prevDayPx);
		const primary = target.querySelector<HTMLElement>("[data-live-primary]");
		const secondary = target.querySelector<HTMLElement>("[data-live-secondary]");
		const changeSlot = target.querySelector<HTMLElement>("[data-live-change]");
		if (!primary || !changeSlot || !markText || !change) return false;
		if (input.kind === "preipo") {
			const valuation = impliedValuationUsd(price.markPx, input.valuationPerPriceUsd);
			if (!valuation || !secondary) return false;
			const label = root.createElement("span");
			label.className = "ml-1.5 text-2xs font-normal text-fg-subtle";
			label.textContent = "implied valuation";
			primary.append(`US$${formatCompactUsd(valuation)}`, label);
			secondary.textContent = `Mark ${markText}`;
		} else {
			primary.textContent = input.kind === "rate" ? markText.replace(/^\$/, "") : markText;
		}
		const arrow = { up: " ▲", down: " ▼", flat: "" }[change.direction];
		changeSlot.textContent = `${change.text}${arrow}`;
		if (change.direction === "up") changeSlot.classList.add("text-success");
		if (change.direction === "down") changeSlot.classList.add("text-error");
		return true;
	}

	function copySlots(from: HTMLElement, to: HTMLElement) {
		for (const name of ["data-live-primary", "data-live-secondary", "data-live-change"]) {
			const source = from.querySelector(`[${name}]`);
			const target = to.querySelector(`[${name}]`);
			if (!source || !target) continue;
			target.innerHTML = source.innerHTML;
			target.className = source.className;
		}
	}

	function renderStats(freshDexes: string[], clearAll: boolean) {
		if (!statsBlock) return;
		const combined = clearAll ? null : combineDexTotals(statsDexes.filter((dex) => freshDexes.includes(dex)).length === statsDexes.length ? statsDexes : [], totals);
		const wallTimes = statsDexes.map((dex) => receivedWallAt[dex]).filter((at) => at !== undefined);
		let shownCount = 0;
		for (const stat of statsBlock.querySelectorAll<HTMLElement>("[data-live-stat]")) {
			const value = stat.querySelector<HTMLElement>("[data-live-stat-value]");
			const pending = stat.querySelector<HTMLElement>("[data-live-stat-pending]");
			const slot = stat.querySelector<HTMLElement>("[data-live-stat-slot]");
			const raw = combined ? (stat.dataset.liveStat === "volume" ? combined.dayNtlVlm : combined.openInterestUsd) : null;
			const text = raw === null ? null : formatStatUsd(raw);
			if (value) value.textContent = text ?? "";
			if (pending) pending.hidden = text !== null;
			slot?.setAttribute("aria-busy", text === null ? "true" : "false");
			if (text !== null) shownCount += 1;
		}
		const statsAsOf = statsBlock.querySelector<HTMLElement>("[data-live-stats-asof]");
		const time = statsAsOf?.querySelector("time");
		if (statsAsOf && time) {
			const stats = statsBlock.querySelectorAll("[data-live-stat]").length;
			if (shownCount > 0 && shownCount === stats && wallTimes.length === statsDexes.length) {
				const oldest = new Date(Math.min(...wallTimes));
				time.dateTime = oldest.toISOString();
				time.textContent = utcTime(oldest);
				statsAsOf.hidden = false;
			} else {
				statsAsOf.hidden = true;
			}
		}
	}

	function render() {
		const now = performance.now();
		const { freshDexes, clearAll } = evaluateFreshness({
			dexes: plan.dexes,
			receivedAt,
			startedAt,
			now,
			staleAfterMs: plan.staleAfterMs,
		});
		let shown = 0;
		for (const target of root.querySelectorAll<HTMLElement>("[data-live-card], [data-live-row]")) {
			const coin = target.dataset.liveCard ?? target.dataset.liveRow ?? "";
			const input = inputByCoin.get(coin);
			const price = input && !clearAll && freshDexes.includes(input.dex) ? prices[input.dex]?.[coin] : undefined;
			const filled = fill(target, input, price);
			if (filled && target.dataset.liveCard !== undefined) shown += 1;
			const mirror = target.dataset.liveCard ? mirrors.get(coin) : undefined;
			if (mirror) copySlots(target, mirror);
		}
		renderStats(freshDexes, clearAll);
		list?.setAttribute("aria-busy", shown > 0 ? "false" : "true");
		const shownWallTimes = freshDexes.map((dex) => receivedWallAt[dex]).filter((at) => at !== undefined);
		if (shown > 0 && shownWallTimes.length > 0 && asOf && asOfTime) {
			const oldest = new Date(Math.min(...shownWallTimes));
			asOfTime.dateTime = oldest.toISOString();
			asOfTime.textContent = utcTime(oldest);
			asOf.hidden = false;
		} else if (asOf) {
			asOf.hidden = true;
		}
	}

	async function fetchDex(dex: string, signal: AbortSignal) {
		let status = 0;
		let body: unknown;
		const request = new AbortController();
		const abort = () => request.abort();
		const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
		signal.addEventListener("abort", abort, { once: true });
		try {
			const response = await fetch(INFO_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody(dex)),
				signal: request.signal,
				cache: "no-store",
				credentials: "omit",
			});
			status = response.status;
			body = await response.json().catch(() => undefined);
		} catch {
			status = 0;
			body = undefined;
		} finally {
			clearTimeout(timeout);
			signal.removeEventListener("abort", abort);
		}
		const reading = readMetaAndAssetCtxs({ status, body }, { dex, coins: pricedCoins(dex) });
		return {
			reading,
			linkedDelisted: reading.ok ? delistedAmong(body, linkedCoins(dex)) : [],
			dexTotals: reading.ok && statsDexes.includes(dex) ? readDexTotals({ status, body }, dex) : null,
		};
	}

	function sleep(ms: number, signal: AbortSignal) {
		return new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, ms);
			signal.addEventListener(
				"abort",
				() => {
					clearTimeout(timer);
					resolve();
				},
				{ once: true },
			);
		});
	}

	function giveUp() {
		exhausted = true;
		for (const dex of plan.dexes) {
			receivedAt[dex] = undefined;
			delete prices[dex];
			delete totals[dex];
		}
		render();
		stopSession();
	}

	async function run(signal: AbortSignal) {
		while (!signal.aborted) {
			const now = performance.now();
			const due = plan.dexes.slice().sort((a, b) => (nextDueAt[a] ?? 0) - (nextDueAt[b] ?? 0));
			const dex = due[0];
			if (dex === undefined) return;
			const at = Math.max(nextDueAt[dex] ?? 0, nextAllowedSendAt(sendLog, now, plan.weightPerRequest));
			if (at > now) {
				await sleep(at - now, signal);
				continue;
			}
			sendLog = recordSend(sendLog, now, plan.weightPerRequest);
			const { reading, linkedDelisted, dexTotals } = await fetchDex(dex, signal);
			if (signal.aborted) return;
			const received = performance.now();
			if (reading.ok) {
				failures[dex] = 0;
				for (const coin of [...reading.delisted, ...reading.missing, ...linkedDelisted]) removeMarket(coin);
				prices[dex] = reading.prices;
				totals[dex] = dexTotals ?? undefined;
				receivedAt[dex] = received;
				receivedWallAt[dex] = Date.now();
				nextDueAt[dex] = received + plan.refreshIntervalMs;
			} else if (canRetry(retriesUsed)) {
				retriesUsed += 1;
				const attempt = failures[dex] ?? 0;
				failures[dex] = attempt + 1;
				nextDueAt[dex] = received + backoffDelayMs(attempt);
			} else {
				giveUp();
				return;
			}
			render();
		}
	}

	function startSession() {
		if (session || exhausted) return;
		const controller = new AbortController();
		let releaseLock: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const current = {
			stop() {
				controller.abort();
				releaseLock();
			},
		};
		session = current;
		navigator.locks
			.request(LOCK_NAME, { signal: controller.signal }, async () => {
				if (controller.signal.aborted) return;
				const now = performance.now();
				startedAt = now;
				for (const dex of plan.dexes) {
					const received = receivedAt[dex];
					if (received !== undefined && now - received > plan.staleAfterMs) {
						receivedAt[dex] = undefined;
						delete prices[dex];
						delete totals[dex];
					}
				}
				render();
				run(controller.signal)
					.catch(() => {})
					.finally(() => {
						if (session === current) stopSession();
					});
				await held;
			})
			.catch(() => {
				if (session === current) session = null;
			});
	}

	function stopSession() {
		session?.stop();
		session = null;
	}

	function shouldRun() {
		return inView && root.visibilityState === "visible" && !paused && !exhausted;
	}

	function update() {
		if (shouldRun()) {
			clearTimeout(stopTimer);
			stopTimer = undefined;
			startSession();
			return;
		}
		if (paused || exhausted) {
			clearTimeout(stopTimer);
			stopTimer = undefined;
			stopSession();
			return;
		}
		if (session && stopTimer === undefined) {
			stopTimer = setTimeout(() => {
				stopTimer = undefined;
				if (!shouldRun()) stopSession();
			}, STOP_DELAY_MS);
		}
	}

	for (const separator of root.querySelectorAll<HTMLElement>("[data-live-pause-separator]")) separator.hidden = false;
	strip.dataset.ticker = "moving";
	for (const button of pauseButtons) {
		button.hidden = false;
		button.addEventListener("click", () => {
			paused = !paused;
			for (const each of pauseButtons) each.setAttribute("aria-pressed", String(paused));
			strip.dataset.ticker = paused ? "paused" : "moving";
			update();
		});
	}
	root.addEventListener("visibilitychange", update);
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				visibleRegions.set(entry.target, entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO);
			}
			inView = [...visibleRegions.values()].some(Boolean);
			update();
		},
		{ threshold: [0, VISIBLE_RATIO] },
	);
	for (const region of regions) observer.observe(region);
	setInterval(render, FRESHNESS_CHECK_MS);
	window.addEventListener("pagehide", () => {
		clearTimeout(stopTimer);
		stopTimer = undefined;
		stopSession();
	});
	window.addEventListener("pageshow", (event) => {
		if (!event.persisted) return;
		render();
		update();
	});
}
