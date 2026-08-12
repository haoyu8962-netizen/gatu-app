import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function readReferralComponent(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/referrals/${file}`), "utf8");
}

describe("referral 18C and 18D visual contract", () => {
	it("keeps the ready page inside one compact desktop surface", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");

		expect(dashboard).toContain("overflow-hidden rounded-14 bg-surface shadow-sm");
		expect(dashboard).toContain("min-[1001px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)]");
		expect(dashboard).toContain("min-[1001px]:gap-4");
	});

	it("keeps the mobile hierarchy summary, referral, traders, then reward details", () => {
		const dashboard = readReferralComponent("referral-dashboard.tsx");

		expect(dashboard).toContain('className="order-1"');
		expect(dashboard).toContain("order-2 min-[1001px]:order-3");
		expect(dashboard).toContain("order-3 min-[1001px]:order-2");
	});

	it("uses compact bordered summary cards and accessible activation progress", () => {
		const summary = readReferralComponent("referral-summary-cards.tsx");
		const code = readReferralComponent("referral-code-card.tsx");

		expect(summary).toContain("grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4");
		expect(summary).toContain("border border-stroke-weak bg-fill-weak");
		expect(code).toContain('role="progressbar"');
		expect(code).toContain("aria-valuenow={activationProgress ?? 0}");
	});

	it("keeps actions in an adaptive 400px desktop modal and mobile drawer", () => {
		const actionModal = readReferralComponent("referral-action-modal.tsx");

		expect(actionModal).toContain('presentation={isMobile ? "drawer" : "modal"}');
		expect(actionModal).toContain("min-[1001px]:max-w-[25rem]");
		expect(actionModal).toContain("dismissible={!isSubmitting}");
	});
});
