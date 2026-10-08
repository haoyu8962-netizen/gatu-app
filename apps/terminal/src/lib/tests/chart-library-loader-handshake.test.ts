// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chartLibraryRoot = resolve(__dirname, "../../../public/charting_library");
const LOADER_FILES = [
	"charting_library.js",
	"charting_library.esm.js",
	"charting_library.cjs.js",
	"charting_library.standalone.js",
];
const READY_BUDGET_MS = 50;

type WidgetConstructor = new (
	options: Record<string, unknown>,
) => { onChartReady(callback: () => void): void; remove(): void };
type Handshake = { ready: boolean; registeredBeforeWrite: boolean; listenerCount: number };

function loadWidget(file: string, source: string): WidgetConstructor {
	let widget: WidgetConstructor | undefined;
	if (file.endsWith(".esm.js")) {
		const exportList = source.match(/export\{([^}]*)\};?\s*$/);
		const widgetBinding = exportList?.[1]
			.split(",")
			.map((entry) => entry.trim().split(/\s+as\s+/))
			.find(([, exported]) => exported === "widget")?.[0];
		if (!exportList || !widgetBinding) throw new Error(`${file}: cannot find the widget export`);
		const script = `${source.slice(0, exportList.index)}exports.widget=${widgetBinding};`;
		const exports: { widget?: WidgetConstructor } = {};
		new Function("exports", script)(exports);
		widget = exports.widget;
	} else if (file.endsWith(".standalone.js")) {
		widget = (new Function(`${source};return TradingView;`)() as { widget?: WidgetConstructor }).widget;
	} else {
		const exports: { widget?: WidgetConstructor } = {};
		new Function("exports", "module", "define", source)(exports, { exports }, undefined);
		widget = exports.widget;
	}
	if (!widget) throw new Error(`${file} did not export widget`);
	return widget;
}

function toLegacyOrder(source: string): string {
	const legacy = source
		.replace(
			/n\?([a-zA-Z_$]+)\.contentWindow\?\(\1\.contentWindow\.document\.open\(\),_listenInnerWindowLoad\(\),/,
			"n&&($1.contentWindow?($1.contentWindow.document.open(),",
		)
		.replace(
			/:\(console\.warn\(("[^"]+")\),_listenInnerWindowLoad\(\)\):_listenInnerWindowLoad\(\),/,
			":console.warn($1)),_listenInnerWindowLoad(),",
		);
	if (legacy === source) throw new Error("legacy transform did not apply");
	return legacy;
}

function createContainer(mode: "sync" | "async", onHandshake: (state: Handshake) => void) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const prototypeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
	if (!prototypeInnerHtml?.set) throw new Error("innerHTML setter missing");
	Object.defineProperty(container, "innerHTML", {
		configurable: true,
		set(html: string) {
			prototypeInnerHtml.set?.call(container, html);
			const frame = container.querySelector("iframe");
			const inner = frame?.contentWindow as
				| (Window &
						typeof globalThis & { widgetReady?: (callback: () => void) => void; initializationFinished?: () => void })
				| null;
			if (!inner) throw new Error("iframe has no contentWindow");
			const state: Handshake = { ready: false, registeredBeforeWrite: false, listenerCount: 0 };
			const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
			const add = inner.addEventListener.bind(inner);
			const remove = inner.removeEventListener.bind(inner);
			inner.addEventListener = (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions,
			) => {
				listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
				if (type === "innerWindowLoad") state.listenerCount += 1;
				add(type, listener, options);
			};
			const innerDocument = inner.document;
			innerDocument.open = (() => {
				for (const [type, set] of listeners) for (const listener of set) remove(type, listener);
				listeners.clear();
				return innerDocument;
			}) as Document["open"];
			innerDocument.write = () => {
				state.registeredBeforeWrite = (listeners.get("innerWindowLoad")?.size ?? 0) > 0;
				if (mode === "sync") inner.dispatchEvent(new inner.Event("innerWindowLoad"));
				else setTimeout(() => inner.dispatchEvent(new inner.Event("innerWindowLoad")), 0);
			};
			innerDocument.close = () => undefined;
			inner.widgetReady = (callback) => callback();
			inner.initializationFinished = () => undefined;
			onHandshake(state);
		},
		get() {
			return prototypeInnerHtml.get?.call(container) as string;
		},
	});
	return container;
}

async function runHandshake(Widget: WidgetConstructor, features: string[], mode: "sync" | "async") {
	let state: Handshake | undefined;
	let widget: { onChartReady(callback: () => void): void; remove(): void } | undefined;
	let budget: ReturnType<typeof setTimeout> | undefined;
	const container = createContainer(mode, (next) => {
		state = next;
	});
	try {
		widget = new Widget({
			container,
			datafeed: {},
			library_path: "/charting_library/",
			symbol: "BTC",
			interval: "60",
			locale: "en",
			enabled_features: features,
		});
		const frame = container.querySelector("iframe");
		const inner = frame?.contentWindow as (Window & typeof globalThis) | null;
		if (!state || !inner) throw new Error("widget did not create its iframe");
		if (features.includes("iframe_loading_same_origin")) {
			await Promise.resolve();
			inner.dispatchEvent(new inner.Event("sameOriginLoad"));
		}
		const ready = await Promise.race([
			new Promise<boolean>((resolveReady) => widget?.onChartReady(() => resolveReady(true))),
			new Promise<boolean>((resolveReady) => {
				budget = setTimeout(() => resolveReady(false), READY_BUDGET_MS);
			}),
		]);
		return { ...state, ready };
	} finally {
		if (budget) clearTimeout(budget);
		try {
			widget?.remove();
		} finally {
			container.remove();
		}
	}
}

describe("chart library loader handshake", () => {
	for (const file of LOADER_FILES) {
		const source = readFileSync(resolve(chartLibraryRoot, file), "utf8");

		it(`${file} becomes ready when the injected document dispatches innerWindowLoad synchronously during write`, async () => {
			const Widget = loadWidget(file, source);
			for (const features of [["iframe_loading_same_origin"], ["iframe_loading_compatibility_mode"]]) {
				const result = await runHandshake(Widget, features, "sync");
				expect(result, features.join()).toEqual({ ready: true, registeredBeforeWrite: true, listenerCount: 1 });
			}
		});

		it(`${file} still becomes ready when the inner document loads asynchronously`, async () => {
			const Widget = loadWidget(file, source);
			const result = await runHandshake(Widget, ["iframe_loading_same_origin"], "async");
			expect(result).toEqual({ ready: true, registeredBeforeWrite: true, listenerCount: 1 });
		});

		it(`${file} with the upstream listener order misses the synchronous dispatch (negative control)`, async () => {
			const Widget = loadWidget(file, toLegacyOrder(source));
			const result = await runHandshake(Widget, ["iframe_loading_same_origin"], "sync");
			expect(result).toEqual({ ready: false, registeredBeforeWrite: false, listenerCount: 1 });
		});
	}
});
