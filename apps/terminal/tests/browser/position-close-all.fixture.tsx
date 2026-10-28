import { i18n } from "@lingui/core";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import { MobilePositionsTab } from "@/components/trade/mobile/mobile-positions-tab";
import { useMobileDisclosureSetState } from "@/components/trade/mobile/use-mobile-disclosure-set";
import { OrderNotificationHost } from "@/components/trade/order-notification-host";
import { PositionDialogHost } from "@/components/trade/positions/position-dialog-host";
import { PositionsTab } from "@/components/trade/positions/positions-tab";
import { Toaster } from "@/components/ui/sonner";
import { ALL_POSITION_MARKETS } from "@/domain/trade/position-toolbar";
import { useIsMobile } from "@/hooks/use-mobile";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages as ar } from "@/locales/ar/messages.po";
import { messages as en } from "@/locales/en/messages.po";
import { messages as es } from "@/locales/es/messages.po";
import { messages as fr } from "@/locales/fr/messages.po";
import { messages as hi } from "@/locales/hi/messages.po";
import { messages as ja } from "@/locales/ja/messages.po";
import { messages as zh } from "@/locales/zh/messages.po";
import { usePositionCloseAllSession } from "@/stores/use-position-dialog-store";
import { releaseCloseAllFixture, setCloseAllFixture, useCloseAllFixture } from "./position-close-all.browser";
import "./mobile-orderbook-cls.css";

const catalogs = { en, zh, ja, fr, ar, es, hi };

function Fixture() {
	const state = useCloseAllFixture();
	const session = usePositionCloseAllSession();
	const [showPositions, setShowPositions] = useState(true);
	const mobile = useIsMobile();
	const disclosure = useMobileDisclosureSetState(`${state.env}:${state.owner}`);
	return (
		<main className="min-h-svh bg-background text-fg">
			<nav className="flex flex-wrap gap-3 p-2 text-xs">
				{Object.entries(catalogs).map(([locale, messages]) => (
					<button
						type="button"
						key={locale}
						onClick={() => {
							document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
							i18n.loadAndActivate({ locale, messages });
						}}
					>
						{locale}
					</button>
				))}
				<button type="button" onClick={() => setShowPositions(!showPositions)}>
					Switch tab
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ connected: !state.connected })}>
					Connection
				</button>
				{(["ready", "loading", "stale", "error"] as const).map((status) => (
					<button type="button" key={status} onClick={() => setCloseAllFixture({ status })}>
						{status}
					</button>
				))}
				<button type="button" onClick={() => setCloseAllFixture({ marketsReady: !state.marketsReady })}>
					Markets
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ hold: "preflight" })}>
					Hold preflight
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ hold: "exchange" })}>
					Hold exchange
				</button>
				<button type="button" onClick={releaseCloseAllFixture}>
					Release
				</button>
				<button
					type="button"
					onClick={() =>
						setCloseAllFixture({ positions: state.positions.map((position) => ({ ...position, szi: "3" })) })
					}
				>
					Change size
				</button>
				<button
					type="button"
					onClick={() =>
						setCloseAllFixture({
							positions: state.positions.map((position) => ({
								...position,
								szi: position.szi.startsWith("-") ? "-0.5" : "0.5",
							})),
						})
					}
				>
					Shrink size
				</button>
				<button
					type="button"
					onClick={() =>
						setCloseAllFixture({
							positions: state.positions.map((position) => ({
								...position,
								szi: position.szi.startsWith("-") ? position.szi.slice(1) : `-${position.szi}`,
							})),
						})
					}
				>
					Reverse size
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ positions: state.positions.slice(1) })}>
					Remove position
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ positions: [] })}>
					Empty account
				</button>
				<button
					type="button"
					onClick={() => setCloseAllFixture({ clientKey: "0x2222222222222222222222222222222222222222" })}
				>
					Mismatch owner
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ clientKey: state.owner })}>
					Restore owner
				</button>
				<button
					type="button"
					onClick={() => setCloseAllFixture({ env: state.env === "Mainnet" ? "Testnet" : "Mainnet" })}
				>
					Network
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ activeTwap: true })}>
					Active TWAP
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ hip3Accepted: false })}>
					Require HIP-3 disclaimer
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ outcome: "partial" })}>
					Partial
				</button>
				<button type="button" onClick={() => setCloseAllFixture({ outcome: "ambiguous" })}>
					Ambiguous
				</button>
				<output data-testid="session-id">{session?.sessionId ?? "none"}</output>
				<output data-testid="sent-orders">{JSON.stringify(state.orders)}</output>
			</nav>
			<section className="flex min-h-0 flex-col" data-testid="positions-surface">
				{showPositions &&
					(mobile ? (
						<MobilePositionsTab disclosureState={disclosure} scrollMode="page" />
					) : (
						<PositionsTab directionFilter="all" marketFilter={ALL_POSITION_MARKETS} currentMarket={null} />
					))}
			</section>
			<PositionDialogHost />
			<Toaster />
			<OrderNotificationHost />
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
const locale = new URLSearchParams(location.search).get("locale") ?? "en";
if (!Object.hasOwn(catalogs, locale)) throw new Error(`Fixture has no catalog for ${locale}`);
i18n.loadAndActivate({ locale, messages: catalogs[locale as keyof typeof catalogs] });
document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
const router = createRouter({
	routeTree: createRootRoute({ component: Fixture }),
	history: createMemoryHistory({ initialEntries: ["/"] }),
});
createI18nRoot(root).render(<RouterProvider router={router} />);
