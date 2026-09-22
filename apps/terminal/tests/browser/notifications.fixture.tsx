import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { OrderNotificationGate } from "@/components/trade/order-notification-gate";
import { Toaster } from "@/components/ui/sonner";
import { messages as englishMessages } from "@/locales/en/messages.po";
import { messages as chineseMessages } from "@/locales/zh/messages.po";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";
import {
	addOrderQueueItem,
	getOrderQueueItems,
	removeOrderQueueItem,
	updateOrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import { NotificationIdentity, OWNER_A, OWNER_B } from "./notifications.browser";
import "./notifications.css";

function Fixture() {
	const theme = useTheme();
	const setTheme = useSetTheme();
	const [owner, setOwner] = useState(OWNER_A);
	const [route, setRoute] = useState("trade");
	const orders = useOrderQueue();
	function startOrder() {
		addOrderQueueItem({
			owner,
			env: "Mainnet",
			operation: "order",
			market: "HYPE",
			side: "buy",
			size: "1.06",
			price: "92.927",
			status: "pending",
		});
	}
	function fillOrder() {
		const order = getOrderQueueItems().find((entry) => entry.owner === owner && entry.operation === "order");
		if (order) updateOrderQueueItem(order.id, { status: "success", outcome: "filled" });
	}
	function executionResult(longMarket = false) {
		addOrderQueueItem({
			owner,
			env: "Mainnet",
			operation: "order",
			market: longMarket ? "SYNTHETICMARKETWITHANUNBROKENLONGSYMBOL" : "HYPE",
			quoteToken: "USDC",
			side: "buy",
			size: "1.25",
			price: "111",
			status: "success",
			outcome: "filled",
			successDurationMs: 60_000,
			execution: {
				evidence: "exchange-response",
				filledSize: "1.25",
				requestedSize: "1.25",
				averagePrice: "101.125",
				orderIds: [101],
				completeness: "full",
			},
		});
	}
	function rejection(batch = false, withChildren = false) {
		addOrderQueueItem({
			owner,
			env: "Mainnet",
			operation: withChildren ? "close-all" : "order",
			market: "SYNTHETICMARKETWITHANUNBROKENLONGSYMBOL",
			status: "failed",
			children: withChildren
				? Array.from({ length: 20 }, (_, index) => ({
						assetId: index,
						market: `SYNTHETIC-${index + 1}`,
						size: "1",
						status: "rejected" as const,
						error: `Synthetic child rejection ${index + 1}`,
					}))
				: undefined,
			error: batch
				? Array.from(
						{ length: 20 },
						(_, index) =>
							`Synthetic rejection ${index + 1}: the order could not be placed. Reference: SYNTHETICREFERENCEWITHANUNBROKENLONGIDENTIFIER. Review this order before trying again.`,
					).join("\n")
				: "Synthetic rejection: the account could not place this order. Reference: SYNTHETICREFERENCEWITHANUNBROKENLONGIDENTIFIER. Review the order details before trying again.",
		});
	}
	function pending() {
		addOrderQueueItem({
			owner,
			env: "Mainnet",
			market: "HYPE",
			operation: "close-all",
			status: "pending",
			children: [
				{ assetId: 0, market: "HYPE", size: "2", status: "pending" },
				{ assetId: 1, market: "BTC", size: "1", status: "pending" },
			],
		});
	}
	function partial() {
		const order = getOrderQueueItems().find((entry) => entry.owner === owner);
		if (order)
			updateOrderQueueItem(order.id, {
				status: "partial",
				countMode: "filled",
				acceptedCount: 1,
				totalCount: 2,
				children: [
					{ assetId: 0, market: "HYPE", size: "2", filledSize: "1", status: "partial" },
					{ assetId: 1, market: "BTC", size: "1", filledSize: "1", status: "filled" },
				],
			});
	}
	return (
		<NotificationIdentity.Provider value={{ clientKey: owner, env: "Mainnet" }}>
			<Toaster />
			<OrderNotificationGate />
			<main className="p-6 text-fg space-y-4 bg-background min-h-dvh">
				<h1>Notification fixture</h1>
				<p>
					{route} · {owner === OWNER_A ? "Account A" : "Account B"}
				</p>
				<output aria-label="Queued tasks">{orders.length}</output>
				<div className="flex flex-wrap gap-3">
					<button type="button" onClick={() => i18n.loadAndActivate({ locale: "en", messages: englishMessages })}>
						English
					</button>
					<button type="button" onClick={() => i18n.loadAndActivate({ locale: "zh", messages: chineseMessages })}>
						Chinese
					</button>
					<button
						type="button"
						onClick={() => {
							const next = theme === "dark" ? "light" : "dark";
							setTheme(next);
							document.documentElement.classList.toggle("dark", next === "dark");
						}}
					>
						Switch theme
					</button>
					<button type="button" onClick={pending}>
						Start task
					</button>
					<button type="button" onClick={partial}>
						Partial result
					</button>
					<button type="button" onClick={startOrder}>
						Submit synthetic order
					</button>
					<button type="button" onClick={fillOrder}>
						Fill synthetic order
					</button>
					<button type="button" onClick={() => executionResult()}>
						Verified synthetic fill
					</button>
					<button type="button" onClick={() => executionResult(true)}>
						Long market fill
					</button>
					<button type="button" onClick={() => rejection()}>
						Long rejection
					</button>
					<button type="button" onClick={() => rejection(true)}>
						Twenty rejections
					</button>
					<button type="button" onClick={() => rejection(true, true)}>
						Twenty rejections with children
					</button>
					<button
						type="button"
						onClick={() => toast.info("Ordinary notification", { duration: Infinity, closeButton: true })}
					>
						Ordinary notice
					</button>
					<button type="button" onClick={() => setOwner(owner === OWNER_A ? OWNER_B : OWNER_A)}>
						Switch account
					</button>
					<button type="button" onClick={() => setRoute(route === "trade" ? "portfolio" : "trade")}>
						Switch route
					</button>
					<button
						type="button"
						onClick={() => {
							for (const order of getOrderQueueItems()) removeOrderQueueItem(order.id);
							toast.dismiss();
						}}
					>
						Clear
					</button>
				</div>
			</main>
			<nav
				aria-label="Bottom navigation"
				className="fixed bottom-0 inset-x-0 h-14 bg-surface border-t border-stroke-weak min-[1001px]:hidden"
			>
				Market · Trade · Account
			</nav>
		</NotificationIdentity.Provider>
	);
}

i18n.loadAndActivate({ locale: "en", messages: englishMessages });
const element = document.getElementById("root");
if (element)
	createRoot(element).render(
		<StrictMode>
			<I18nProvider i18n={i18n}>
				<Fixture />
			</I18nProvider>
		</StrictMode>,
	);
