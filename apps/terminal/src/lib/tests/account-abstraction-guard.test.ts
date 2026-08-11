import { describe, expect, it, vi } from "vitest";
import {
	assertFreshAccountAbstraction,
	fetchFreshAccountAbstraction,
} from "@/hooks/trade/use-account-abstraction-guard";

const USER = "0x1111111111111111111111111111111111111111" as const;

describe("account abstraction execution guard", () => {
	it("accepts only the same fresh supported mode", async () => {
		const fetchFresh = vi.fn().mockResolvedValue("unifiedAccount");

		await expect(assertFreshAccountAbstraction("unifiedAccount", USER, fetchFresh)).resolves.toBeUndefined();
		expect(fetchFresh).toHaveBeenCalledWith(USER, undefined);
	});

	it("rejects an unsupported expected mode before fetching", async () => {
		const fetchFresh = vi.fn();

		await expect(assertFreshAccountAbstraction("default", USER, fetchFresh)).rejects.toMatchObject({
			name: "AccountAbstractionExecutionError",
			reason: "unavailable",
		});
		expect(fetchFresh).not.toHaveBeenCalled();
	});

	it("rejects when the mode changes before the SDK boundary", async () => {
		const fetchFresh = vi.fn().mockResolvedValue("disabled");

		await expect(assertFreshAccountAbstraction("unifiedAccount", USER, fetchFresh)).rejects.toMatchObject({
			name: "AccountAbstractionExecutionError",
			reason: "changed",
		});
	});

	it("rejects unknown fresh responses and request failures", async () => {
		await expect(
			assertFreshAccountAbstraction("disabled", USER, vi.fn().mockResolvedValue("unknown")),
		).rejects.toMatchObject({ reason: "unavailable" });
		await expect(
			assertFreshAccountAbstraction("disabled", USER, vi.fn().mockRejectedValue(new Error("offline"))),
		).rejects.toMatchObject({ reason: "unavailable" });
	});

	it("cancels the canonical query around the direct SDK read before updating cache", async () => {
		const queryKey = ["hl", "info", "userAbstraction", { user: USER }, "Mainnet"] as const;
		const cancelQueries = vi.fn().mockResolvedValue(undefined);
		const setQueryData = vi.fn();
		const info = {
			userAbstraction: vi.fn().mockResolvedValue("portfolioMargin"),
		};
		const queryClient = { cancelQueries, setQueryData };

		const result = await fetchFreshAccountAbstraction(queryClient as never, info as never, "Mainnet", USER);

		expect(result).toBe("portfolioMargin");
		expect(info.userAbstraction).toHaveBeenCalledWith({ user: USER }, undefined);
		expect(cancelQueries).toHaveBeenCalledTimes(2);
		expect(cancelQueries).toHaveBeenNthCalledWith(1, { queryKey, exact: true });
		expect(cancelQueries).toHaveBeenNthCalledWith(2, { queryKey, exact: true });
		expect(setQueryData).toHaveBeenCalledWith(queryKey, "portfolioMargin");
	});

	it("does not cache a late SDK response after the execution signal aborts", async () => {
		let resolveSdk = (_value: "disabled") => {};
		const sdkResult = new Promise<"disabled">((resolve) => {
			resolveSdk = resolve;
		});
		const cancelQueries = vi.fn().mockResolvedValue(undefined);
		const setQueryData = vi.fn();
		const info = { userAbstraction: vi.fn().mockReturnValue(sdkResult) };
		const controller = new AbortController();
		const aborted = new Error("execution invalidated");

		const request = fetchFreshAccountAbstraction(
			{ cancelQueries, setQueryData } as never,
			info as never,
			"Mainnet",
			USER,
			controller.signal,
		);
		await Promise.resolve();
		controller.abort(aborted);
		resolveSdk("disabled");

		await expect(request).rejects.toBe(aborted);
		expect(cancelQueries).toHaveBeenCalledTimes(1);
		expect(setQueryData).not.toHaveBeenCalled();
	});
});
