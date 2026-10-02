import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(TEST_DIR, "../..");

interface Caller {
	trigger: "automatic" | "explicit";
	reason: string;
	calls: number;
}

const CREATION_CALLERS: Record<string, Caller> = {
	"providers/email-embedded-wallet-provider.tsx": {
		trigger: "automatic",
		reason: "the only automatic creation: once per email session, never after a failure",
		calls: 1,
	},
	"hooks/trade/use-legal-gate.ts": {
		trigger: "explicit",
		reason: "Retry in the wallet setup state of the policy dialog",
		calls: 1,
	},
	"hooks/wallet/use-wallet-session.ts": {
		trigger: "explicit",
		reason: "Reconnect wallet for an email session that has no wallet yet",
		calls: 1,
	},
	"components/trade/tradebox/deposit-modal.tsx": {
		trigger: "explicit",
		reason: "the funding address Retry button",
		calls: 1,
	},
};

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" || entry.name === "__tests__" ? [] : listSourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

function countCreationCalls(source: string): number {
	return source.match(/ensureEmailEmbeddedWallet\(\)/g)?.length ?? 0;
}

const CALLS_BY_FILE = Object.fromEntries(
	listSourceFiles(SOURCE_DIR)
		.map((path) => [relative(SOURCE_DIR, path), countCreationCalls(readFileSync(path, "utf8"))] as const)
		.filter(([, calls]) => calls > 0),
);

describe("email wallet creation ownership", () => {
	it("registers every place that can start an email wallet creation", () => {
		expect(CALLS_BY_FILE).toEqual(
			Object.fromEntries(Object.entries(CREATION_CALLERS).map(([file, caller]) => [file, caller.calls])),
		);
	});

	it("keeps a single automatic creator, so a failed creation is never retried without the user", () => {
		const automatic = Object.entries(CREATION_CALLERS).filter(([, caller]) => caller.trigger === "automatic");

		expect(automatic.map(([file]) => file)).toEqual(["providers/email-embedded-wallet-provider.tsx"]);
		for (const caller of Object.values(CREATION_CALLERS)) expect(caller.reason).not.toBe("");
	});

	it("starts the deposit dialog's creation only from its Retry control", () => {
		const depositModal = readFileSync(resolve(SOURCE_DIR, "components/trade/tradebox/deposit-modal.tsx"), "utf8");
		const retryHandler = depositModal.slice(depositModal.indexOf("onRetryFundingAddress={"));

		expect(retryHandler.slice(0, 120)).toContain("ensureEmailEmbeddedWallet()");
	});
});
