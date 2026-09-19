import {
	PAIRING_BOOTSTRAP_GLOBAL,
	PAIRING_BOOTSTRAP_VERSION,
	type PairingBootstrapHandoff,
	type PairingScrubResult,
	scrubPairingLocation,
} from "./pairing-location";

export type MobileAgentSyncBootstrapScrubStatus = "not_applicable" | "scrubbed" | "blocked";

const BLOCKED: PairingScrubResult = { status: "blocked", capturedUrl: null };
const HANDOFF_STATUSES = ["none", "captured", "invalid", "blocked"];

function isHandoff(value: unknown): value is PairingBootstrapHandoff {
	if (typeof value !== "object" || value === null) return false;
	const handoff = value as Partial<PairingBootstrapHandoff>;
	return (
		handoff.v === PAIRING_BOOTSTRAP_VERSION &&
		typeof handoff.status === "string" &&
		HANDOFF_STATUSES.includes(handoff.status) &&
		typeof handoff.take === "function"
	);
}

/**
 * The shell's first script normally scrubbed the address already and left its outcome behind. A
 * missing handoff (the inline script was blocked, or the shell predates it) means nothing ran yet,
 * so the same scrub runs here. A handoff this build cannot read, or one that captured a URL it can
 * no longer hand over, means the credential went somewhere unknown: that blocks hydration.
 */
function resolveBootstrapScrub(): PairingScrubResult {
	if (typeof window === "undefined") return { status: "none", capturedUrl: null };

	const handoff: unknown = Reflect.get(window, PAIRING_BOOTSTRAP_GLOBAL);
	if (handoff === undefined) return scrubPairingLocation(window);
	if (!isHandoff(handoff)) return BLOCKED;
	if (handoff.status === "none") return scrubPairingLocation(window);
	if (handoff.status !== "captured") return { status: handoff.status, capturedUrl: null };

	try {
		const capturedUrl = handoff.take();
		return typeof capturedUrl === "string" && capturedUrl !== "" ? { status: "captured", capturedUrl } : BLOCKED;
	} catch {
		return BLOCKED;
	}
}

function toBootstrapStatus(result: PairingScrubResult): MobileAgentSyncBootstrapScrubStatus {
	if (result.status === "blocked") return "blocked";
	return result.status === "none" ? "not_applicable" : "scrubbed";
}

const bootstrapScrub = resolveBootstrapScrub();
let pendingMobileAgentSyncUrl = bootstrapScrub.capturedUrl;
let pendingInvalidMobileAgentSyncLocation = bootstrapScrub.status === "invalid";
bootstrapScrub.capturedUrl = null;

export const mobileAgentSyncBootstrapScrubStatus = toBootstrapStatus(bootstrapScrub);

/**
 * A failed scrub blocks application hydration so providers, telemetry, and the
 * router cannot observe a bearer fragment that is still in the address bar.
 */
export const canHydrateAfterMobileAgentSyncScrub = mobileAgentSyncBootstrapScrubStatus !== "blocked";

/** Returns the scrubbed direct-load URL once, then releases the bearer value. */
export function consumeBootstrappedMobileAgentSyncUrl(): string | null {
	const capturedUrl = pendingMobileAgentSyncUrl;
	pendingMobileAgentSyncUrl = null;
	return capturedUrl;
}

/** Reports a scrubbed query/path credential once without retaining its value. */
export function consumeInvalidBootstrappedMobileAgentSyncLocation(): boolean {
	const invalid = pendingInvalidMobileAgentSyncLocation;
	pendingInvalidMobileAgentSyncLocation = false;
	return invalid;
}
