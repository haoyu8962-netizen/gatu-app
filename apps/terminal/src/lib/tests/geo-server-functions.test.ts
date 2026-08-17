import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRequestIP: vi.fn<() => string | undefined>(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: (validate: (input: unknown) => unknown) => ({
			handler: (handler: (options: { data: unknown }) => unknown) => (options: { data?: unknown } | undefined) =>
				handler({ data: validate(options?.data) }),
		}),
	}),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestIP: mocks.getRequestIP,
}));

import { getGeo } from "@/lib/geo/get-geo";
import { getReferralActionGeo } from "@/lib/geo/get-referral-action-geo";

const ALLOWED_IPDATA_RESPONSE = {
	country_code: "GB",
	region_code: "ENG",
	threat: {
		is_anonymous: false,
		is_proxy: false,
		is_tor: false,
	},
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	mocks.getRequestIP.mockReset();
});

describe("geo server functions", () => {
	it("uses the default local verdict without IPdata in development", async () => {
		vi.stubEnv("NODE_ENV", "development");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getGeo({ data: { override: null } })).resolves.toEqual({
			country: "GB",
			proxy: false,
			tradeRestricted: false,
		});
		await expect(getReferralActionGeo({ data: { override: null } })).resolves.toMatchObject({
			country: "GB",
			status: "allowed",
		});
		expect(mocks.getRequestIP).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("preserves restricted development overrides without consulting IPdata", async () => {
		vi.stubEnv("NODE_ENV", "development");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getGeo({ data: { override: "US" } })).resolves.toMatchObject({
			country: "US",
			tradeRestricted: true,
		});
		await expect(getReferralActionGeo({ data: { override: "CA-ON" } })).resolves.toMatchObject({
			country: "CA",
			reason: "jurisdiction",
			status: "blocked",
		});
		expect(mocks.getRequestIP).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("fails closed on a malformed development override without consulting IPdata", async () => {
		vi.stubEnv("NODE_ENV", "development");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getGeo({ data: { override: "not-a-country" } })).rejects.toThrow("Invalid development geo override");
		await expect(getReferralActionGeo({ data: { override: "not-a-country" } })).resolves.toMatchObject({
			reason: "invalid_response",
			status: "unavailable",
		});
		expect(mocks.getRequestIP).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("ignores overrides and requires the provider in production", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("IPDATA_API_KEY", "test-ipdata-key");
		mocks.getRequestIP.mockReturnValueOnce("198.51.100.10").mockReturnValueOnce("198.51.100.11");
		const fetchMock = vi.fn().mockResolvedValue({
			json: async () => ALLOWED_IPDATA_RESPONSE,
			ok: true,
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(getGeo({ data: { override: "US" } })).resolves.toEqual({
			country: "GB",
			proxy: false,
			tradeRestricted: false,
		});
		await expect(getReferralActionGeo({ data: { override: "US" } })).resolves.toMatchObject({
			country: "GB",
			status: "allowed",
		});
		expect(mocks.getRequestIP).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("fails closed when production configuration is unavailable despite an override", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("IPDATA_API_KEY", "");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getGeo({ data: { override: "GB" } })).rejects.toThrow("Geo restriction check unavailable");
		await expect(getReferralActionGeo({ data: { override: "GB" } })).resolves.toMatchObject({
			reason: "missing_config",
			status: "unavailable",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
