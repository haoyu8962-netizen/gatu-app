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
	"/earn": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-[var(--earn-frame-wide-max)] px-4 py-4 min-[1001px]:px-10 min-[1001px]:py-6",
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
	legal: {
		canvasClassName: "min-h-dvh bg-background font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-3xl px-5 py-8 min-[1001px]:py-12",
	},
} as const satisfies Record<string, DashboardFramePreset>;
