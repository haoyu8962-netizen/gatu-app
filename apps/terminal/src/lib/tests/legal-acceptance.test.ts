import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { acceptHyperliquidTerms, parseLegalStatus } from "../../../../../packages/hl-react/src/legal";

const USER = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a" as const;
const OTHER_USER = "0x0000000000000000000000000000000000000001" as const;
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;

describe("Hyperliquid legal acceptance", () => {
	it.each([
		["n", true, true, true],
		["a", false, true, true],
		["o", true, false, true],
		["u", true, false, false],
		["future", false, false, false],
		[undefined, false, false, false],
	] as const)(
		"derives capabilities for restriction %s",
		(restrictions, canPerformActions, canViewOutcomeMarkets, canUseReferrals) => {
			const status = parseLegalStatus({ acceptedTerms: true, userAllowed: true, restrictions });

			expect(status).toMatchObject({
				acceptedTerms: true,
				userAllowed: true,
				canPerformActions,
				canViewOutcomeMarkets,
				canUseReferrals,
			});
		},
	);

	it("fails closed when the user is not allowed", () => {
		expect(parseLegalStatus({ acceptedTerms: true, userAllowed: false, restrictions: "n" })).toMatchObject({
			canPerformActions: false,
			canViewOutcomeMarkets: false,
			canUseReferrals: false,
		});
	});

	it("signs and submits the production acceptTerms2 contract", async () => {
		const request = vi.fn().mockResolvedValue(null);
		const transport = { isTestnet: false, request };

		const payload = await acceptHyperliquidTerms({
			wallet: privateKeyToAccount(PRIVATE_KEY),
			transport,
			env: "Mainnet",
			user: USER,
			time: 1_722_000_000_000,
		});

		expect(payload).toMatchObject({
			type: "acceptTerms2",
			user: USER,
			time: 1_722_000_000_000,
			signatureChainId: "0x1",
			signature: {
				r: expect.stringMatching(/^0x[0-9a-f]{64}$/),
				s: expect.stringMatching(/^0x[0-9a-f]{64}$/),
				v: expect.toBeOneOf([27, 28]),
			},
		});
		expect(request).toHaveBeenCalledWith("info", payload);
	});

	it("rejects a mismatched wallet before submitting", async () => {
		const request = vi.fn();

		await expect(
			acceptHyperliquidTerms({
				wallet: privateKeyToAccount(PRIVATE_KEY),
				transport: { isTestnet: false, request },
				env: "Mainnet",
				user: OTHER_USER,
			}),
		).rejects.toThrow("Selected wallet does not match the connected account");
		expect(request).not.toHaveBeenCalled();
	});
});
