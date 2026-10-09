// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
const PUBLIC_KEY = privateKeyToAccount(PRIVATE_KEY).address.toLowerCase() as `0x${string}`;

const testState = vi.hoisted(() => ({
	isAgentReady: false,
	agentVerificationStatus: "missing" as "unknown" | "loading" | "ready" | "missing" | "error",
	localAgent: null as { privateKey: `0x${string}`; publicKey: `0x${string}`; source: "local-registration" } | null,
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({ env: "Mainnet", clientKey: OWNER }),
}));

vi.mock("@sairn/hl-react/signing/use-agent-status", () => ({
	useAgentStatus: () => ({
		isAgentReady: testState.isAgentReady,
		agentVerificationStatus: testState.agentVerificationStatus,
	}),
}));

vi.mock("@sairn/hl-react/signing/agent-storage", () => ({
	useAgentWalletStorage: () => testState.localAgent,
}));

import { useAgentWallet } from "../../../../../packages/hl-react/src/signing/use-agent-wallet";

let observed: ReturnType<typeof useAgentWallet> | undefined;

function Probe() {
	observed = useAgentWallet();
	return null;
}

describe("useAgentWallet readiness", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		container = document.createElement("div");
		root = createRoot(container);
		observed = undefined;
		testState.isAgentReady = false;
		testState.agentVerificationStatus = "missing";
		testState.localAgent = { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY, source: "local-registration" };
	});

	afterEach(() => {
		act(() => root.unmount());
	});

	function render() {
		act(() => root.render(createElement(Probe)));
		if (!observed) throw new Error("hook did not render");
		return observed;
	}

	it.each(["unknown", "loading", "missing", "error"] as const)(
		"offers no signer and no key while verification is %s",
		(agentVerificationStatus) => {
			testState.agentVerificationStatus = agentVerificationStatus;
			const wallet = render();

			expect(wallet.isReady).toBe(false);
			expect(wallet.signer).toBeNull();
			expect(wallet.data).toBeNull();
			expect(wallet.address).toBe(PUBLIC_KEY);
		},
	);

	it("offers the signer of the stored key only once the exchange confirmed it", () => {
		testState.isAgentReady = true;
		testState.agentVerificationStatus = "ready";
		const wallet = render();

		expect(wallet.isReady).toBe(true);
		expect(wallet.signer?.address.toLowerCase()).toBe(PUBLIC_KEY);
		expect(wallet.data?.publicKey).toBe(PUBLIC_KEY);
	});

	it("is never ready without a stored key, whatever the status says", () => {
		testState.isAgentReady = true;
		testState.agentVerificationStatus = "ready";
		testState.localAgent = null;
		const wallet = render();

		expect(wallet.isReady).toBe(false);
		expect(wallet.signer).toBeNull();
		expect(wallet.address).toBeNull();
	});
});
