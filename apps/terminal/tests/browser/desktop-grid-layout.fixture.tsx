import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { useDesktopGridLayout } from "@/components/trade/layout/use-desktop-grid-layout";
import "react-grid-layout/css/styles.css";
import "./desktop-grid-layout.css";

let nextMountId = 1;

function PanelContent({ name }: { name: string }) {
	const [mountId] = useState(() => nextMountId++);
	return <span data-mount-id={mountId}>{name}</span>;
}

function Fixture() {
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps, tradeContentRef, accountContentRef } = useDesktopGridLayout(width, mounted);
	const [tradeHeight, setTradeHeight] = useState(644);
	const [accountHeight, setAccountHeight] = useState(200);
	return (
		<>
			<nav>
				<button type="button" onClick={() => setTradeHeight(850)}>
					Expand trade
				</button>
				<button type="button" onClick={() => setAccountHeight(700)}>
					Expand account
				</button>
				<button
					type="button"
					onClick={() => {
						setTradeHeight(644);
						setAccountHeight(200);
					}}
				>
					Contract content
				</button>
			</nav>
			<main ref={containerRef}>
				{mounted ? (
					<Responsive {...gridProps}>
						<div key="favoriteCoins" data-panel="favoriteCoins">
							<PanelContent name="Favorites" />
						</div>
						<div key="coinInfo" data-panel="coinInfo">
							<PanelContent name="Market information" />
						</div>
						<div key="chart" data-panel="chart">
							<PanelContent name="Chart" />
						</div>
						<div key="marketData" data-panel="marketData">
							<PanelContent name="Market data" />
						</div>
						<div key="tradingInterface" data-panel="tradingInterface">
							<div ref={tradeContentRef} style={{ height: tradeHeight }}>
								<PanelContent name="Trading form" />
							</div>
						</div>
						<div key="accountTable" data-panel="accountTable">
							<PanelContent name="Account table" />
						</div>
						<div key="accountInfo" data-panel="accountInfo">
							<div ref={accountContentRef} className="account-shell">
								<div data-grid-content-part className="account-heading">
									Account
								</div>
								<div className="account-body">
									<div data-grid-content-part style={{ height: accountHeight }}>
										<PanelContent name="Natural account content" />
									</div>
								</div>
							</div>
						</div>
					</Responsive>
				) : null}
			</main>
		</>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
