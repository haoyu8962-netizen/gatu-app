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
		"agent-only-session",
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
				"guardMessage = t`Loading...`",
			])
				expect(source, file).not.toContain(message);
		}
	});

	it("keeps the history pages free of passive read-failure banners and empty conclusions", () => {
		for (const file of [
			"../../trade-history/trade-history-page.tsx",
			"../../historical-orders/historical-orders-page.tsx",
			"../../funding-history/funding-history-page.tsx",
		]) {
			const source = readFileSync(resolve(mobile, file), "utf8");
			for (const marker of [
				"Refresh failed.",
				"Previously loaded",
				"bg-warning/",
				"border-warning/",
				'role="alert" className="border-b',
			])
				expect(source, `${file}: ${marker}`).not.toContain(marker);
			expect(source, file).toContain("HistoryPageUnavailable");
		}
		const placeholder = readFileSync(resolve(mobile, "../../ui/history-page-unavailable.tsx"), "utf8");
		for (const marker of ["Icon", "text-error", "text-warning", 'role="alert"'])
			expect(placeholder, `history-page-unavailable.tsx: ${marker}`).not.toContain(marker);
		expect(placeholder).toContain('className="sr-only"');
	});

	it("keeps the desktop deposits and withdrawals tab free of read-failure text", () => {
		const source = readFileSync(resolve(mobile, "../positions/account-transfers-tab.tsx"), "utf8");
		expect(source).not.toContain("Failed to load deposits and withdrawals");
		expect(source).not.toContain('variant="error"');
	});

	it("does not couple transfer controls to the presence of a notice", () => {
		const source = readFileSync(resolve(mobile, "../positions/transfer-modal.tsx"), "utf8");
		expect(source).not.toContain("!!internalTransfersDisabledReason");
		expect(source).not.toContain("if (internalTransfersDisabledReason");
	});

	it("requires the presentation policy in project guidance", () => {
		expect(readFileSync(resolve(root, "AGENTS.md"), "utf8")).toContain("docs/mobile-data-presentation.md");
	});

	describe("staking, referral and Vault pages (desktop and phone)", () => {
		const components = resolve(root, "apps/terminal/src/components");
		const directories = ["staking", "referrals", "vaults"];
		const sources = directories.flatMap((directory) =>
			readdirSync(resolve(components, directory))
				.filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
				.map((file) => ({
					file: `${directory}/${file}`,
					source: readFileSync(resolve(components, directory, file), "utf8"),
				})),
		);

		function count(source: string, marker: string): number {
			return source.split(marker).length - 1;
		}

		it("scans every component directory of these pages", () => {
			for (const directory of directories) {
				expect(
					sources.some(({ file }) => file.startsWith(`${directory}/`)),
					directory,
				).toBe(true);
			}
		});

		it("does not bring back the passive refresh, failure and unknown-value copy", () => {
			const retired = [
				"Refreshing staking data",
				"Refreshing referral data",
				"Refreshing Vault data",
				"Account staking data unavailable",
				"Balances remain unknown",
				"Validator data unavailable",
				"Reward history unavailable",
				"Staking action history unavailable",
				"Estimated APR unavailable",
				"Referral data unavailable",
				"Recent reward claims could not be verified",
				"Vault details are unavailable",
				"Vault data is unavailable",
				"Account Vault data could not be verified",
				"Your Vault balance could not be verified",
				"Retry account data",
				"Verifying the owner Vault balance",
				"until the owner balance is verified",
				"Checking regional availability",
				"Unable to verify regional availability",
				"Verified Vault details are unavailable",
				'"0 HYPE"',
			];
			for (const { file, source } of sources) {
				for (const text of retired) expect(source, `${file}: ${text}`).not.toContain(text);
			}
		});

		it("keeps failure banners and warning icons to the reviewed confirmed states", () => {
			// Each remaining use, with its reason and count. A passive read shows only a neutral Retry.
			const reviewed: Record<string, Record<string, { count: number; reason: string }>> = {
				'role="alert"': {
					"vaults/vaults-page.tsx": { count: 1, reason: "confirmed Vault not found answer, not a read failure" },
					"vaults/vault-action-modal.tsx": {
						count: 2,
						reason: "failure and unknown outcome of a requested Vault transfer (action feedback)",
					},
				},
				WarningCircleIcon: {
					"vaults/vaults-page.tsx": { count: 2, reason: "import and the confirmed Vault not found answer" },
					"vaults/vault-detail-view.tsx": { count: 2, reason: "import and the static Vault risk disclosure" },
					"vaults/vaults-list.tsx": { count: 2, reason: "import and the warning tone of unavailable classification" },
					"vaults/vault-action-modal.tsx": { count: 2, reason: "import and the transfer risk in the action dialog" },
					"referrals/referral-action-modal.tsx": {
						count: 2,
						reason: "import and the signing notice in the action dialog",
					},
				},
			};
			for (const [marker, allowed] of Object.entries(reviewed)) {
				const actual = Object.fromEntries(
					sources
						.filter(({ source }) => count(source, marker) > 0)
						.map(({ file, source }) => [file, count(source, marker)]),
				);
				const expected = Object.fromEntries(Object.entries(allowed).map(([file, entry]) => [file, entry.count]));
				expect(actual, marker).toEqual(expected);
			}
		});

		it("disables Vault actions from availability booleans, not from a displayed explanation", () => {
			const view = sources.find(({ file }) => file === "vaults/vault-detail-view.tsx")?.source ?? "";
			expect(view).not.toMatch(/disabled=\{\w*UnavailableReason\s*!==\s*null\}/);
			expect(view).toContain("const depositDisabled = !actionAvailability.deposit.available || !onRequestAction;");
			expect(view).toContain("const withdrawDisabled = !actionAvailability.withdraw.available || !onRequestAction;");
			expect(view).toContain("isPassiveVaultActionReason(availability.reason)");
		});
	});
});
