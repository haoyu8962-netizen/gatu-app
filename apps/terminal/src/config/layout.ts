export const MOBILE_BREAKPOINT_PX = 768;

export const PANEL_LAYOUT = {
	MAIN: {
		id: "CHART_WITH_SWAPBOX",
		analysis: { defaultSize: 77, minSize: 50 },
		sidebar: { defaultSize: 23, minSize: 18 },
	},
	ANALYSIS: {
		id: "CHART_WITH_POSITIONS",
		chart: { defaultSize: 55, disconnectedSize: 70, minSize: 40 },
		positions: { defaultSize: 45, disconnectedSize: 30, minSize: 15 },
	},
	MARKET: {
		id: "CHART_WITH_ORDERBOOK",
		chart: { defaultSize: 76, minSize: 40 },
		orderbook: { defaultSize: 24, minSize: 20 },
	},
} as const;

export const SIDEBAR_LAYOUT = {
	WIDTH: "16rem",
	WIDTH_MOBILE: "18rem",
	WIDTH_ICON: "3rem",
	KEYBOARD_SHORTCUT: "b",
} as const;

export const TOKEN_SELECTOR_ROW_HEIGHT_PX = 48;
export const TOKEN_SELECTOR_OVERSCAN = 10;

export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 56;

export const APP_HEADER_HEIGHT_CLASS = "h-11";
export const APP_FOOTER_HEIGHT_CLASS = "h-8";
export const APP_BANNER_HEIGHT_CLASS = "h-8";
export const APP_HEADER_OFFSET_CLASS = "pt-11";
// = header + banner stack height (h-11 + h-8 = 2.75rem + 2rem)
export const APP_HEADER_PLUS_BANNER_OFFSET_CLASS = "pt-[4.75rem]";
export const APP_BAR_BUTTON_HEIGHT_CLASS = "h-8 min-h-8";
