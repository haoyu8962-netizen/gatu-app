import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as chrome from "@/components/trade/mobile/mobile-chrome-classes";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TRIGGER_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/chart/token-selector-trigger.tsx"),
	"utf8",
);
const DESKTOP_TRIGGER_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/chart/token-selector-trigger-view.tsx"),
	"utf8",
);
const MOBILE_MARKET_BAR_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-market-bar.tsx"),
	"utf8",
);

describe("token selector visual contract", () => {
	it("uses the market and metadata pills as the primary toolbar label", () => {
		expect(TRIGGER_SOURCE).toContain('iconClassName="size-7"');
		expect(TRIGGER_SOURCE).toContain("mobileChrome.marketName");
		expect(chrome.marketName).toContain("whitespace-nowrap text-base leading-5 font-bold");
		expect(TRIGGER_SOURCE).toContain("!isSpot && leverageLabel");
		expect(TRIGGER_SOURCE).toContain("t`Spot`");
		expect(TRIGGER_SOURCE).toContain("t`Perp`");
		expect(TRIGGER_SOURCE).toContain("bg-trading-panel-success-soft text-trading-panel-success");
		expect(TRIGGER_SOURCE).not.toContain("max-w-[34vw]");
		expect(TRIGGER_SOURCE).not.toContain("min-w-[82px]");
	});

	it("keeps the complete market pair visible in narrow viewports", () => {
		expect(TRIGGER_SOURCE).toContain("mobileChrome.marketName");
		expect(chrome.marketName).toContain("whitespace-nowrap text-base leading-5 font-bold");
		expect(TRIGGER_SOURCE).toContain("mobileChrome.marketName");
		expect(chrome.marketName).toContain("max-[360px]:text-[13px]");
		expect(TRIGGER_SOURCE).not.toContain("max-w-[42vw] truncate");
		expect(TRIGGER_SOURCE).not.toContain("max-[340px]:text-sm");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("mobileChrome.marketGrid");
		expect(chrome.marketGrid).toContain("grid-cols-2 items-center gap-x-4 px-4 py-2.5");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("mobileChrome.marketQuote");
		expect(chrome.marketQuote).toContain("grid-cols-[minmax(0,1fr)_36px]");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("mobileChrome.marketChange");
		expect(chrome.marketChange).toContain("whitespace-normal text-[11px] leading-[15px] font-semibold");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("mobileChrome.marketExpand");
		expect(chrome.marketExpand).toContain("h-[30px] w-9");
	});

	it("keeps every trigger state visible without changing selector behavior", () => {
		expect(DESKTOP_TRIGGER_SOURCE).toContain("inline-flex h-9");
		expect(DESKTOP_TRIGGER_SOURCE).toContain("hover:bg-trading-panel-hover");
		expect(DESKTOP_TRIGGER_SOURCE).toContain("active:bg-fill-press");
		expect(DESKTOP_TRIGGER_SOURCE).toContain("aria-expanded:bg-trading-panel-hover");
		expect(DESKTOP_TRIGGER_SOURCE).toContain("focus-visible:ring-stroke-focus");
		expect(DESKTOP_TRIGGER_SOURCE).toContain('open && "rotate-180"');
	});
});
