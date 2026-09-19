import {
	classifyPairingPath,
	PAIRING_BOOTSTRAP_GLOBAL,
	PAIRING_BOOTSTRAP_VERSION,
	type PairingBootstrapHandoff,
	type PairingScrubResult,
	scrubPairingLocation,
} from "./pairing-location";

const UNSAFE_LINK_NOTICE_KEY = "notice";
const UNSAFE_LINK_NOTICE = "unsafe-link";
/** Where the blocked page sends the browser: a clean pairing page that says why nothing was loaded. */
export const MOBILE_AGENT_SYNC_UNSAFE_LINK_URL = `/mobile-agent-sync?${UNSAFE_LINK_NOTICE_KEY}=${UNSAFE_LINK_NOTICE}`;

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

/**
 * Replaces the blocked entry with the clean pairing page so the link leaves the address bar even
 * when the history entry could not be rewritten. A cause that survives the navigation blocks the
 * target again; staying put once the browser is already there ends that loop.
 */
export function leaveBlockedMobileAgentSyncLink(
	location: Pick<Location, "hash" | "pathname" | "replace" | "search"> = window.location,
): void {
	try {
		if (`${location.pathname}${location.search}` === MOBILE_AGENT_SYNC_UNSAFE_LINK_URL && location.hash === "") return;
		location.replace(MOBILE_AGENT_SYNC_UNSAFE_LINK_URL);
	} catch {}
}

/** Reads the marker the blocked page navigated with, once, and takes it out of the address bar. */
export function consumeUnsafeMobileAgentSyncLinkNotice(): boolean {
	if (typeof window === "undefined") return false;
	const { location, history } = window;
	const params = new URLSearchParams(location.search);
	if (
		classifyPairingPath(location.pathname) !== "pairing" ||
		params.get(UNSAFE_LINK_NOTICE_KEY) !== UNSAFE_LINK_NOTICE
	) {
		return false;
	}
	try {
		params.delete(UNSAFE_LINK_NOTICE_KEY);
		const search = params.toString();
		history.replaceState(history.state, "", `${location.pathname}${search ? `?${search}` : ""}`);
	} catch {}
	return true;
}
