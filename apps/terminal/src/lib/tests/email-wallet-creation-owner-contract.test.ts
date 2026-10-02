import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(TEST_DIR, "../..");
const CREATION_HOOK = "hooks/wallet/use-email-embedded-wallet.ts";

interface Caller {
	trigger: "automatic" | "explicit";
	reason: string;
	references: number;
}

/**
 * Every source file that mentions `ensureEmailEmbeddedWallet`, with how often. A new reference, an
 * alias or a function handed to another hook changes a count, so it has to be registered here with
 * its trigger. `references` counts the identifier, not only direct calls.
 */
const CREATION_CALLERS: Record<string, Caller> = {
	"providers/email-embedded-wallet-provider.tsx": {
		trigger: "automatic",
		reason: "the only automatic creation: once per email session, never after a failure",
		references: 3,
	},
	"hooks/trade/use-legal-gate.ts": {
		trigger: "explicit",
		reason: "Retry in the wallet setup state of the policy dialog",
		references: 2,
	},
	"hooks/wallet/use-wallet-session.ts": {
		trigger: "explicit",
		reason: "Reconnect wallet for an email session that has no wallet yet",
		references: 3,
	},
	"components/trade/tradebox/deposit-modal.tsx": {
		trigger: "explicit",
		reason: "the funding address Retry button",
		references: 2,
	},
};

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" || entry.name === "__tests__" ? [] : listSourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}

const SOURCES = listSourceFiles(SOURCE_DIR).map((path) => ({
	file: relative(SOURCE_DIR, path),
	source: readFileSync(path, "utf8"),
}));

function collect(pattern: RegExp): Record<string, number> {
	return Object.fromEntries(
		SOURCES.map(({ file, source }) => [file, countMatches(source, pattern)] as const).filter(([, count]) => count > 0),
	);
}

describe("email wallet creation ownership", () => {
	it("registers every reference to the shared creation outside the hook that defines it", () => {
		const { [CREATION_HOOK]: definedIn, ...references } = collect(/\bensureEmailEmbeddedWallet\b/g);

		expect(definedIn).toBe(2);
		expect(references).toEqual(
			Object.fromEntries(Object.entries(CREATION_CALLERS).map(([file, caller]) => [file, caller.references])),
		);
	});

	it("keeps a single automatic creator, so a failed creation is never retried without the user", () => {
		const automatic = Object.entries(CREATION_CALLERS).filter(([, caller]) => caller.trigger === "automatic");

		expect(automatic.map(([file]) => file)).toEqual(["providers/email-embedded-wallet-provider.tsx"]);
		for (const caller of Object.values(CREATION_CALLERS)) expect(caller.reason).not.toBe("");
	});

	it("lets only the shared hook reach Privy's wallet creation", () => {
		expect(Object.keys(collect(/\buseCreateWallet\b/g))).toEqual([CREATION_HOOK]);
		expect(collect(/\bcreateWallet\b/g)).toEqual({ [CREATION_HOOK]: 3 });
	});

	it("starts the deposit dialog's creation only from its Retry control", () => {
		const depositModal = SOURCES.find(({ file }) => file === "components/trade/tradebox/deposit-modal.tsx")?.source;
		const retryHandler = depositModal?.slice(depositModal.indexOf("onRetryFundingAddress={"));

		expect(retryHandler?.slice(0, 120)).toContain("ensureEmailEmbeddedWallet()");
	});
});
