// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralSummaryCards } from "@/components/referrals/referral-summary-cards";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import type { ReferralData } from "@/lib/trade/referral";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({ formatLocale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => mocks.formatLocale,
}));

const DATA = {
	referrerState: { stage: "ready", data: { nReferrals: 1234, referralStates: [] } },
	unclaimedRewards: "98765.4",
	tokenToState: [],
	rewardHistory: [],
} as unknown as ReferralData;

describe("ReferralSummaryCards", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.formatLocale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function getValues(): string[] {
		return Array.from(container.querySelectorAll("article")).map((card) => card.lastElementChild?.textContent ?? "");
	}

	it("rewrites every summary figure in place when the number format changes", () => {
		act(() => root.render(<ReferralSummaryCards data={DATA} discountPercent="12.5" usdcRewardsEarned="4321.5" />));
		const section = container.querySelector("section");
		expect(getValues()).toEqual(["1,234", "4,321.50 USDC", "98,765.40 USDC", "12.50%"]);

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());

		expect(container.querySelector("section")).toBe(section);
		expect(getValues()).toEqual(["1.234", "4.321,50 USDC", "98.765,40 USDC", "12,50%"]);

		mocks.formatLocale = "fr-FR";
		act(() => notifyNumberFormatChange());

		expect(getValues()).toEqual(["1 234", "4 321,50 USDC", "98 765,40 USDC", "12,50%"]);
	});
});
