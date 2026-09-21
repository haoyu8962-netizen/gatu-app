import { i18n } from "@lingui/core";
import { MobileTradeOrderSplit } from "@/components/trade/mobile/mobile-trade-order-split";
import { MobileTradeView } from "@/components/trade/mobile/mobile-trade-view";
import { TradeFormFields } from "@/components/trade/tradebox/trade-form-fields";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { messages } from "@/locales/en/messages.po";
import { messages as chineseMessages } from "@/locales/zh/messages.po";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";
import {
	useLimitPrice,
	useOrderEntryActions,
	useOrderSide,
	useOrderSize,
	useOrderType,
	useReduceOnly,
	useSizeMode,
} from "@/stores/use-order-entry-store";
import { DesktopOrderEntryGrid } from "./desktop-order-entry-grid.fixture";
import {
	setFixtureState,
	useFixtureState,
	useSelectedMarketInfo,
	useUserPositions,
} from "./mobile-trade-all-orders.browser";
import "./mobile-orderbook-cls.css";

function DesktopFields() {
	const { data: market } = useSelectedMarketInfo();
	const side = useOrderSide();
	const sizeMode = useSizeMode();
	const sizeInput = useOrderSize();
	const limitPrice = useLimitPrice();
	const reduceOnly = useReduceOnly();
	const positions = useUserPositions();
	const data = useOrderEntryData({
		market,
		side,
		markPx: 100,
		sizeMode,
		sizeInput,
		limitPx: toNumberOrZero(limitPrice),
		marketOrderSizing: null,
		reduceOnly,
		positionSnapshot: {
			ready: !positions.isLoading,
			receivedAt: positions.receivedAt,
			signedSize: positions.getPosition()?.szi ?? "0",
		},
	});
	return (
		<div data-fixture-desktop className="trade-panel-container w-[300px] p-3">
			<TradeFormFields
				orderEntryData={data}
				visibleValidationErrors={[]}
				price={toNumberOrZero(limitPrice)}
				positionSize={0}
				swapTargetToken={null}
				onSizeModeToggle={data.toggleSizeDenomination}
				onSizePercentApply={data.applySizePercent}
				onSwapClick={() => {}}
			/>
		</div>
	);
}

const quietAudit = new URLSearchParams(window.location.search).has("quiet-audit");

function Fixture() {
	const { data: market } = useSelectedMarketInfo();
	const theme = useTheme();
	const setTheme = useSetTheme();
	const sizeMode = useSizeMode();
	const mobile = useIsMobile();
	const state = useFixtureState();
	const actions = useOrderEntryActions();
	const orderType = useOrderType();
	return (
		<div className="flex h-svh flex-col bg-surface">
			<nav
				className={
					quietAudit
						? "flex h-[50px] shrink-0 gap-2 overflow-x-auto whitespace-nowrap text-xs"
						: "flex min-h-[50px] shrink-0 flex-wrap gap-2 text-xs"
				}
			>
				<button type="button" onClick={() => i18n.loadAndActivate({ locale: "en", messages })}>
					English
				</button>
				<button type="button" onClick={() => i18n.loadAndActivate({ locale: "zh", messages: chineseMessages })}>
					中文
				</button>
				<button type="button" onClick={() => setFixtureState({ connected: !state.connected })}>
					Connection
				</button>
				<button type="button" onClick={() => setFixtureState({ funded: !state.funded })}>
					Funding
				</button>
				<button
					type="button"
					onClick={() => setFixtureState({ status: state.status === "success" ? "stale" : "success" })}
				>
					Freshness
				</button>
				{quietAudit && (
					<>
						{(["success", "loading", "stale", "error"] as const).map((status) => (
							<button type="button" key={status} onClick={() => setFixtureState({ status, accountStatus: "success" })}>
								Market {status}
							</button>
						))}

						{(["success", "loading", "stale", "error"] as const).map((accountStatus) => (
							<button type="button" key={accountStatus} onClick={() => setFixtureState({ accountStatus })}>
								Account {accountStatus}
							</button>
						))}
						<button type="button" onClick={() => setFixtureState({ positionPending: !state.positionPending })}>
							Positions pending
						</button>
					</>
				)}
				<button type="button" onClick={() => actions.resetForm()}>
					Reset
				</button>
				<button
					type="button"
					aria-pressed={theme === "dark"}
					onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
				>
					Theme
				</button>
			</nav>
			<main data-fixture-page className="min-h-0 flex-1 overflow-y-auto">
				{mobile || !quietAudit ? <div className="h-[62px]">{market.pairName}</div> : null}
				{mobile ? (
					<MobileTradeOrderSplit
						orderbook={
							<div data-fixture-book className="absolute inset-0 border-l border-stroke">
								Order book
							</div>
						}
					>
						<div
							data-fixture-form
							data-order-type={orderType}
							className="flex min-h-0 min-w-0 flex-[1.53] flex-col self-stretch"
						>
							<MobileTradeView embedded sizeMode={sizeMode} onSizeModeChange={actions.setSizeMode} />
						</div>
					</MobileTradeOrderSplit>
				) : quietAudit ? (
					<DesktopOrderEntryGrid />
				) : (
					<DesktopFields />
				)}
				<section data-fixture-positions className="h-[200px]">
					Positions
				</section>
			</main>
			<footer className="h-[57px] shrink-0">
				Navigation<output aria-label="Captured orders">{JSON.stringify(state.submissions)}</output>
			</footer>
		</div>
	);
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
i18n.loadAndActivate({ locale: "en", messages });
createI18nRoot(root).render(<Fixture />);
