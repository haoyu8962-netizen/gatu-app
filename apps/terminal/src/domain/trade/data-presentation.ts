interface FundsAvailability {
	reason: string | null;
	unavailableReason: string | null;
}

const PASSIVE_DATA_REASONS = new Set([
	"account-data-unavailable",
	"account-mode-unavailable",
	"geo-unresolved",
	"wallet-session-required",
]);

export function getFundsAvailabilityNotice(availability: FundsAvailability): string | null {
	return availability.reason && PASSIVE_DATA_REASONS.has(availability.reason) ? null : availability.unavailableReason;
}
