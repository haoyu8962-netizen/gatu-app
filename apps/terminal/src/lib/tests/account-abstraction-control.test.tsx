// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111";

const testState = vi.hoisted(() => ({
	accountAbstraction: "unifiedAccount" as "default" | "disabled" | "unifiedAccount" | "portfolioMargin" | null,
	address: "0x1111111111111111111111111111111111111111" as string | undefined,
	hasWalletAccess: true,
	isAccountAbstractionLoading: false,
	invalidateQueries: vi.fn(),
	mutateAsync: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: testState.invalidateQueries }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: testState.address,
		hasWalletAccess: testState.hasWalletAccess,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	infoKey: (method: string, params: unknown, env: string) => ["hl", "info", method, params, env],
	useExchange: () => ({
		isPending: false,
		mutateAsync: testState.mutateAsync,
	}),
	useHyperliquid: () => ({ env: "Mainnet", isTestnet: false }),
	useHyperliquidClients: () => ({ user: {} }),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useUserAbstraction: () => ({
		data: testState.accountAbstraction,
		isLoading: testState.isAccountAbstractionLoading,
	}),
}));

import { useAccountAbstractionControl } from "@/hooks/trade/use-account-abstraction-control";

describe("useAccountAbstractionControl portfolio margin boundary", () => {
	let container: HTMLDivElement;
	let root: Root;
	let control: ReturnType<typeof useAccountAbstractionControl> | undefined;

	function Probe() {
		control = useAccountAbstractionControl();
		return null;
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		control = undefined;
		testState.accountAbstraction = "unifiedAccount";
		testState.address = USER_ADDRESS;
		testState.hasWalletAccess = true;
		testState.isAccountAbstractionLoading = false;
		testState.invalidateQueries.mockReset();
		testState.invalidateQueries.mockResolvedValue(undefined);
		testState.mutateAsync.mockReset();
		testState.mutateAsync.mockResolvedValue({ status: "ok", response: { type: "default" } });
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.localStorage.clear();
	});

	it("blocks a direct mutation attempt to activate portfolio margin when the build gate is closed", async () => {
		await act(async () => {
			root.render(<Probe />);
		});

		await expect(control?.setAccountAbstraction("portfolioMargin")).rejects.toThrow(
			"Portfolio margin activation is temporarily unavailable",
		);
		expect(testState.mutateAsync).not.toHaveBeenCalled();
		expect(testState.invalidateQueries).not.toHaveBeenCalled();
	});

	it("preserves the protocol default until the user explicitly selects a supported mode", async () => {
		testState.accountAbstraction = "default";
		await act(async () => {
			root.render(<Probe />);
		});

		expect(control?.accountAbstraction).toBe("default");
	});

	it("does not report a disabled account query as loading", async () => {
		testState.address = undefined;
		testState.hasWalletAccess = false;
		testState.accountAbstraction = null;
		await act(async () => {
			root.render(<Probe />);
		});

		expect(control?.isLoading).toBe(false);
	});

	it("allows an existing portfolio margin account to switch away", async () => {
		testState.accountAbstraction = "portfolioMargin";
		await act(async () => {
			root.render(<Probe />);
		});

		await act(async () => {
			await control?.setAccountAbstraction("unifiedAccount");
		});

		expect(testState.mutateAsync).toHaveBeenCalledWith({
			user: USER_ADDRESS,
			abstraction: "unifiedAccount",
		});
		expect(testState.invalidateQueries).toHaveBeenCalledTimes(3);
		expect(testState.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["hl", "info", "userAbstraction", { user: USER_ADDRESS }, "Mainnet"],
			exact: true,
		});
	});
});
