import { i18n } from "@lingui/core";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { useDesktopGridLayout } from "@/components/trade/layout/use-desktop-grid-layout";
import { MobileAccountView } from "@/components/trade/mobile/mobile-account-view";
import { AccountModeForm } from "@/components/trade/tradebox/account-mode-modal";
import { AccountPanel } from "@/components/trade/tradebox/account-panel";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages } from "@/locales/en/messages.po";
import { messages as chineseMessages } from "@/locales/zh/messages.po";
import { useSetTheme } from "@/stores/use-global-settings-store";
import { setAccountActionsFixture, useAccountActionsFixture } from "./account-actions.browser";
import { FundsFormsFixture } from "./funds-forms.fixture";
import "./mobile-orderbook-cls.css";
import "react-grid-layout/css/styles.css";

const surface = new URLSearchParams(location.search).get("surface");

function Fixture() {
	const state = useAccountActionsFixture();
	const setTheme = useSetTheme();
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps, accountContentRef } = useDesktopGridLayout(width, mounted);
	return (
		<div className="min-h-svh bg-canvas text-fg">
			<nav className="flex min-h-10 flex-wrap gap-3 text-xs">
				<button type="button" onClick={() => i18n.loadAndActivate({ locale: "en", messages })}>
					English
				</button>
				<button type="button" onClick={() => i18n.loadAndActivate({ locale: "zh", messages: chineseMessages })}>
					中文
				</button>
				<button type="button" onClick={() => setTheme("light")}>
					Theme light
				</button>
				<button type="button" onClick={() => setTheme("dark")}>
					Theme dark
				</button>
				<button
					type="button"
					onClick={() => setAccountActionsFixture({ connected: false, ownerWallet: false, sponsored: false })}
				>
					Disconnected
				</button>
				<button
					type="button"
					onClick={() => setAccountActionsFixture({ connected: false, ownerWallet: false, sponsored: true })}
				>
					Sponsored email
				</button>
				<button
					type="button"
					onClick={() =>
						setAccountActionsFixture({
							connected: true,
							ownerWallet: true,
							sponsored: false,
							ready: true,
							mode: "disabled",
							geo: "allowed",
						})
					}
				>
					Owner wallet
				</button>
				<button
					type="button"
					onClick={() => setAccountActionsFixture({ connected: true, ownerWallet: false, sponsored: false })}
				>
					Agent only
				</button>
				<button type="button" onClick={() => setAccountActionsFixture({ mode: "unifiedAccount" })}>
					Unified
				</button>
				<button type="button" onClick={() => setAccountActionsFixture({ mode: "disabled" })}>
					Manual mode
				</button>
				<button type="button" onClick={() => setAccountActionsFixture({ mode: "portfolioMargin" })}>
					Portfolio mode
				</button>
				<button type="button" onClick={() => setAccountActionsFixture({ mode: null })}>
					Unresolved mode
				</button>
				<button type="button" onClick={() => setAccountActionsFixture({ ready: !state.ready })}>
					Snapshot
				</button>
				<button type="button" onClick={() => setAccountActionsFixture({ geo: "restricted" })}>
					Restricted
				</button>
				<output aria-label="Opened funds actions">{JSON.stringify(state.actions)}</output>
			</nav>
			{surface === "mode" ? (
				<div className="mx-auto max-w-sm bg-modal py-4">
					<AccountModeForm
						key={state.mode ?? "unresolved"}
						currentMode={state.mode}
						canChange
						mobileLayout={window.matchMedia("(max-width: 1000px)").matches}
						onApply={async (mode) => setAccountActionsFixture({ mode })}
						onClose={() => {}}
					/>
				</div>
			) : surface === "funds" ? (
				<FundsFormsFixture />
			) : surface === "mobile" ? (
				<MobileAccountView />
			) : (
				<div ref={containerRef} className="desktop-terminal-grid bg-grid-container" data-fixture-grid>
					{mounted && (
						<Responsive {...gridProps}>
							<div key="favoriteCoins" data-panel="favoriteCoins" className="desktop-grid-panel bg-surface">
								Favorites
							</div>
							<div key="coinInfo" data-panel="coinInfo" className="desktop-grid-panel bg-surface">
								Market
							</div>
							<div key="chart" data-panel="chart" className="desktop-grid-panel bg-surface">
								Chart
							</div>
							<div key="marketData" data-panel="marketData" className="desktop-grid-panel bg-surface">
								Order book
							</div>
							<div key="tradingInterface" data-panel="tradingInterface" className="desktop-grid-panel bg-surface">
								Order entry
							</div>
							<div key="accountTable" data-panel="accountTable" className="desktop-grid-panel bg-surface">
								Account table
							</div>
							<div
								key="accountInfo"
								data-panel="accountInfo"
								className="desktop-grid-panel account-panel-container overflow-hidden bg-surface"
							>
								<div ref={accountContentRef} className="h-full">
									<AccountPanel />
								</div>
							</div>
						</Responsive>
					)}
				</div>
			)}
		</div>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
i18n.loadAndActivate({ locale: "en", messages });
createI18nRoot(root).render(<Fixture />);
