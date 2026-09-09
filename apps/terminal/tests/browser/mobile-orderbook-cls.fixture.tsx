import { i18n } from "@lingui/core";
import { MobileBookView } from "@/components/trade/mobile/mobile-book-view";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import "./mobile-orderbook-cls.css";
import {
	type BrowserOrderbookEvent,
	setBrowserOrderbookEvent,
	setBrowserOrderbookPending,
} from "./mobile-orderbook-cls.browser";

interface LayoutShiftAttribution {
	node: Node | null;
}

interface LayoutShiftEntry extends PerformanceEntry {
	hadRecentInput: boolean;
	sources: LayoutShiftAttribution[];
	value: number;
}

interface LayoutShiftSample {
	hadRecentInput: boolean;
	source: string | null;
	startTime: number;
	value: number;
}

interface RowGeometry {
	height: number;
	price: string;
	rank: string;
	side: string;
	top: number;
	transform: string;
}

interface FixtureResult {
	controlCls: number;
	controlSamples: LayoutShiftSample[];
	domOrderMatchesVisualOrder: boolean;
	finalGeometry: Array<{ height: number; slot: string; top: number }>;
	finalTops: number[];
	focusPreserved: boolean;
	hiddenChromeDisplay: string;
	initialGeometry: Array<{ height: number; slot: string; top: number }>;
	initializationCls: number;
	initializationSamples: LayoutShiftSample[];
	initialTops: number[];
	interactionPrice: string | null;
	placeholderContentsMatchPosition: boolean;
	placeholderRowHeights: number[];
	priceNodePreserved: boolean;
	realRowContentCount: number;
	realRowContentsMatchPosition: boolean;
	realRowHeights: number[];
	rankCls: number;
	rankClsBudget: number;
	rankSamples: LayoutShiftSample[];
	rankTransform: string;
	rowGaps: number[];
	rowHeights: number[];
	skeletonRowGaps: number[];
	skeletonRowHeights: number[];
	skeletonRowsMatchPosition: boolean;
	sizeCls: number;
	sizeDirection: string | null;
	sizeSamples: LayoutShiftSample[];
}

declare global {
	interface Window {
		runMobileOrderbookClsFixture: () => Promise<FixtureResult>;
	}
}

const RANK_CLS_BUDGET = 0.001;

const INITIAL_BOOK: BrowserOrderbookEvent = {
	coin: "CLS_HYPE",
	fast: true,
	levels: [
		[
			{ n: 1, px: "100.00", sz: "1.00" },
			{ n: 1, px: "99.90", sz: "2.00" },
			{ n: 1, px: "99.80", sz: "3.00" },
			{ n: 1, px: "99.70", sz: "4.00" },
			{ n: 1, px: "99.60", sz: "5.00" },
		],
		[
			{ n: 1, px: "100.10", sz: "1.00" },
			{ n: 1, px: "100.20", sz: "2.00" },
			{ n: 1, px: "100.30", sz: "3.00" },
			{ n: 1, px: "100.40", sz: "4.00" },
			{ n: 1, px: "100.50", sz: "5.00" },
		],
	],
	time: 1,
};

const SIZE_UPDATE_BOOK: BrowserOrderbookEvent = {
	...INITIAL_BOOK,
	levels: [
		INITIAL_BOOK.levels[0].map((level) => (level.px === "100.00" ? { ...level, sz: "1.25" } : level)),
		INITIAL_BOOK.levels[1].map((level) => (level.px === "100.10" ? { ...level, sz: "1.25" } : level)),
	],
	time: 2,
};

const RANK_UPDATE_BOOK: BrowserOrderbookEvent = {
	...SIZE_UPDATE_BOOK,
	levels: [
		[{ n: 1, px: "100.05", sz: "0.50" }, ...SIZE_UPDATE_BOOK.levels[0].slice(0, 4)],
		[{ n: 1, px: "100.06", sz: "0.50" }, ...SIZE_UPDATE_BOOK.levels[1].slice(0, 4)],
	],
	time: 3,
};

function serializeLayoutShift(entry: LayoutShiftEntry): LayoutShiftSample {
	const sourceNode = entry.sources[0]?.node;
	const sourceElement = sourceNode instanceof Element ? sourceNode.closest<HTMLElement>("[data-slot], button") : null;
	return {
		hadRecentInput: entry.hadRecentInput,
		source:
			sourceElement?.getAttribute("data-slot") ??
			sourceElement?.getAttribute("aria-label") ??
			sourceElement?.getAttribute("title") ??
			null,
		startTime: entry.startTime,
		value: entry.value,
	};
}

