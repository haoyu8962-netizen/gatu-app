import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../..");

function readRepositoryFile(path: string): string {
	return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

const terms = readRepositoryFile("legal/terms.md");
const privacy = readRepositoryFile("legal/privacyPolicy.md");
const risk = readRepositoryFile("legal/riskDisclosure.md");
const legalReadme = readRepositoryFile("legal/README.md");

describe("published legal policy contract", () => {
	it("keeps the Terms as the governing source for supplemental policies", () => {
		expect(terms).toContain("laws of England and Wales");
		expect(terms).toMatch(/London\s+Court of International Arbitration \(LCIA\)/);
		expect(privacy).toContain("Section 13.3 of the Terms");
		expect(privacy).not.toContain("Panama's Law");
		expect(risk).toMatch(/If this Risk Disclosure\s+conflicts with the Terms, the Terms control\./);
		expect(legalReadme).toMatch(/Terms of Use]\(.\/terms\.md\) are the controlling contractual document/);
	});

	it("describes current data handling without claiming an unused analytics provider", () => {
		expect(privacy).toContain("**Last Updated:** July 21, 2026");
		expect(privacy).toContain("does not integrate a product-analytics SDK");
		expect(privacy).not.toContain("Mixpanel");
		expect(privacy).toContain("support@gatu.ai");
	});

	it("publishes a completed disclosure for the product's material risk surfaces", () => {
		expect(risk).toContain("**Last Updated:** July 21, 2026");
		expect(risk).not.toContain("DRAFT");
		expect(risk).not.toContain("【");
		for (const topic of [
			"Leverage, Margin, and Liquidation",
			"HIP-3 and Permissionless Markets",
			"Spot Asset and Token Risk",
			"Bridge, Deposit, Withdrawal, and Transfer Risk",
			"Wallet, Agent, and Authorization Risk",
		]) {
			expect(risk).toContain(topic);
		}
	});

	it("does not retain superseded eligibility drafts as competing sources", () => {
		for (const path of [
			"legal/restricted-territories.md",
			"legal/permitted-regions.md",
			"legal/kyc-and-self-attestation.md",
			"legal/法律初筛报告.md",
		]) {
			expect(existsSync(resolve(REPOSITORY_ROOT, path))).toBe(false);
		}
	});

	it("exposes the risk policy and one support address on both sites", () => {
		const terminalRoute = readRepositoryFile("apps/terminal/src/routes/risk.tsx");
		const websitePage = readRepositoryFile("apps/website/src/pages/risk.astro");
		const websiteContentConfig = readRepositoryFile("apps/website/src/content.config.ts");
		const websiteFooter = readRepositoryFile("apps/website/src/components/Footer.astro");

		expect(terminalRoute).toContain('createFileRoute("/risk")');
		expect(websitePage).toContain('path="/risk"');
		expect(websiteContentConfig).toContain('"riskDisclosure.md"');
		expect(websiteFooter).toContain("mailto:support@gatu.ai");
		expect(websiteFooter).not.toContain("hi@gatu.ai");
	});
});
