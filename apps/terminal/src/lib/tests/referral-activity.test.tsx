// @vitest-environment jsdom

import type { HTMLAttributes, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralActivity } from "@/components/referrals/referral-activity";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { ReferralData } from "@/lib/trade/referral";

const tabsHarness = vi.hoisted(() => ({
	onValueChange: undefined as ((value: string) => void) | undefined,
}));

vi.mock("@sairn/ui", () => ({
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	Tabs: ({ children, onValueChange }: { children: ReactNode; onValueChange?: (value: string) => void }) => {
		tabsHarness.onValueChange = onValueChange;
		return <div>{children}</div>;
	},
	TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsList: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
		<div role="tablist" {...props}>
			{children}
		</div>
	),
	TabsTrigger: ({ children, value }: { children: ReactNode; value: string }) => (
		<button type="button" data-tab={value} onClick={() => tabsHarness.onValueChange?.(value)}>
			{children}
		</button>
	),
}));

vi.mock("@/components/referrals/referred-traders", () => ({ ReferredTraders: () => null }));
vi.mock("@/components/referrals/referral-claim-history", () => ({ ReferralClaimHistory: () => null }));
vi.mock("@/components/referrals/referral-legacy-history", () => ({ ReferralLegacyHistory: () => null }));

const REFERRAL_DATA = {
	referrerState: { stage: "needToCreateCode" },
	rewardHistory: [],
} as unknown as ReferralData;

describe("ReferralActivity", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		tabsHarness.onValueChange = undefined;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("requests claim history only after the claims tab is selected for the first time", () => {
		const onClaimHistoryRequested = vi.fn();
		act(() => {
			root.render(
				<ReferralActivity
					claimHistory={[]}
					claimHistoryCanConfirmEmpty={false}
					claimHistoryRefreshing={false}
					claimHistoryStatus="idle"
					data={REFERRAL_DATA}
					onClaimHistoryRequested={onClaimHistoryRequested}
					onRetryClaimHistory={vi.fn()}
					onRetrySnapshot={vi.fn()}
					snapshotCurrent
					tokenMetadata={null}
				/>,
			);
		});

		expect(onClaimHistoryRequested).not.toHaveBeenCalled();
		expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Referral activity views");
		act(() => container.querySelector<HTMLButtonElement>('[data-tab="traders"]')?.click());
		expect(onClaimHistoryRequested).not.toHaveBeenCalled();

		act(() => container.querySelector<HTMLButtonElement>('[data-tab="claims"]')?.click());
		expect(onClaimHistoryRequested).toHaveBeenCalledOnce();

		act(() => container.querySelector<HTMLButtonElement>('[data-tab="legacy"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('[data-tab="claims"]')?.click());
		expect(onClaimHistoryRequested).toHaveBeenCalledOnce();
	});
});