function getMaximumLayoutShiftSession(samples: LayoutShiftSample[]): number {
	const scored = samples
		.filter((sample) => !sample.hadRecentInput)
		.sort((left, right) => left.startTime - right.startTime);
	let maximum = 0;
	let sessionValue = 0;
	let sessionStart = 0;
	let previousStart = 0;

	for (const sample of scored) {
		if (sessionValue === 0 || sample.startTime - previousStart >= 1_000 || sample.startTime - sessionStart >= 5_000) {
			sessionStart = sample.startTime;
			sessionValue = sample.value;
		} else {
			sessionValue += sample.value;
		}
		previousStart = sample.startTime;
		maximum = Math.max(maximum, sessionValue);
	}

	return maximum;
}

async function settleLayout() {
	await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function measureLayoutShift(update: () => void) {
	const samples: LayoutShiftSample[] = [];
	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries() as LayoutShiftEntry[]) samples.push(serializeLayoutShift(entry));
	});
	observer.observe({ type: "layout-shift" });
	await settleLayout();
	update();
	await settleLayout();
	for (const entry of observer.takeRecords() as LayoutShiftEntry[]) samples.push(serializeLayoutShift(entry));
	observer.disconnect();
	return { cls: getMaximumLayoutShiftSession(samples), samples };
}

function getRowGeometry(container: HTMLElement): RowGeometry[] {
	return [...container.querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"][data-price]')].map(
		(row) => ({
			height: row.getBoundingClientRect().height,
			price: row.dataset.price ?? "",
			rank: row.dataset.rank ?? "",
			side: row.dataset.side ?? "",
			top: row.getBoundingClientRect().top,
			transform: row.style.transform,
		}),
	);
}

function getVerticalGeometry(elements: HTMLElement[]) {
	return elements.map((element) => {
		const rect = element.getBoundingClientRect();
		return { height: rect.height, top: rect.top };
	});
}

function getElementGaps(elements: HTMLElement[]) {
	const geometry = getVerticalGeometry(elements);
	return geometry.slice(1).map((row, index) => row.top - (geometry[index]?.top ?? row.top));
}

function elementMatchesPosition(element: HTMLElement) {
	const position = element.closest<HTMLElement>('[data-slot="compact-orderbook-row-position"]');
	if (!position) return false;
	const elementRect = element.getBoundingClientRect();
	const positionRect = position.getBoundingClientRect();
	return elementRect.height === positionRect.height && elementRect.top === positionRect.top;
}

function getStableGeometry(container: HTMLElement) {
	return ["compact-orderbook-asks", "compact-orderbook-mid", "compact-orderbook-bids"].map((slot) => {
		const element = container.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
		if (!element) throw new Error(`Missing ${slot}`);
		const rect = element.getBoundingClientRect();
		return { height: rect.height, slot, top: rect.top };
	});
}

function getSortedTops(rows: RowGeometry[]) {
	return rows.map((row) => Math.round(row.top)).sort((left, right) => left - right);
}

function getRowGaps(rows: RowGeometry[]) {
	return (["ask", "bid"] as const).flatMap((side) => {
		const sideRows = rows.filter((row) => row.side === side);
		return sideRows.slice(1).map((row, index) => row.top - sideRows[index].top);
	});
}

async function measureFlexControl() {
	const control = document.createElement("div");
	Object.assign(control.style, {
		display: "flex",
		flexDirection: "column",
		gap: "4px",
		height: "136px",
		marginTop: "4px",
		width: "164px",
	});
	const rows = new Map<string, HTMLButtonElement>();
	const renderRows = (prices: string[]) => {
		control.replaceChildren(
			...prices.map((price) => {
				const row = rows.get(price) ?? document.createElement("button");
				row.dataset.slot = "mobile-orderbook-cls-control-row";
				Object.assign(row.style, { flex: "0 0 24px", height: "24px" });
				row.textContent = price;
				rows.set(price, row);
				return row;
			}),
		);
	};
	renderRows(["100.00", "99.90", "99.80", "99.70", "99.60"]);
	document.body.appendChild(control);
	await settleLayout();
	const result = await measureLayoutShift(() => {
		const inserted = document.createElement("button");
		inserted.dataset.slot = "mobile-orderbook-cls-control-row";
		Object.assign(inserted.style, { flex: "0 0 24px", height: "24px" });
		inserted.textContent = "100.05";
		control.insertBefore(inserted, control.firstChild);
		control.lastElementChild?.remove();
	});
	control.remove();
	return result;
}

const rootElement = document.querySelector<HTMLElement>("#root");
if (!rootElement) throw new Error("Missing fixture root");
const initializationSamples: LayoutShiftSample[] = [];
const initializationObserver = PerformanceObserver.supportedEntryTypes.includes("layout-shift")
	? new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as LayoutShiftEntry[]) {
				initializationSamples.push(serializeLayoutShift(entry));
			}
		})
	: null;
