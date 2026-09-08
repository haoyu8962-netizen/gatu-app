import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MobileTradeOrderSplit } from "@/components/trade/mobile/mobile-trade-order-split";
import { MobileTradeScrollArea } from "@/components/trade/mobile/mobile-trade-scroll-area";
import "./mobile-orderbook-cls.css";

function Fixture() {
	const [mode, setMode] = useState("market");
	const [feedback, setFeedback] = useState(false);
	const [requests, setRequests] = useState(0);
	return (
		<div className="flex h-svh flex-col">
			<nav className="flex h-[57px] shrink-0 gap-2">
				{["market", "limit", "tall"].map((value) => (
					<button key={value} type="button" onClick={() => setMode(value)}>
						{value}
					</button>
				))}
				<button type="button" onClick={() => setFeedback((value) => !value)}>
					Feedback
				</button>
			</nav>
			<main data-fixture-page className="min-h-0 flex-1 overflow-y-auto">
				<div className="h-[67px]">Market information</div>
				<MobileTradeOrderSplit
					orderbook={
						<div data-fixture-book className="absolute inset-0">
							Order book
						</div>
					}
				>
					<div
						data-fixture-form
						className="flex min-h-0 min-w-0 flex-[1.53] flex-col self-stretch overflow-y-auto overscroll-y-contain"
					>
						<MobileTradeScrollArea embedded>
							<label>
								Size
								<input aria-label="Size" defaultValue="0.25" />
							</label>
							{mode === "limit" ? (
								<label>
									Price
									<input aria-label="Price" defaultValue="100" />
								</label>
							) : null}
							<div style={{ minHeight: mode === "tall" ? 900 : mode === "limit" ? 320 : 280 }}>Order fields</div>
							<label>
								Last field
								<input aria-label="Last field" />
							</label>
							<div>Fees</div>
						</MobileTradeScrollArea>
						<div data-fixture-actions className="shrink-0 px-2.5 py-2">
							{feedback ? <div style={{ height: 600 }}>Requested action feedback</div> : null}
							<button className="h-[38px]" type="button" onClick={() => setRequests((value) => value + 1)}>
								Connect Wallet
							</button>
						</div>
					</div>
				</MobileTradeOrderSplit>
				<section data-fixture-positions className="h-[320px]">
					Positions<output aria-label="Requests">{requests}</output>
				</section>
			</main>
			<footer className="h-[57px] shrink-0">Navigation</footer>
		</div>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
