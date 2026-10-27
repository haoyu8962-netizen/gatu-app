// WAI-ARIA tabs with automatic activation for every [data-tabs] block: click, the Arrow keys that match the tab
// list's current layout (Left/Right in a row; Up/Down, and Left/Right, in a column), Home and End.
//
// The markup renders every static panel, so the content is readable without JavaScript, and marks the panels after
// the first with data-tabpanel-deferred. global.css hides those panels before first paint while this script may
// still run (`html.js`), and shows them again with the tab list hidden if the page has loaded (`html.js-loaded`, set
// by the head script on `load`, after every module script has run) and a block is still not marked ready, so a tab
// script that failed to load or threw never leaves content hidden. Panels marked data-requires-js stay hidden
// until their tab is selected. Wiring a block hides its unselected panels and marks it data-tabs-ready.
//
// A switch dispatches `tabs:change` on the block with the selected panel's id and marks the block with
// data-tabs-switched, which lets global.css animate panels the visitor switches to but never the first render.
//
// A block marked data-tabs-crossfade (04 features) keeps every panel rendered, stacked in one grid cell, and marks
// each with data-tab-state instead of `hidden`: the selected panel is "active", the one it replaces is "leaving"
// on top of it while its figure fades out, so the dark stage never fades and the two screenshots cross-fade; the
// others are "inactive" (visibility: hidden, inert). Its images are fetched and decoded before the block scrolls
// into view, so no switch waits for a download.

export const TAB_CHANGE_EVENT = "tabs:change";

type Orientation = "horizontal" | "vertical";

const FOCUSABLE = 'a[href], button, input, select, textarea, iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** A tab list laid out as a column is vertical; a row (the features list on narrow screens) is horizontal. */
export function orientationOf(list: HTMLElement): Orientation {
	const view = list.ownerDocument.defaultView;
	const direction = view ? view.getComputedStyle(list).flexDirection : "";
	return direction.startsWith("column") ? "vertical" : "horizontal";
}

function syncOrientation(list: HTMLElement): Orientation {
	const orientation = orientationOf(list);
	if (list.getAttribute("aria-orientation") !== orientation) list.setAttribute("aria-orientation", orientation);
	return orientation;
}

/** The index a key moves to, or -1 when the key is not a tab-list key for this orientation (it is left alone). */
export function nextIndex(key: string, current: number, count: number, orientation: Orientation): number {
	const forward = orientation === "vertical" ? ["ArrowDown", "ArrowRight"] : ["ArrowRight"];
	const backward = orientation === "vertical" ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft"];
	if (forward.includes(key)) return (current + 1) % count;
	if (backward.includes(key)) return (current - 1 + count) % count;
	if (key === "Home") return 0;
	if (key === "End") return count - 1;
	return -1;
}

function panelOf(root: HTMLElement, tab: HTMLElement): HTMLElement | null {
	return root.ownerDocument.getElementById(tab.getAttribute("aria-controls") ?? "");
}

type TabState = "active" | "leaving" | "inactive";

const leavingTimers = new WeakMap<HTMLElement, number>();

function setState(panel: HTMLElement, state: TabState) {
	panel.dataset.tabState = state;
	panel.inert = state !== "active";
}

/** How long the leaving panel's figure fades, from its computed transition; 0 under reduced motion. */
function leaveDuration(panel: HTMLElement): number {
	const view = panel.ownerDocument.defaultView;
	const figure = panel.querySelector("figure");
	if (!view || !figure) return 0;
	const style = view.getComputedStyle(figure);
	const seconds = (value: string) => Math.max(0, ...value.split(",").map((part) => Number.parseFloat(part) || 0));
	return (seconds(style.transitionDuration) + seconds(style.transitionDelay)) * 1000;
}

