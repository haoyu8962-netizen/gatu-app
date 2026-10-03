// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReferralClaimHistory } from "@/components/referrals/referral-claim-history";
import { ReferralLegacyHistory } from "@/components/referrals/referral-legacy-history";
import { ReferredTraders } from "@/components/referrals/referred-traders";
import { formatDateTime } from "@/lib/format";
import type { ReferralRewardHistoryItem } from "@/lib/trade/referral";
import { createI18nRoot } from "./harness/react";

const LOCAL_TIME = new Date(2026, 9, 2, 14, 31).getTime();

describe("referral history dates", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
	});

	it.each([
		[
			"claim history",
			() => (
				<ReferralClaimHistory
					rows={[
						{
							amount: "12.5",
							hash: `0x${"a".repeat(64)}`,
							id: "claim-1",
							time: LOCAL_TIME,
							token: "USDC",
							weiDecimals: 8,
						},
					]}
				/>
			),
		],
		[
			"legacy history",
			() => (
				<ReferralLegacyHistory
					rows={[{ earned: "12.5", referralVlm: "1000", time: LOCAL_TIME } as unknown as ReferralRewardHistoryItem]}
				/>
			),
		],
		[
			"referred traders",
			() => (
				<ReferredTraders
					traders={[
						{
							cumFeesRewardedToReferrer: "2",
							cumRewardedFeesSinceReferred: "1",
							cumVlm: "1000",
							timeJoined: LOCAL_TIME,
							tokenToState: [],
							user: `0x${"b".repeat(40)}`,
						},
					]}
					tokenMetadata={null}
				/>
			),
		],
	])("rewrites the %s time in the active language without remounting", (_name, renderHistory) => {
		act(() => root.render(renderHistory()));
		const row = container.firstElementChild?.firstElementChild;
		expect(container.textContent).toContain(formatDateTime(LOCAL_TIME, { locale: "en" }));

		act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));

		expect(container.firstElementChild?.firstElementChild).toBe(row);
		expect(container.textContent).toContain(formatDateTime(LOCAL_TIME, { locale: "zh" }));
		expect(container.textContent).not.toContain(formatDateTime(LOCAL_TIME, { locale: "en" }));
	});
});
