import { describe, expect, it } from "vitest";
import { TWAP_ACTIVE_RESERVATION_MAX_AGE_MS, TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS } from "@/domain/trade/twap";
import { getActiveTwapReservationExpiry } from "@/lib/trade/twap-order-asset-reservation";

describe("active TWAP asset reservation expiry", () => {
	it("covers the full official seven-day runtime plus the confirmation window", () => {
		const startedAt = 1_000_000;

		expect(getActiveTwapReservationExpiry(startedAt, 10_080, startedAt)).toBe(
			startedAt + TWAP_ACTIVE_RESERVATION_MAX_AGE_MS + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS,
		);
	});

	it("caps invalid exchange state at seven days instead of the previous 24-hour limit", () => {
		const now = 2_000_000;
		const expiry = getActiveTwapReservationExpiry(now, 20_000, now);

		expect(expiry).toBe(now + TWAP_ACTIVE_RESERVATION_MAX_AGE_MS + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);
		expect(expiry).toBeGreaterThan(now + 24 * 60 * 60 * 1000);
	});
});
