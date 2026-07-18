import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TRIGGER_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/chart/token-selector-trigger.tsx"),
	"utf8",
);
const MOBILE_MARKET_BAR_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-market-bar.tsx"),
	"utf8",
);

describe("token selector visual contract", () => {
	it("uses the market as the primary toolbar label", () => {
		expect(TRIGGER_SOURCE).toContain('iconClassName="size-5"');
		expect(TRIGGER_SOURCE).toContain("shrink-0 whitespace-nowrap text-lg font-normal");
		expect(TRIGGER_SOURCE).toContain('kindBadge === "Perp" && leverageLabel');
		expect(TRIGGER_SOURCE).not.toContain("max-w-[34vw]");
		expect(TRIGGER_SOURCE).not.toContain("min-w-[82px]");
	});

	it("keeps the complete market pair visible in narrow viewports", () => {
		expect(TRIGGER_SOURCE).toContain("whitespace-nowrap text-lg leading-[30px] font-normal");
		expect(TRIGGER_SOURCE).not.toContain("max-w-[42vw] truncate");
		expect(TRIGGER_SOURCE).not.toContain("max-[340px]:text-sm");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("grid-cols-[minmax(max-content,1fr)_minmax(0,1fr)]");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("grid-cols-[minmax(0,1fr)_2rem]");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("whitespace-normal font-sans text-xs leading-[15px]");
		expect(MOBILE_MARKET_BAR_SOURCE).toContain("rounded-xs border border-stroke-weak/80");
	});

	it("keeps every trigger state visible without changing selector behavior", () => {
		expect(TRIGGER_SOURCE).toContain("inline-flex h-10");
		expect(TRIGGER_SOURCE).toContain("hover:bg-fill-hover");
		expect(TRIGGER_SOURCE).toContain("active:bg-fill-press");
		expect(TRIGGER_SOURCE).toContain("aria-expanded:bg-fill-hover");
		expect(TRIGGER_SOURCE).toContain("focus-visible:ring-stroke-focus");
		expect(TRIGGER_SOURCE).toContain('open ? "rotate-180" : ""');
	});
});