initializationObserver?.observe({ buffered: true, type: "layout-shift" });
Object.assign(document.body.style, { margin: "0" });
Object.assign(rootElement.style, { display: "flex", height: "440px", width: "164px" });
i18n.loadAndActivate({ locale: "en", messages: {} });
getOrderbookActionsStore().actions.clearSelectedPrice();
setBrowserOrderbookPending();
createI18nRoot(rootElement).render(<MobileBookView active compact inTabLayout view="book" />);

window.runMobileOrderbookClsFixture = async () => {
	if (!initializationObserver) {
		throw new Error("LayoutShift PerformanceObserver is unavailable");
	}
	await document.fonts.ready;
	await settleLayout();
	await new Promise((resolve) => setTimeout(resolve, 150));
	await settleLayout();
	const skeletonRows = [...rootElement.querySelectorAll<HTMLElement>('[data-slot="orderbook-skeleton-row"]')];
	const skeletonRowHeights = skeletonRows.map((row) => row.getBoundingClientRect().height);
	const skeletonRowGaps = getElementGaps(skeletonRows.slice(0, skeletonRows.length / 2));
	const skeletonRowsMatchPosition = skeletonRows.every(elementMatchesPosition);

	setBrowserOrderbookEvent(INITIAL_BOOK);
	await settleLayout();
	for (const entry of initializationObserver.takeRecords() as LayoutShiftEntry[]) {
		initializationSamples.push(serializeLayoutShift(entry));
	}
	initializationObserver.disconnect();
	const initializationCls = getMaximumLayoutShiftSession(initializationSamples);

	const control = await measureFlexControl();
	const initialRows = getRowGeometry(rootElement);
	const realRows = [
		...rootElement.querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"][data-price] button'),
	];
	const placeholderRows = [...rootElement.querySelectorAll<HTMLElement>('[data-slot="orderbook-placeholder-row"]')];
	const realRowContentsMatchPosition = realRows.every(elementMatchesPosition);
	const realRowHeights = realRows.map((row) => row.getBoundingClientRect().height);
	const placeholderContentsMatchPosition = placeholderRows.every(elementMatchesPosition);
	const placeholderRowHeights = placeholderRows.map((row) => row.getBoundingClientRect().height);
	const hiddenChrome = rootElement.firstElementChild?.firstElementChild;
	if (!(hiddenChrome instanceof HTMLElement)) throw new Error("Missing compact hidden chrome");
	const initialGeometry = getStableGeometry(rootElement);
	const initialTops = getSortedTops(initialRows);
	const focusedPosition = rootElement.querySelector<HTMLElement>('[data-side="ask"][data-price="100.10"]');
	const focusedAsk = focusedPosition?.querySelector<HTMLButtonElement>("button");
	if (!focusedAsk || !focusedPosition) throw new Error("Missing focused ask fixture row");
	focusedAsk.focus();

	const size = await measureLayoutShift(() => setBrowserOrderbookEvent(SIZE_UPDATE_BOOK));
	const sizeDirection =
		focusedAsk.querySelector('[data-slot="orderbook-size-value"]')?.getAttribute("data-direction") ?? null;
	const rank = await measureLayoutShift(() => setBrowserOrderbookEvent(RANK_UPDATE_BOOK));
	const rankRows = getRowGeometry(rootElement);
	const priceNodePreserved =
		rootElement.querySelector<HTMLElement>('[data-side="ask"][data-price="100.10"]')?.querySelector("button") ===
		focusedAsk;
	const focusPreserved = document.activeElement === focusedAsk;
	focusedAsk.click();

	return {
		controlCls: control.cls,
		controlSamples: control.samples,
		domOrderMatchesVisualOrder: (["ask", "bid"] as const).every((side) => {
			const tops = rankRows.filter((row) => row.side === side).map((row) => row.top);
			return tops.every((top, index) => index === 0 || (tops[index - 1] ?? top) <= top);
		}),
		finalGeometry: getStableGeometry(rootElement),
		finalTops: getSortedTops(rankRows),
		focusPreserved,
		hiddenChromeDisplay: getComputedStyle(hiddenChrome).display,
		initialGeometry,
		initializationCls,
		initializationSamples,
		initialTops,
		interactionPrice: getOrderbookActionsStore().selectedPrice?.price ?? null,
		placeholderContentsMatchPosition,
		placeholderRowHeights,
		priceNodePreserved,
		realRowContentCount: realRows.length,
		realRowContentsMatchPosition,
		realRowHeights,
		rankCls: rank.cls,
		rankClsBudget: RANK_CLS_BUDGET,
		rankSamples: rank.samples,
		rankTransform: focusedPosition.style.transform,
		rowGaps: getRowGaps(initialRows),
		rowHeights: initialRows.map((row) => row.height),
		skeletonRowGaps,
		skeletonRowHeights,
		skeletonRowsMatchPosition,
		sizeCls: size.cls,
		sizeDirection,
		sizeSamples: size.samples,
	};
};
