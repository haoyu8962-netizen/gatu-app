import { describe, expect, it, vi } from "vitest";
import {
	assertFreshFundsActionGeo,
	getFundsActionGeoStatus,
	getInternalTransferAvailability,
	getWithdrawalAvailability,
} from "@/domain/trade/funds-action-availability";

const allowedInput = {
	accountDataReady: true,
	accountModeStatus: "supported" as const,
	geoStatus: "allowed" as const,
	hasWalletAccess: true,
};

const unavailableMessage = "Unable to verify regional availability. This funds action was not submitted.";
const restrictedMessage = "Funds actions are not available in your region. This funds action was not submitted.";

describe("funds action availability", () => {
	it.each([
		{
			expected: "wallet-session-required",
			input: { ...allowedInput, hasWalletAccess: false },
		},
		{
			expected: "geo-restricted",
			input: { ...allowedInput, geoStatus: "restricted" as const },
		},
		{
			expected: "geo-unresolved",
			input: { ...allowedInput, geoStatus: "unresolved" as const },
		},
		{
			expected: "account-mode-unresolved",
			input: { ...allowedInput, accountModeStatus: "unresolved" as const },
		},
		{
			expected: "account-mode-unsupported",
			input: { ...allowedInput, accountModeStatus: "unsupported" as const },
		},
		{
			expected: "account-data-unavailable",
			input: { ...allowedInput, accountDataReady: false },
		},
	])("fails withdrawal closed with $expected", ({ expected, input }) => {
		expect(getWithdrawalAvailability({ ...input, fundsActionsEnabled: true })).toEqual({
			available: false,
			reason: expected,
		});
	});

	it("distinguishes account-specific withdrawal support from shared prerequisites", () => {
		expect(getWithdrawalAvailability({ ...allowedInput, fundsActionsEnabled: false })).toEqual({
			available: false,
			reason: "funds-actions-unavailable",
		});
		expect(getWithdrawalAvailability({ ...allowedInput, fundsActionsEnabled: true })).toEqual({
			available: true,
			reason: null,
		});
	});

	it.each([
		{ get: getWithdrawalAvailability, name: "withdrawal" },
		{ get: getInternalTransferAvailability, name: "internal transfer" },
	])("reports an agent-only session as a confirmed restriction for $name", ({ get }) => {
		const agentOnlyInput = {
			...allowedInput,
			fundsActionsEnabled: true,
			hasWalletAccess: false,
			internalTransfersEnabled: true,
			sessionMode: "agent-only" as const,
		};
		expect(get(agentOnlyInput)).toEqual({ available: false, reason: "agent-only-session" });
		expect(get({ ...agentOnlyInput, geoStatus: "restricted" })).toEqual({
			available: false,
			reason: "geo-restricted",
		});
		expect(get({ ...agentOnlyInput, geoStatus: "unresolved" })).toEqual({
			available: false,
			reason: "geo-unresolved",
		});
		expect(get({ ...agentOnlyInput, sessionMode: "disconnected" })).toEqual({
			available: false,
			reason: "wallet-session-required",
		});
		expect(get({ ...agentOnlyInput, hasWalletAccess: true, sessionMode: "wallet" })).toEqual({
			available: true,
			reason: null,
		});
	});

	it("reports geo restrictions before asking for a wallet connection", () => {
		expect(
			getWithdrawalAvailability({
				...allowedInput,
				fundsActionsEnabled: true,
				geoStatus: "restricted",
				hasWalletAccess: false,
			}),
		).toEqual({ available: false, reason: "geo-restricted" });
		expect(
			getWithdrawalAvailability({
				...allowedInput,
				fundsActionsEnabled: true,
				geoStatus: "unresolved",
				hasWalletAccess: false,
			}),
		).toEqual({ available: false, reason: "geo-unresolved" });
	});

	it("blocks internal transfers in shared-balance account modes", () => {
		expect(getInternalTransferAvailability({ ...allowedInput, internalTransfersEnabled: false })).toEqual({
			available: false,
			reason: "internal-transfers-unavailable",
		});
		expect(getInternalTransferAvailability({ ...allowedInput, internalTransfersEnabled: true })).toEqual({
			available: true,
			reason: null,
		});
	});

	it.each([
		{ expected: "unresolved", input: { isResolved: false, proxy: false, tradeRestricted: false } },
		{ expected: "restricted", input: { isResolved: true, proxy: false, tradeRestricted: true } },
		{ expected: "restricted", input: { isResolved: true, proxy: true, tradeRestricted: false } },
		{ expected: "allowed", input: { isResolved: true, proxy: false, tradeRestricted: false } },
	] as const)("derives the $expected geo state", ({ expected, input }) => {
		expect(getFundsActionGeoStatus(input)).toBe(expected);
	});
});

