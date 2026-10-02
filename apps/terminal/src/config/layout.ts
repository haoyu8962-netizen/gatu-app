export const MOBILE_BREAKPOINT_PX = 1000;
/** Matches the desktop surface; the mobile query in `hooks/use-mobile.ts` is its complement. */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${MOBILE_BREAKPOINT_PX + 1}px)`;

/**
 * Desktop top navigation (ADR 0013). At or below the compact width a connected header shrinks its
 * logo, deposit button, address and utilities, and the Soon placeholder leaves the top level; the
 * `nav-compact` Tailwind variant in `styles.css` must carry the same pixel value. The widest connected
 * header measured in `tests/browser/top-nav-connected.pw.ts` keeps 16px from 1370px; 1379 adds 10px for
 * platform text metrics (runtime guardrails §11). At or below the narrow width every wallet state moves the
 * lower-priority entries into More.
 */
export const DESKTOP_NAV_COMPACT_MAX_PX = 1379;
export const DESKTOP_NAV_NARROW_MAX_PX = 1150;
export const DESKTOP_NAV_COMPACT_MEDIA_QUERY = `(max-width: ${DESKTOP_NAV_COMPACT_MAX_PX}px)`;
export const DESKTOP_NAV_NARROW_MEDIA_QUERY = `(max-width: ${DESKTOP_NAV_NARROW_MAX_PX}px)`;

export const SIDEBAR_LAYOUT = {
	WIDTH: "16rem",
	WIDTH_MOBILE: "18rem",
	WIDTH_ICON: "3rem",
	KEYBOARD_SHORTCUT: "b",
} as const;

export const TOKEN_SELECTOR_ROW_HEIGHT_PX = 48;
export const TOKEN_SELECTOR_OVERSCAN = 10;

export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 56;

export const APP_HEADER_HEIGHT_CLASS = "h-14";
export const APP_FOOTER_HEIGHT_CLASS = "h-8";
export const APP_BANNER_HEIGHT_CLASS = "h-8";
export const APP_HEADER_OFFSET_CLASS = "pt-14";
// = header + banner stack height (h-14 + h-8 = 3.5rem + 2rem)
export const APP_HEADER_PLUS_BANNER_OFFSET_CLASS = "pt-[5.5rem]";
export const APP_BAR_BUTTON_HEIGHT_CLASS = "h-8 min-h-8";
export const HEADER_ACCOUNT_CONTROL_HEIGHT_CLASS = "h-9 min-h-9 max-h-9";
export const HEADER_TOUCH_HIT_AREA_CLASS =
	"relative after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-['']";
