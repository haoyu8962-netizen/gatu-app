export interface DashboardFramePreset {
	canvasClassName: string;
	mainClassName: string;
}

export const DASHBOARD_FRAMES = {
	"/portfolio": {
		canvasClassName: "min-h-dvh bg-portfolio-canvas text-fg font-sans",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-6 min-[1001px]:px-8 min-[1200px]:px-16 min-[1001px]:py-8",
	},
	"/vaults": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[var(--earn-frame-wide-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6",
	},
	"/staking": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName:
			"mx-auto w-full max-w-[var(--staking-frame-max)] px-4 py-4 min-[1001px]:px-8 min-[1001px]:py-6 min-[1200px]:px-16",
	},
	"/referrals": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	},
	"/leaderboard": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[var(--earn-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6",
	},
	"/funding-history": {
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	},
	"/historical-orders": {
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	},
	"/api-wallet": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[var(--api-wallet-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6",
	},
	"/trade-history": {
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6",
	},
} as const satisfies Record<string, DashboardFramePreset>;

export function getDashboardFrame(pathname: string): DashboardFramePreset {
	const route = pathname.replace(/\/+$/, "");
	if (route.startsWith("/vaults/")) return DASHBOARD_FRAMES["/vaults"];
	if (route.startsWith("/fundingHistory/")) return DASHBOARD_FRAMES["/funding-history"];
	if (route.startsWith("/historicalOrders/")) return DASHBOARD_FRAMES["/historical-orders"];
	if (route.startsWith("/tradeHistory/") || route.startsWith("/trade-history/"))
		return DASHBOARD_FRAMES["/trade-history"];
	if (route.startsWith("/join/")) return DASHBOARD_FRAMES["/referrals"];
	if (Object.hasOwn(DASHBOARD_FRAMES, route)) return DASHBOARD_FRAMES[route as keyof typeof DASHBOARD_FRAMES];
	return DASHBOARD_FRAMES["/funding-history"];
}

export const DASHBOARD_CONTENT_PLACEHOLDER = {
	className: "space-y-4",
	headingClassName: "h-8 w-48 rounded-8 bg-fill-weak",
	gridClassName: "grid grid-cols-2 gap-3 min-[1001px]:grid-cols-4",
	cardClassName: "h-20 rounded-16 border border-stroke-weak bg-surface",
	cardKeys: ["summary-1", "summary-2", "summary-3", "summary-4"],
	tableClassName: "h-[min(28rem,55dvh)] rounded-20 border border-stroke-weak bg-surface",
} as const;
