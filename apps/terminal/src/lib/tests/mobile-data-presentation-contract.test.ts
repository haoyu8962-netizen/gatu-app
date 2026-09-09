import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";

const root = resolve(import.meta.dirname, "../../../../..");
const mobile = resolve(root, "apps/terminal/src/components/trade/mobile");

describe("mobile passive data presentation contract", () => {
	it.each(["account-data-unavailable", "account-mode-unresolved", "geo-unresolved", "wallet-session-required"])(
		"suppresses %s without making the action available",
		(reason) => {
			const availability = { available: false, reason, unavailableReason: "Internal data status" };
			expect(getFundsAvailabilityNotice(availability)).toBeNull();
			expect(availability.available).toBe(false);
		},
	);

	it.each([
		"account-mode-unsupported",
		"geo-restricted",
		"external-deposit-disabled",
		"internal-transfers-unavailable",
	])("preserves a confirmed restriction: %s", (reason) => {
		expect(getFundsAvailabilityNotice({ reason, unavailableReason: "Confirmed restriction" })).toBe(
			"Confirmed restriction",
		);
	});

	it("does not reintroduce retired passive warning copy in mobile components", () => {
		const retired = [
			"Balance data is stale",
			"Failed to load balance",
			"Failed to load order book",
			"Failed to load open orders",
			"Failed to load positions",
			"Failed to load TWAP",
			"Failed to load deposits and withdrawals",
			"Trade history updates paused",
			"Order history updates paused",
			"Funding updates paused",
			"TWAP updates paused",
			"Checking regional availability",
			"Deposits and withdrawals are not allowed",
		];
		for (const file of readdirSync(mobile).filter((file) => file.endsWith(".tsx"))) {
			const source = readFileSync(resolve(mobile, file), "utf8");
			for (const text of retired) expect(source, `${file}: ${text}`).not.toContain(text);
		}
	});

	it("keeps the shared modal read-state warnings removed", () => {
		for (const file of [
			"positions/send-modal.tsx",
			"positions/position-isolated-margin-modal.tsx",
			"positions/position-market-close-modal.tsx",
			"positions/position-limit-close-modal.tsx",
			"positions/position-tpsl-modal.tsx",
			"components/spot-swap-modal.tsx",
		]) {
			const source = readFileSync(resolve(mobile, "..", file), "utf8");
			for (const message of [
				"<Trans>Waiting for order book...</Trans>",
				"<Trans>Failed to load order book.</Trans>",
				"t`Live position data is stale.",
				"t`Failed to load positions.",
				"<Trans>Loading account mode...</Trans>",
			])
				expect(source, file).not.toContain(message);
		}
	});

	it("does not couple transfer controls to the presence of a notice", () => {
		const source = readFileSync(resolve(mobile, "../positions/transfer-modal.tsx"), "utf8");
		expect(source).not.toContain("!!internalTransfersDisabledReason");
		expect(source).not.toContain("if (internalTransfersDisabledReason");
	});

	it("requires the presentation policy in project guidance", () => {
		expect(readFileSync(resolve(root, "AGENTS.md"), "utf8")).toContain("docs/mobile-data-presentation.md");
	});
});
