import { i18n } from "@lingui/core";
import { useEffect, useState } from "react";
import { MobileBookView } from "@/components/trade/mobile/mobile-book-view";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages as englishMessages } from "@/locales/en/messages.po";
import { messages as chineseMessages } from "@/locales/zh/messages.po";
import { useAnimateOrderbook, useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import {
	type BrowserOrderbookEvent,
	setBrowserOrderbookEvent,
	setBrowserOrderbookUnavailable,
} from "./mobile-orderbook-cls.browser";
import "./mobile-orderbook-cls.css";

interface FixtureOptions {
	view: "desktop" | "compact" | "split";
	height: number;
	width: number;
	active: boolean;
	quote: boolean;
}

interface SnapshotOptions {
	ask?: string;
	bid?: string;
	size?: string;
	empty?: "asks" | "bids" | "both";
	source?: "l2" | "l2Book-fast" | "l2Book-full";
	coin?: string;
}

declare global {
	interface Window {
		configureOrderbookPulse: (options: Partial<FixtureOptions>) => void;
		publishOrderbookPulseSnapshot: (options?: SnapshotOptions) => Promise<void>;
		setOrderbookPulseUnavailable: typeof setBrowserOrderbookUnavailable;
		setOrderbookPulsePresentation: (theme: "dark" | "light", locale: "en" | "zh", quote: boolean) => void;
		getOrderbookPulseSelectedPrice: () => string | null;
	}
}

let currentView: FixtureOptions["view"] = "desktop";
let snapshotTime = 0;

function OrderbookPulseFixture() {
	const [options, setOptions] = useState<FixtureOptions>({
		view: "desktop",
		height: 677,
		width: 280,
		active: true,
		quote: false,
	});
	const animateOrderbook = useAnimateOrderbook();
	const { setAnimateOrderbook, setTheme } = useGlobalSettingsActions();
	const { setSizeMode } = useOrderEntryActions();

	useEffect(() => {
		window.configureOrderbookPulse = (next) => {
			if (next.view) currentView = next.view;
			setOptions((previous) => ({ ...previous, ...next }));
		};
		window.setOrderbookPulsePresentation = (theme, locale, quote) => {
			setTheme(theme);
			setSizeMode(quote ? "quote" : "base");
			i18n.loadAndActivate({ locale, messages: locale === "zh" ? chineseMessages : englishMessages });
			setOptions((previous) => ({ ...previous, quote }));
		};
	}, [setSizeMode, setTheme]);

	return (
		<>
			<main
				data-slot="pulse-fixture-panel"
				style={{ display: "flex", flexDirection: "column", height: options.height, width: options.width }}
			>
				{options.view === "desktop" ? (
					<OrderbookPanel />
				) : (
					<MobileBookView
						active={options.active}
						compact={options.view === "compact"}
						inTabLayout
						showOrderbookInQuote={options.quote}
						view="book"
					/>
				)}
			</main>
			<footer data-slot="pulse-fixture-footer">Account boundary</footer>
			<label>
				<input
					type="checkbox"
					checked={animateOrderbook}
					onChange={(event) => setAnimateOrderbook(event.target.checked)}
				/>
				Animate order book
			</label>
		</>
	);
}

window.publishOrderbookPulseSnapshot = ({ ask, bid, size = "1", empty, source, coin = "CLS_HYPE" } = {}) => {
	const resolvedSource = source ?? (currentView === "compact" ? "l2" : "l2Book-full");
	const levels: BrowserOrderbookEvent["levels"] = [
		Array.from({ length: 20 }, (_, rank) => ({ n: 1, px: String(99 - rank), sz: size })),
		Array.from({ length: 20 }, (_, rank) => ({ n: 1, px: String(101 + rank), sz: size })),
	];
	if (bid) levels[0].unshift({ n: 1, px: bid, sz: size });
	if (ask) levels[1].unshift({ n: 1, px: ask, sz: size });
	if (empty === "bids" || empty === "both") levels[0] = [];
	if (empty === "asks" || empty === "both") levels[1] = [];
	snapshotTime += 1;
	setBrowserOrderbookEvent(
		{ coin, ...(resolvedSource === "l2Book-fast" ? { fast: true } : {}), levels, time: snapshotTime },
		resolvedSource,
	);
	return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};
window.setOrderbookPulseUnavailable = setBrowserOrderbookUnavailable;
window.getOrderbookPulseSelectedPrice = () => getOrderbookActionsStore().selectedPrice?.price ?? null;

const element = document.getElementById("root");
if (!element) throw new Error("Missing fixture root");
i18n.loadAndActivate({ locale: "en", messages: englishMessages });
document.body.style.margin = "0";
createI18nRoot(element).render(<OrderbookPulseFixture />);
