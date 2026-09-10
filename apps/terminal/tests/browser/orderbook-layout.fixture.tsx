import { i18n } from "@lingui/core";
import { useEffect } from "react";
import { MobileBookView } from "@/components/trade/mobile/mobile-book-view";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { useSetTheme } from "@/stores/use-global-settings-store";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import {
	type BrowserOrderbookEvent,
	setBrowserOrderbookEvent,
	setBrowserOrderbookPending,
	setBrowserOrderbookUnavailable,
} from "./mobile-orderbook-cls.browser";
import { setBrowserOrderbookReference } from "./trade-panel-all-orders.browser";
import "./mobile-orderbook-cls.css";

interface FixtureOptions {
	view: "desktop" | "compact" | "split";
	height: number;
	width: number;
	depth?: number;
	pending?: boolean;
}

interface HoverSnapshotOptions {
	ask?: string;
	bid?: string;
	size?: string;
	sizes?: string[];
}

declare global {
	interface Window {
		setOrderbookLayoutFixture: (options: FixtureOptions) => void;
		getOrderbookLayoutSelectedPrice: () => string | null;
		publishOrderbookHoverSnapshot: (options?: HoverSnapshotOptions) => Promise<void>;
		setOrderbookHoverUnavailable: typeof setBrowserOrderbookUnavailable;
		setOrderbookHoverReference: typeof setBrowserOrderbookReference;
		resizeOrderbookHoverFixture: (width: number, height: number) => void;
		setOrderbookHoverTheme: (theme: "dark" | "light") => void;
	}
}

const element = document.getElementById("root");
if (!element) throw new Error("Missing fixture root");
const root = createI18nRoot(element);
i18n.loadAndActivate({ locale: "en", messages: {} });
document.body.style.margin = "0";
let currentView: FixtureOptions["view"] = "desktop";
let snapshotTime = 0;

function OrderbookLayoutFixture({ view, height, width }: FixtureOptions) {
	const setTheme = useSetTheme();
	useEffect(() => {
		window.setOrderbookHoverTheme = setTheme;
	}, [setTheme]);
	return (
		<div data-slot="orderbook-layout-fixture" style={{ display: "flex", flexDirection: "column", height, width }}>
			{view === "desktop" ? (
				<OrderbookPanel />
			) : (
				<MobileBookView active compact={view === "compact"} inTabLayout view="book" />
			)}
		</div>
	);
}

window.setOrderbookLayoutFixture = ({ view, height, width, depth = 20, pending = false }) => {
	currentView = view;
	getOrderbookActionsStore().actions.clearSelectedPrice();
	if (pending) setBrowserOrderbookPending();
	else
		setBrowserOrderbookEvent({
			coin: "CLS_HYPE",
			fast: true,
			time: performance.now(),
			levels: [
				Array.from({ length: depth }, (_, rank) => ({ n: 1, px: String(99 - rank), sz: "1" })),
				Array.from({ length: depth }, (_, rank) => ({ n: 1, px: String(101 + rank), sz: "1" })),
			],
		});
	root.render(<OrderbookLayoutFixture key={view} view={view} height={height} width={width} />);
};
window.publishOrderbookHoverSnapshot = ({ ask, bid, size = "1", sizes = [] } = {}) => {
	const levels: BrowserOrderbookEvent["levels"] = [
		Array.from({ length: 20 }, (_, rank) => ({ n: 1, px: String(99 - rank), sz: sizes[rank] ?? size })),
		Array.from({ length: 20 }, (_, rank) => ({ n: 1, px: String(101 + rank), sz: sizes[rank] ?? size })),
	];
	if (bid) levels[0].unshift({ n: 1, px: bid, sz: size });
	if (ask) levels[1].unshift({ n: 1, px: ask, sz: size });
	snapshotTime += 1;
	setBrowserOrderbookEvent(
		{ coin: "CLS_HYPE", levels, time: snapshotTime },
		currentView === "compact" ? "l2" : "l2Book-full",
	);
	return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};
window.setOrderbookHoverUnavailable = setBrowserOrderbookUnavailable;
window.setOrderbookHoverReference = setBrowserOrderbookReference;
window.resizeOrderbookHoverFixture = (width, height) => {
	const panel = document.querySelector<HTMLElement>('[data-slot="orderbook-layout-fixture"]');
	if (!panel) throw new Error("Missing orderbook fixture panel");
	panel.style.width = `${width}px`;
	panel.style.height = `${height}px`;
};
window.getOrderbookLayoutSelectedPrice = () => getOrderbookActionsStore().selectedPrice?.price ?? null;
window.setOrderbookLayoutFixture({ view: "desktop", width: 280, height: 677 });
