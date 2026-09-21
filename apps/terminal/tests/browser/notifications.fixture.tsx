import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { OrderNotificationHost } from "@/components/trade/order-notification-host";
import { Toaster } from "@/components/ui/sonner";
import {
	addOrderQueueItem,
	getOrderQueueItems,
	removeOrderQueueItem,
	updateOrderQueueItem,
} from "@/stores/use-order-queue-store";
import { useTheme, useSetTheme } from "@/stores/use-global-settings-store";
import { NotificationIdentity, OWNER_A, OWNER_B } from "./notifications.browser";
import "../../src/styles.css";

function Fixture() {
	const theme = useTheme();
	const setTheme = useSetTheme();
	const [owner, setOwner] = useState(OWNER_A);
	const [route, setRoute] = useState("trade");
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
			<OrderNotificationHost />
			<main className="p-6 text-fg space-y-4 bg-background min-h-dvh">
				<h1>Notification fixture</h1>
				<p>
					{route} · {owner === OWNER_A ? "Account A" : "Account B"}
				</p>
				<div className="flex flex-wrap gap-3">
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

i18n.loadAndActivate({ locale: "en", messages: {} });
const element = document.getElementById("root");
if (element)
	createRoot(element).render(
		<I18nProvider i18n={i18n}>
			<Fixture />
		</I18nProvider>,
	);
