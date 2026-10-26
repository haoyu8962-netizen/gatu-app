// WAI-ARIA tabs with automatic activation for every [data-tabs] block: click, Arrow keys (Left/Right, and
// Up/Down when the list is vertical), Home and End. The markup already selects the first tab and hides the
// other panels, and global.css shows every panel while JavaScript is off, so this script only switches.
// A switch dispatches `tabs:change` on the block with the selected panel's id and marks the block with
// data-tabs-switched, which lets global.css animate panels the visitor switches to but never the first render.

export const TAB_CHANGE_EVENT = "tabs:change";

function select(root: HTMLElement, tabs: HTMLElement[], next: HTMLElement, focus: boolean) {
	for (const tab of tabs) {
		const selected = tab === next;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
		const panel = root.ownerDocument.getElementById(tab.getAttribute("aria-controls") ?? "");
		if (panel) panel.hidden = !selected;
	}
	if (focus) next.focus();
	root.dataset.tabsSwitched = "";
	root.dispatchEvent(new CustomEvent(TAB_CHANGE_EVENT, { detail: { panel: next.getAttribute("aria-controls") } }));
}

export function wireTabs(document: Document): void {
	for (const root of document.querySelectorAll<HTMLElement>("[data-tabs]")) {
		const list = root.querySelector<HTMLElement>("[data-tablist]");
		if (!list || list.dataset.wired === "true") continue;
		list.dataset.wired = "true";
		const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
		if (tabs.length === 0) continue;
		const vertical = list.getAttribute("aria-orientation") === "vertical";
		for (const tab of tabs) tab.addEventListener("click", () => select(root, tabs, tab, false));
		list.addEventListener("keydown", (event) => {
			const current = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
			const forward = vertical ? ["ArrowDown", "ArrowRight"] : ["ArrowRight"];
			const backward = vertical ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft"];
			let next = -1;
			if (forward.includes(event.key)) next = (current + 1) % tabs.length;
			else if (backward.includes(event.key)) next = (current - 1 + tabs.length) % tabs.length;
			else if (event.key === "Home") next = 0;
			else if (event.key === "End") next = tabs.length - 1;
			if (next === -1) return;
			event.preventDefault();
			const target = tabs[next];
			if (target) select(root, tabs, target, true);
		});
	}
}
