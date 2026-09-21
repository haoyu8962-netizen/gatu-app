// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

type Result = "success" | "rejected" | "apiError" | "unknown";

const testState = vi.hoisted(() => ({
	action: null as null | {
		id: string;
		action: "deposit" | "withdraw";
		state: { stage: string; result: string | null };
		detail: { name: string };
		ownerAddress: string;
		amount: string;
		errorMessage?: string;
		receipt?: { hash: string; finalAmount?: string; commission?: string; closingCost?: string };
	},
	close: vi.fn(),
	retry: vi.fn(),
	modalProps: null as Record<string, unknown> | null,
	rerenderController: null as null | (() => void),
}));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/components/vaults/use-vault-action-controller", async () => {
	const { useReducer } = await import("react");
	return {
		useVaultActionController: () => {
			const [, rerender] = useReducer((count: number) => count + 1, 0);
			testState.rerenderController = rerender;
			return createController();
		},
	};
});

function createController() {
	return {
		action: testState.action,
		availableAmount: "10",
		actionAvailability: {},
		canReview: false,
		canConfirm: false,
		requestAction: vi.fn(),
		setAmount: vi.fn(),
		review: vi.fn(),
		back: vi.fn(),
		confirm: vi.fn(),
		retry: testState.retry,
		verifyAgain: vi.fn(),
		close: testState.close,
	};
}
vi.mock("@/components/vaults/use-vaults-controller", () => ({
	useVaultDetailController: () => ({
		state: "loading",
		detail: null,
		owner: null,
		isRefreshing: false,
		onRetry: vi.fn(),
	}),
	useVaultsController: () => ({}),
}));
vi.mock("@/components/vaults/vault-action-modal", () => ({
	VaultActionModal: (props: Record<string, unknown>) => {
		testState.modalProps = props;
		return createElement("div", { "data-testid": "vault-action-modal" });
	},
}));
vi.mock("@/components/vaults/vaults-fixture", () => ({
	getVaultDetailFixtureFromLocation: () => null,
	getVaultsFixtureFromLocation: () => null,
	VaultDetailFixture: () => null,
	VaultsFixture: () => null,
}));
vi.mock("@/components/dashboard/dashboard-frame-view", () => ({
	DashboardFrameView: ({ main }: { main: ReactNode }) => createElement("main", null, main),
}));
vi.mock("@/components/trade/header/top-nav", () => ({ TopNav: () => null }));
vi.mock("@/components/trade/mobile/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/trade/testnet-banner", () => ({ TestnetBanner: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/lazy", () => ({ createLazyComponent: () => () => null }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => false }));

import { VaultDetailPage } from "@/components/vaults/vaults-page";

const VAULT = "0x1111111111111111111111111111111111111111";

function settledAction(result: Result, id = "vault-action-1") {
	return {
		id,
		action: "withdraw" as const,
		state: { stage: "done", result },
		detail: { name: "Safety Vault" },
		ownerAddress: "0x2222222222222222222222222222222222222222",
		amount: "25",
		errorMessage: result === "apiError" ? "Vault is locked" : undefined,
		receipt:
			result === "success"
				? { hash: `0x${"a".repeat(64)}`, finalAmount: "24.5", commission: "0.3", closingCost: "0.2" }
				: undefined,
	};
}

describe("VaultDetailPage settled outcomes", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.action = null;
		testState.modalProps = null;
		testState.rerenderController = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render() {
		if (testState.rerenderController) {
			act(() => testState.rerenderController?.());
			return;
		}
		act(() => root.render(createElement(VaultDetailPage, { vaultAddress: VAULT })));
	}

	function getDescriptionText(call: unknown[] | undefined): string {
		const options = call?.[1] as { description?: ReactNode } | undefined;
		const host = document.createElement("div");
		const descriptionRoot = createI18nRoot(host);
		act(() => descriptionRoot.render(createElement("span", null, options?.description)));
		const text = host.textContent ?? "";
		act(() => descriptionRoot.unmount());
		return text;
	}

	it("reports a verified transfer once with its final amounts and closes the dialog", () => {
		testState.action = settledAction("success");
		render();
		render();

		expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith("Vault transfer confirmed", expect.anything());
		const description = getDescriptionText(toastMocks.success.mock.calls[0]);
		expect(description).toContain("Final amount: 24.5 USDC");
		expect(description).toContain("Commission: 0.3 USDC");
		expect(description).toContain("Closing cost: 0.2 USDC");
		expect(testState.close).toHaveBeenCalledOnce();
		expect(testState.retry).not.toHaveBeenCalled();
	});

	it.each([
		["rejected", "Authorization rejected"],
		["apiError", "Vault request failed"],
	] as const)("reports a %s request and returns to the review step", (result, title) => {
		testState.action = settledAction(result);
		render();

		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(title, expect.anything());
		expect(testState.retry).toHaveBeenCalledOnce();
		expect(testState.close).not.toHaveBeenCalled();
	});

	it("leaves an unknown result to the in-dialog verification path", () => {
		testState.action = settledAction("unknown");
		render();

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(testState.close).not.toHaveBeenCalled();
		expect(testState.retry).not.toHaveBeenCalled();
		expect(testState.modalProps).toMatchObject({ stage: "done", result: "unknown" });
	});

	it("reports a second action that settles with the same result", () => {
		testState.action = settledAction("apiError", "vault-action-1");
		render();
		testState.action = settledAction("apiError", "vault-action-2");
		render();

		expect(toastMocks.error).toHaveBeenCalledTimes(2);
		expect(testState.retry).toHaveBeenCalledTimes(2);
	});
});