describe("fresh funds action geo guard", () => {
	it("allows only a complete unrestricted server verdict", async () => {
		const refresh = vi.fn().mockResolvedValue({
			data: { country: "GB", proxy: false, tradeRestricted: false },
			isError: false,
		});

		await expect(
			assertFreshFundsActionGeo({
				refresh,
				restrictedMessage,
				signal: new AbortController().signal,
				unavailableMessage,
			}),
		).resolves.toBeUndefined();
		expect(refresh).toHaveBeenCalledOnce();
	});

	it.each([
		{ data: { country: "GB", proxy: false, tradeRestricted: false }, isError: true },
		{ data: { country: null, proxy: false, tradeRestricted: false }, isError: false },
		{ data: { country: "gb", proxy: false, tradeRestricted: false }, isError: false },
		{ data: { country: "GB", proxy: undefined, tradeRestricted: false }, isError: false },
		{ data: { country: "GB", proxy: false, tradeRestricted: undefined }, isError: false },
	])("fails closed on an invalid or failed refresh: %#", async (result) => {
		await expect(
			assertFreshFundsActionGeo({
				refresh: vi.fn().mockResolvedValue(result),
				restrictedMessage,
				signal: new AbortController().signal,
				unavailableMessage,
			}),
		).rejects.toThrow(unavailableMessage);
	});

	it.each([
		{ country: "US", proxy: false, tradeRestricted: true },
		{ country: "GB", proxy: true, tradeRestricted: false },
	])("blocks a restricted or proxy verdict: %#", async (data) => {
		await expect(
			assertFreshFundsActionGeo({
				refresh: vi.fn().mockResolvedValue({ data, isError: false }),
				restrictedMessage,
				signal: new AbortController().signal,
				unavailableMessage,
			}),
		).rejects.toThrow(restrictedMessage);
	});

	it("maps a refresh rejection to a generic availability error", async () => {
		await expect(
			assertFreshFundsActionGeo({
				refresh: vi.fn().mockRejectedValue(new Error("provider detail")),
				restrictedMessage,
				signal: new AbortController().signal,
				unavailableMessage,
			}),
		).rejects.toThrow(unavailableMessage);
	});

	it("honors cancellation before and after the server refresh", async () => {
		const beforeController = new AbortController();
		const beforeReason = new Error("cancelled before refresh");
		beforeController.abort(beforeReason);
		const refreshBefore = vi.fn();
		await expect(
			assertFreshFundsActionGeo({
				refresh: refreshBefore,
				restrictedMessage,
				signal: beforeController.signal,
				unavailableMessage,
			}),
		).rejects.toBe(beforeReason);
		expect(refreshBefore).not.toHaveBeenCalled();

		let resolveRefresh!: (result: {
			data: { country: string; proxy: boolean; tradeRestricted: boolean };
			isError: boolean;
		}) => void;
		const refreshAfter = vi.fn(
			() =>
				new Promise<{
					data: { country: string; proxy: boolean; tradeRestricted: boolean };
					isError: boolean;
				}>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		const afterController = new AbortController();
		const afterReason = new Error("cancelled after refresh");
		const guard = assertFreshFundsActionGeo({
			refresh: refreshAfter,
			restrictedMessage,
			signal: afterController.signal,
			unavailableMessage,
		});
		await vi.waitFor(() => expect(refreshAfter).toHaveBeenCalledOnce());
		afterController.abort(afterReason);
		resolveRefresh({ data: { country: "GB", proxy: false, tradeRestricted: false }, isError: false });
		await expect(guard).rejects.toBe(afterReason);
	});
});
