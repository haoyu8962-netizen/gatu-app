import { STORAGE_KEYS } from "@/config/app";
import { localeList } from "@/config/i18n";
import { getBootstrapFatalCopy, getBootstrapFatalDirection, getBootstrapFatalLocale } from "@/lib/bootstrap-error-copy";

const BOOTSTRAP_ERROR_PAGE_ATTRIBUTE = "data-terminal-bootstrap-error";
// The Service Worker's startup asset caches (ADR 0052); clearing them lets a reload fetch every chunk again.
const ASSET_CACHE_PREFIX = "assets-";
const ASSET_CACHE_CLEAR_TIMEOUT_MS = 1_000;
const HEADING_ID = "terminal-bootstrap-error-heading";
const DESCRIPTION_ID = "terminal-bootstrap-error-description";
const CONTAINER_STYLE =
	"min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0F1A1F;color:#fff;font-family:system-ui,sans-serif;text-align:center";
const HEADING_STYLE = "margin:0 0 8px;font-size:16px";
const DESCRIPTION_STYLE = "margin:0 0 16px;color:#aab4b9;font-size:13px";
const RELOAD_BUTTON_STYLE =
	"border:0;border-radius:6px;padding:8px 12px;background:#86E5D3;color:#08090D;font:inherit;cursor:pointer";
// The prerendered shell's watchdog (getBootstrapEntryWatchdogScript) installs this callback; the
// client entry calls it as its first statement, which proves the entry and its static imports loaded.
const ENTRY_STARTED_CALLBACK = "__sairnEntryStarted";
// Without the entry by then the shell shows the failure page. Far above an ordinary cold start
// (TRADE_ROUTE_REVEAL_BUDGET_MS is 1.5 s, the font cap 3 s) so a slow network is not reported as a failure.
export const BOOTSTRAP_ENTRY_WATCHDOG_MS = 60_000;
// Async module scripts delay the window load event, so an entry that has not started by then has
// failed; the grace only absorbs a browser that fires load early.
export const BOOTSTRAP_ENTRY_LOAD_GRACE_MS = 5_000;

interface BootstrapErrorPageOptions {
	onReload?: () => void;
}

export function renderBootstrapErrorPage({ onReload = reloadWindow }: BootstrapErrorPageOptions = {}): void {
	try {
		const body = document.body;
		if (!body || body.querySelector(`[${BOOTSTRAP_ERROR_PAGE_ATTRIBUTE}]`)) return;
		const locale = getBootstrapFatalLocale();
		const copy = getBootstrapFatalCopy(locale);
		const direction = getBootstrapFatalDirection(locale);
		document.documentElement.lang = locale;
		document.documentElement.dir = direction;

		const container = document.createElement("main");
		container.setAttribute(BOOTSTRAP_ERROR_PAGE_ATTRIBUTE, "");
		container.lang = locale;
		container.dir = direction;
		container.style.cssText = CONTAINER_STYLE;

		const content = document.createElement("div");
		content.setAttribute("role", "alert");
		content.setAttribute("aria-labelledby", HEADING_ID);
		content.setAttribute("aria-describedby", DESCRIPTION_ID);
		const heading = document.createElement("h1");
		const description = document.createElement("p");
		const reloadButton = document.createElement("button");

		heading.id = HEADING_ID;
		heading.textContent = copy.heading;
		heading.style.cssText = HEADING_STYLE;
		description.id = DESCRIPTION_ID;
		description.textContent = copy.description;
		description.style.cssText = DESCRIPTION_STYLE;
		reloadButton.type = "button";
		reloadButton.textContent = copy.reload;
		reloadButton.style.cssText = RELOAD_BUTTON_STYLE;
		reloadButton.addEventListener("click", onReload, { once: true });

		content.append(heading, description, reloadButton);
		container.append(content);
		body.replaceChildren(container);
		reloadButton.focus();
	} catch {}
}

function reloadWindow(): void {
	void clearAssetCachesThenReload(() => window.location.reload());
}

