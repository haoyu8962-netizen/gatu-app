import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function readReferralComponent(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/referrals/${file}`), "utf8");
}

function readTerminalSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", file), "utf8");
}

const REFERRAL_COMPONENTS = readdirSync(resolve(TEST_DIR, "../..", "components/referrals"))
	.filter((file) => file.endsWith(".tsx"))
	.sort();

describe("referral UI governance contract", () => {
	it("keeps every data state inside one compact responsive surface", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");

		expect(dashboard).toContain("overflow-hidden rounded-32 bg-surface shadow-raised");
		expect(dashboard.match(/<ReferralSurface/g)).toHaveLength(1);
		expect(dashboard).not.toContain('<div className="mb-4">{header}</div>');
		expect(dashboard).toContain("aria-busy={busy || undefined}");
		expect(dashboard).toContain("min-[1001px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)]");
		expect(dashboard).toContain("min-[1001px]:gap-4");
		expect(dashboard).toContain("} else if (!readyData) {");
		expect(dashboard).toContain(
			"The response could not be verified. No referral action is available until fresh data loads.",
		);
	});

	it("keeps the mobile hierarchy summary, referral, traders, then reward details", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");

		expect(dashboard).toContain('className="order-1"');
		expect(dashboard).toContain("order-2 -mx-4 min-[1001px]:order-3");
		expect(dashboard).toContain("order-3 min-[1001px]:order-2");
	});

	it("uses named typography and radius tokens with accessible activation progress", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");
		const summary = readReferralComponent("referral-summary-cards.tsx");
		const code = readReferralComponent("referral-code-card.tsx");

		expect(dashboard).toContain("text-lg font-bold text-fg");
		expect(summary).toContain("grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4");
		expect(summary).toContain("min-h-[62px] px-3 py-2.5 min-[1001px]:min-h-[74px]");
		expect(summary).not.toContain("bg-fill-weaker");
		expect(summary).toContain("min-[1001px]:text-lg");
		expect(code).toContain('role="progressbar"');
		expect(code).toContain("aria-valuenow={activationProgress ?? 0}");
	});

	it("does not reintroduce arbitrary pixel type or radius values", () => {
		const sources = REFERRAL_COMPONENTS.map(readReferralComponent);

		for (const source of sources) {
			expect(source).not.toMatch(/text-\[/);
			expect(source).not.toMatch(/!?rounded(?:-[a-z]+)?-\[/);
		}
	});

	it("keeps global claims responsive and referral-code actions contextual", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");
		const code = readReferralComponent("referral-code-card.tsx");
		const rewards = readReferralComponent("referral-rewards-card.tsx");

		expect(dashboard.match(/<Trans>Claim rewards<\/Trans>/g)).toHaveLength(2);
		expect(dashboard.match(/data-referral-claim-surface=/g)).toHaveLength(2);
		expect(dashboard).toContain('data-referral-claim-surface="desktop"');
		expect(dashboard).toContain('data-referral-claim-surface="mobile"');
		expect(dashboard).toContain("hidden flex-col items-end gap-1.5 min-[1001px]:flex");
		expect(dashboard).toContain("backdrop-blur min-[1001px]:hidden");
		expect(dashboard).toContain("No unclaimed rewards are currently available.");
		expect(dashboard).toContain("aria-describedby={!referrals.hasUnclaimedRewards ? claimStatusId : undefined}");
		expect(dashboard).not.toContain("Claim all available rewards");
		expect(dashboard).not.toContain("canApplyReferralCode");
		expect(dashboard).not.toContain("<Trans>Enter code</Trans>");
		expect(dashboard).not.toContain("<Trans>Create code</Trans>");
		expect(code).toContain("<Trans>Review invitation</Trans>");
		expect(code).toContain("<Trans>Enter code</Trans>");
		expect(code).toContain("disabled={actionsDisabled}");
		expect(rewards).not.toContain("Claim rewards");
		expect(rewards).not.toContain("onClaim");
	});

	it("labels reward balances by lifecycle and does not duplicate unclaimed rewards", () => {
		const summary = readReferralComponent("referral-summary-cards.tsx");
		const rewards = readReferralComponent("referral-rewards-card.tsx");

		expect(summary).toContain("Lifetime USDC rewards");
		expect(summary).toContain("Unclaimed USDC");
		expect(rewards).toContain("<Trans>Unclaimed</Trans>");
		expect(rewards).toContain("<Trans>Claimed</Trans>");
		expect(rewards).toContain("Builder rewards (cumulative)");
		expect(rewards.match(/reward\.unclaimedRewards/g)).toHaveLength(1);
		expect(rewards).not.toContain("claimableRewards");
		expect(rewards).not.toContain("Total claimable");
	});

	it("keeps structural cards outlined without stacking translucent fills", () => {
		const code = readReferralComponent("referral-code-card.tsx");
		const rewards = readReferralComponent("referral-rewards-card.tsx");

		expect(code).toContain("rounded-20 border border-stroke-weak bg-surface");
		expect(rewards).toContain("rounded-20 border border-stroke-weak bg-surface");
		expect(code).toContain("rounded-16 bg-fill-weaker");
		expect(rewards).toContain('<details className="group mt-3">');
		expect(rewards).not.toContain("group mt-3 rounded-20 bg-fill-weaker");
		expect(rewards).toContain("divide-y divide-stroke-weak border-y border-stroke-weak");
		expect(rewards).toContain("min-[1200px]:grid-cols-4");
		expect(rewards).not.toContain("min-[1001px]:grid-cols-4");
	});

	it("uses a shared dashboard canvas without coupling referrals to portfolio", () => {
		const page = readReferralComponent("referrals-page.tsx");
		const dashboard = readReferralComponent("referral-dashboard.tsx");

		expect(page).toContain('DASHBOARD_FRAMES["/referrals"]');
		expect(DASHBOARD_FRAMES["/referrals"].canvasClassName).toContain("bg-dashboard-canvas");
		expect(dashboard).toContain("bg-dashboard-canvas/95");
		expect(page).not.toContain("portfolio-canvas");
		expect(DASHBOARD_FRAMES["/referrals"].canvasClassName).not.toContain("portfolio-canvas");
		expect(dashboard).not.toContain("portfolio-canvas");
	});

	it("keeps activity flush with the page surface instead of nesting another card", () => {
		const activity = readReferralComponent("referral-activity.tsx");

		expect(activity).toContain("overflow-hidden border-y border-stroke-weak bg-surface");
		expect(activity).not.toContain("overflow-hidden rounded-12 border");
		expect(activity).toContain("min-[1001px]:gap-[18px]");
	});

	it("keeps actions in an adaptive 400px desktop modal and mobile drawer", () => {
		const actionModal = readReferralComponent("referral-action-modal.tsx");

		expect(actionModal).toContain('presentation={isMobile ? "drawer" : "modal"}');
		expect(actionModal).toContain("min-[1001px]:max-w-[25rem]");
		expect(actionModal).toContain("rounded-t-32");
		expect(actionModal).toContain("min-[1001px]:rounded-32");
		expect(actionModal).toContain('handleClassName="top-2 h-1 w-9 !rounded-4 bg-fill/30"');
		expect(actionModal).toContain("dismissible={!isSubmitting}");
	});

	it("remounts referral state when a deep-linked code changes", () => {
		const page = readReferralComponent("referrals-page.tsx");
		const dashboard = readReferralComponent("referral-dashboard.tsx");
		const actionModal = readTerminalSource("components/referrals/referral-action-modal.tsx");
		const joinRoute = readTerminalSource("routes/join.$code.tsx");
		const joinFallback = readTerminalSource("routes/join.$.tsx");
		const viteConfig = readTerminalSource("../vite.config.ts");

		expect(page).toContain('key={initialReferralCode ?? "referrals"}');
		expect(dashboard).toContain('requestAction("apply", initialReferralCode)');
		expect(actionModal).toContain('const isReferralCodeLocked = action === "apply" && initialCode !== undefined;');
		expect(joinRoute).toContain("remountDeps: ({ params }) => ({ code: params.code })");
		expect(joinRoute).toContain("if (!isSafeReferralJoinCode(params.code)) throw notFound()");
		expect(joinRoute).toContain('{ name: "gatu-route", content: "referral-join" }');
		expect(joinRoute).toContain("ssr: false");
		expect(joinFallback).toContain("throw notFound()");
		expect(viteConfig).toContain("name: 'gatu-referral-join-dev-request-guard'");
		expect(viteConfig).toContain("decodeURI(pathname)");
	});
});
