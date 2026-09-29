import { i18n } from "@lingui/core";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import type { VaultListItem } from "@/components/vaults/domain/vaults";
import { VaultsList } from "@/components/vaults/vaults-list";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages as en } from "@/locales/en/messages.po";
import { messages as zh } from "@/locales/zh/messages.po";
import "./vaults-list.css";

const FETCHED_AT = Date.UTC(2026, 8, 29, 3, 0, 0);
const DAY_MS = 86_400_000;

const ROWS: readonly VaultListItem[] = [
	createRow(1, "Hyperliquidity Provider (HLP)", "183000000", "0.0406", 1243),
	createRow(2, "[ Systemic Strategies ] ♾️ HyperGrowth ♾️", "6440000", "-0.0957", 395),
	createRow(3, "Quantitative Market Neutral Strategy", "980000", "0.1212", 88),
	createRow(4, "drkmttr", "13400000", "1.4309", 293),
];

function createRow(index: number, name: string, tvl: string, apr: string, ageDays: number): VaultListItem {
	return {
		vaultAddress: `0x${index.toString(16).padStart(40, "0")}`,
		leader: `0x${(index + 256).toString(16).padStart(40, "0")}`,
		name,
		tvl,
		apr,
		createdAt: FETCHED_AT - ageDays * DAY_MS,
		isClosed: false,
		relationship: "normal",
		pnlByPeriod: {
			day: ["0", "1200"],
			week: ["0", "-4200"],
			month: ["0", "-24000", "58000"],
			allTime: ["0", "910000"],
		},
		classification: null,
	};
}

function Fixture() {
	return (
		<DashboardFrameView
			{...DASHBOARD_FRAMES["/vaults"]}
			header={null}
			headerOffset={false}
			main={
				<VaultsList
					state="normal"
					rows={ROWS}
					account={{ status: "disconnected" }}
					fetchedAt={FETCHED_AT}
					onRetry={() => undefined}
				/>
			}
		/>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
const locale = new URLSearchParams(location.search).get("locale") === "zh" ? "zh" : "en";
i18n.loadAndActivate({ locale, messages: locale === "zh" ? zh : en });
document.documentElement.lang = locale;
const router = createRouter({
	routeTree: createRootRoute({ component: Fixture }),
	history: createMemoryHistory({ initialEntries: ["/"] }),
});
createI18nRoot(root).render(<RouterProvider router={router} />);