export async function clearAssetCachesThenReload(
	reload: () => void,
	timeoutMs = ASSET_CACHE_CLEAR_TIMEOUT_MS,
): Promise<void> {
	try {
		if (typeof caches !== "undefined") {
			const clearing = caches
				.keys()
				.then((keys) =>
					Promise.allSettled(keys.filter((key) => key.startsWith(ASSET_CACHE_PREFIX)).map((key) => caches.delete(key))),
				);
			await Promise.race([clearing, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
		}
	} catch {}
	reload();
}

export function reportBootstrapEntryStarted(): void {
	try {
		const callback = (window as unknown as Record<string, unknown>)[ENTRY_STARTED_CALLBACK];
		if (typeof callback === "function") callback();
	} catch {}
}

/**
 * Inline `<head>` script of the prerendered shell for the case the client entry never runs (its
 * module or a static import failed to load, or never arrives), so `renderBootstrapErrorPage` cannot.
 * It renders the same page from the same copy, reloads the same way, and stays silent once the entry
 * reports itself. Its CSP hash is collected from the built HTML like the theme bootstrap's.
 */
export function getBootstrapEntryWatchdogScript(): string {
	const copy: Record<string, [string, string, string, 0 | 1]> = {};
	for (const { code } of localeList) {
		const { heading, description, reload } = getBootstrapFatalCopy(code);
		copy[code] = [heading, description, reload, getBootstrapFatalDirection(code) === "rtl" ? 1 : 0];
	}
	const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
	return `(()=>{const w=window,d=document,C=${json(copy)};let done=0,timer;const stop=()=>{done=1;clearTimeout(timer);w.removeEventListener("error",onError,!0);w.removeEventListener("load",onLoad)};const fail=()=>{if(done)return;stop();try{const b=d.body;if(!b||b.querySelector(${json(`[${BOOTSTRAP_ERROR_PAGE_ATTRIBUTE}]`)}))return;let l="en";try{const s=localStorage.getItem(${json(STORAGE_KEYS.LOCALE)});if(s&&Object.prototype.hasOwnProperty.call(C,s))l=s}catch{}const c=C[l],dir=c[3]?"rtl":"ltr",r=d.documentElement,m=d.createElement("main"),x=d.createElement("div"),h=d.createElement("h1"),p=d.createElement("p"),k=d.createElement("button");r.lang=l;r.dir=dir;m.setAttribute(${json(BOOTSTRAP_ERROR_PAGE_ATTRIBUTE)},"");m.lang=l;m.dir=dir;m.style.cssText=${json(CONTAINER_STYLE)};x.setAttribute("role","alert");x.setAttribute("aria-labelledby",${json(HEADING_ID)});x.setAttribute("aria-describedby",${json(DESCRIPTION_ID)});h.id=${json(HEADING_ID)};h.textContent=c[0];h.style.cssText=${json(HEADING_STYLE)};p.id=${json(DESCRIPTION_ID)};p.textContent=c[1];p.style.cssText=${json(DESCRIPTION_STYLE)};k.type="button";k.textContent=c[2];k.style.cssText=${json(RELOAD_BUTTON_STYLE)};k.addEventListener("click",()=>{const go=()=>location.reload();try{if(typeof caches=="undefined")return go();Promise.race([caches.keys().then(n=>Promise.allSettled(n.filter(e=>e.startsWith(${json(ASSET_CACHE_PREFIX)})).map(e=>caches.delete(e)))),new Promise(f=>setTimeout(f,${ASSET_CACHE_CLEAR_TIMEOUT_MS}))]).then(go,go)}catch{go()}},{once:!0});x.append(h,p,k);m.append(x);b.replaceChildren(m);k.focus()}catch{}};const onError=e=>{const t=e.target;if(t&&t.tagName==="SCRIPT"&&t.type==="module"&&t.src)fail()};const onLoad=()=>{clearTimeout(timer);timer=setTimeout(fail,${BOOTSTRAP_ENTRY_LOAD_GRACE_MS})};w[${json(ENTRY_STARTED_CALLBACK)}]=stop;w.addEventListener("error",onError,!0);w.addEventListener("load",onLoad);timer=setTimeout(fail,${BOOTSTRAP_ENTRY_WATCHDOG_MS})})();`;
}
