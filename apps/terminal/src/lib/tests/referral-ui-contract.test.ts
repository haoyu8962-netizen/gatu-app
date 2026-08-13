import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function readReferralComponent(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/referrals/${file}`), "utf8");
}

function readTerminalSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", file), "utf8");
}

describe("referral 18C and 18D visual contract", () => {
	it("keeps every data state inside one compact responsive surface", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");

		expect(dashboard).toContain(
			"overflow-hidden rounded-[20px] bg-surface shadow-[0_8px_32px_rgba(20,30,45,0.08)] min-[1001px]:rounded-[14px]",
		);
		expect(dashboard.match(/<ReferralSurface/g)).toHaveLength(1);
		expect(dashboard).not.toContain('<div className="mb-4">{header}</div>');
		expect(dashboard).toContain("aria-busy={busy || undefined}");
		expect(dashboard).toContain("min-[1001px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)]");
		expect(dashboard).toContain("min-[1001px]:gap-4");
	});

	it("keeps the mobile hierarchy summary, referral, traders, then reward details", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");

		expect(dashboard).toContain('className="order-1"');
		expect(dashboard).toContain("order-2 -mx-4 min-[1001px]:order-3");
		expect(dashboard).toContain("order-3 min-[1001px]:order-2");
	});

	it("uses the design typography, exact radii, and accessible activation progress", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");
		const summary = readReferralComponent("referral-summary-cards.tsx");
		const code = readReferralComponent("referral-code-card.tsx");

		expect(dashboard).toContain("text-[18px] leading-6 font-bold text-fg min-[1001px]:text-lg min-[1001px]:leading-7");
		expect(summary).toContain("grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4");
		expect(summary).toContain("min-h-[62px] rounded-[10px] border border-stroke-weak bg-fill-weak");
		expect(summary).toContain("min-[1001px]:text-[22px] min-[1001px]:leading-[1.1]");
		expect(code).toContain('role="progressbar"');
		expect(code).toContain("aria-valuenow={activationProgress ?? 0}");
	});

	it("does not use undefined referral radius utilities", () => {
		const sources = [
			"referral-dashboard.tsx",
			"referral-summary-cards.tsx",
			"referral-code-card.tsx",
			"referral-rewards-card.tsx",
			"referral-activity.tsx",
			"referred-traders.tsx",
			"referral-action-modal.tsx",
		].map(readReferralComponent);

		for (const source of sources) {
			expect(source).not.toMatch(/rounded-(?:10|14)(?:\s|"|')/);
		}
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
		expect(actionModal).toContain("rounded-t-[18px]");
		expect(actionModal).toContain("min-[1001px]:rounded-[16px]");
		expect(actionModal).toContain('handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-fill/30"');
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
		expect(joinRoute).not.toContain("ssr: false");
		expect(joinFallback).toContain("throw notFound()");
		expect(viteConfig).toContain("name: 'gatu-referral-join-dev-request-guard'");
		expect(viteConfig).toContain("decodeURI(pathname)");
	});
});