function crossfade(root: HTMLElement, tabs: HTMLElement[], next: HTMLElement) {
	const view = root.ownerDocument.defaultView;
	const pending = leavingTimers.get(root);
	if (pending !== undefined) view?.clearTimeout(pending);
	let leaving: HTMLElement | null = null;
	for (const tab of tabs) {
		const panel = panelOf(root, tab);
		if (!panel) continue;
		panel.hidden = false;
		if (tab === next) setState(panel, "active");
		else if (panel.dataset.tabState === "active" && root.hasAttribute("data-tabs-ready")) leaving = panel;
		else setState(panel, "inactive");
	}
	if (!leaving) return;
	setState(leaving, "leaving");
	const duration = leaveDuration(leaving);
	const done = leaving;
	if (duration === 0 || !view) {
		setState(done, "inactive");
		return;
	}
	leavingTimers.set(
		root,
		view.setTimeout(() => {
			if (done.dataset.tabState === "leaving") setState(done, "inactive");
			leavingTimers.delete(root);
		}, duration + 50),
	);
}

function show(root: HTMLElement, tabs: HTMLElement[], next: HTMLElement) {
	for (const tab of tabs) {
		const selected = tab === next;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
	}
	if (root.hasAttribute("data-tabs-crossfade")) {
		crossfade(root, tabs, next);
		return;
	}
	for (const tab of tabs) {
		const panel = panelOf(root, tab);
		if (panel) panel.hidden = tab !== next;
	}
}

/** Fetch and decode a cross-fading block's screenshots before it scrolls into view. */
function preloadImages(root: HTMLElement) {
	const view = root.ownerDocument.defaultView;
	const images = [...root.querySelectorAll<HTMLImageElement>("[data-tabpanel] img")];
	if (!view || images.length === 0) return;
	const warm = () => {
		for (const image of images) {
			image.loading = "eager";
			image.decode().catch(() => {});
		}
	};
	if (!("IntersectionObserver" in view)) {
		warm();
		return;
	}
	const observer = new view.IntersectionObserver(
		(entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			warm();
		},
		{ rootMargin: "800px 0px" },
	);
	observer.observe(root);
}

function select(root: HTMLElement, tabs: HTMLElement[], next: HTMLElement, focus: boolean) {
	show(root, tabs, next);
	if (focus) next.focus();
	root.dataset.tabsSwitched = "";
	root.dispatchEvent(new CustomEvent(TAB_CHANGE_EVENT, { detail: { panel: next.getAttribute("aria-controls") } }));
}

function wireBlock(root: HTMLElement): void {
	const list = root.querySelector<HTMLElement>("[data-tablist]");
	if (!list || list.dataset.wired === "true") return;
	const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
	const panels = tabs.map((tab) => panelOf(root, tab));
	if (tabs.length === 0 || panels.some((panel) => panel === null)) return;
	list.dataset.wired = "true";
	const initial = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
	for (const panel of panels) {
		if (panel && !panel.querySelector(FOCUSABLE)) panel.tabIndex = 0;
	}
	syncOrientation(list);
	const view = root.ownerDocument.defaultView;
	if (view && "ResizeObserver" in view) new view.ResizeObserver(() => syncOrientation(list)).observe(list);
	for (const tab of tabs) tab.addEventListener("click", () => select(root, tabs, tab, false));
	list.addEventListener("keydown", (event) => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const current = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
		const next = nextIndex(event.key, current, tabs.length, syncOrientation(list));
		if (next === -1) return;
		event.preventDefault();
		const target = tabs[next];
		if (target) select(root, tabs, target, true);
	});
	if (initial) show(root, tabs, initial);
	if (root.hasAttribute("data-tabs-crossfade")) preloadImages(root);
	root.dataset.tabsReady = "";
}

export function wireTabs(document: Document): void {
	for (const root of document.querySelectorAll<HTMLElement>("[data-tabs]")) {
		try {
			wireBlock(root);
		} catch {
			// The block stays unmarked, so global.css keeps all of its panels readable once the page has loaded.
		}
	}
}
