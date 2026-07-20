import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TEST_DIR = __dirname;
const TERMINAL_ROOT = resolve(TEST_DIR, "../../..");
const REPOSITORY_ROOT = resolve(TERMINAL_ROOT, "../..");
const terms = readFileSync(resolve(REPOSITORY_ROOT, "legal/terms.md"), "utf8");

describe("Gatu Terms of Use", () => {
	it("uses Gatu legal identities and routes", () => {
		expect(terms).toContain("Gatu Corp.");
		expect(terms).toContain("https://app.gatu.ai");
		expect(terms).toContain("support@gatu.ai");
		expect(terms).toContain("https://app.gatu.ai/privacy");
		expect(terms).not.toContain("app.hyperliquid.xyz");
		expect(terms).not.toContain("support@hyperliquid.zendesk.com");
	});

	it("covers the services exposed by the Interface", () => {
		expect(terms).toContain("HIP-3 builder-deployed perpetual markets");
		expect(terms).toMatch(/embedded,\s+smart-wallet, account-abstraction/);
		expect(terms).toContain("builder fees");
		expect(terms).toContain("cross-chain transfers");
	});

	it("retains the core legal sections", () => {
		for (const heading of [
			"## 2. Eligibility and Access Restrictions",
			"## 3. No Warranties and Assumption of Risk",
			"## 4. Prohibited Activities",
			"## 12. Limitation of Liability",
			"## 13. Arbitration and Class-Action Waiver",
		]) {
			expect(terms).toContain(heading);
		}
	});
});
