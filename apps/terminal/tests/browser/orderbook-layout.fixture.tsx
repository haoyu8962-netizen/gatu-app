import { i18n } from "@lingui/core";
import { MobileBookView } from "@/components/trade/mobile/mobile-book-view";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import { setBrowserOrderbookEvent, setBrowserOrderbookPending } from "./mobile-orderbook-cls.browser";
import "./mobile-orderbook-cls.css";

interface FixtureOptions {
	view: "desktop" | "compact" | "split";
	height: number;
	width: number;
	depth?: number;
	pending?: boolean;
}

declare global {
	interface Window {
		setOrderbookLayoutFixture: (options: FixtureOptions) => void;
		getOrderbookLayoutSelectedPrice: () => string | null;
	}
}

const element = document.getElementById("root");
if (!element) throw new Error("Missing fixture root");
const root = createI18nRoot(element);
i18n.loadAndActivate({ locale: "en", messages: {} });
document.body.style.margin = "0";

window.setOrderbookLayoutFixture = ({ view, height, width, depth = 20, pending = false }) => {
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
	root.render(
		<div key={view} style={{ display: "flex", flexDirection: "column", height, width }}>
			{view === "desktop" ? (
				<OrderbookPanel />
			) : (
				<MobileBookView active compact={view === "compact"} inTabLayout view="book" />
			)}
		</div>,
	);
};
window.getOrderbookLayoutSelectedPrice = () => getOrderbookActionsStore().selectedPrice?.price ?? null;
window.setOrderbookLayoutFixture({ view: "desktop", width: 280, height: 677 });
